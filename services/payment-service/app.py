# app.py
# Payment Service - Flask microservice with Service Bus integration
# Following PRP patterns for async messaging and security

from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import logging
import os
import uuid
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import json
from werkzeug.exceptions import HTTPException

# Azure imports
from azure.servicebus import ServiceBusClient, ServiceBusMessage
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

# Security and validation
from marshmallow import Schema, fields, ValidationError
import jwt
from functools import wraps

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Flask app configuration
app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

# CORS configuration (following PRP requirement #5)
CORS(app, origins=os.environ.get('ALLOWED_ORIGINS', '*').split(','))

# Global services
credential = DefaultAzureCredential()
key_vault_client = None
servicebus_client = None
payment_queue_sender = None

# Initialize Azure services
def initialize_azure_services():
    global key_vault_client, servicebus_client, payment_queue_sender
    
    try:
        # Initialize Key Vault client
        key_vault_url = os.environ.get('KEY_VAULT_URL')
        if key_vault_url:
            key_vault_client = SecretClient(vault_url=key_vault_url, credential=credential)
            logger.info('Key Vault client initialized')
        
        # Initialize Service Bus client
        connection_string = os.environ.get('SERVICE_BUS_CONNECTION_STRING')
        if not connection_string and key_vault_client:
            try:
                secret = key_vault_client.get_secret('servicebus-connection-string')
                connection_string = secret.value
            except Exception as e:
                logger.warning(f'Failed to get Service Bus connection string from Key Vault: {e}')
        
        if connection_string:
            servicebus_client = ServiceBusClient.from_connection_string(connection_string)
            payment_queue_sender = servicebus_client.get_queue_sender('payment-processing')
            logger.info('Service Bus client initialized')
        
    except Exception as e:
        logger.error(f'Failed to initialize Azure services: {e}')
        raise

# Validation schemas
class PaymentRequestSchema(Schema):
    order_id = fields.Str(required=True)
    amount = fields.Float(required=True, validate=lambda x: x > 0)
    currency = fields.Str(required=True, validate=lambda x: len(x) == 3)
    customer_id = fields.Str(required=True)
    payment_method = fields.Str(required=True, validate=lambda x: x in ['credit_card', 'debit_card', 'paypal', 'bank_transfer'])
    card_token = fields.Str(required=False)  # Tokenized card data
    billing_address = fields.Dict(required=True)

class RefundRequestSchema(Schema):
    payment_id = fields.Str(required=True)
    amount = fields.Float(required=False, validate=lambda x: x > 0)  # Partial refund if specified
    reason = fields.Str(required=True)

# Authentication decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        
        if not token:
            return jsonify({'error': 'Token missing'}), 401
        
        if not token.startswith('Bearer '):
            return jsonify({'error': 'Invalid token format'}), 401
        
        try:
            token = token[7:]  # Remove 'Bearer ' prefix
            # In production, verify JWT token properly
            # For demo, we'll use a simple validation
            jwt_secret = get_jwt_secret()
            data = jwt.decode(token, jwt_secret, algorithms=['HS256'])
            current_user = data['sub']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token invalid'}), 401
        except Exception as e:
            logger.error(f'Token validation error: {e}')
            return jsonify({'error': 'Token validation failed'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

def get_jwt_secret() -> str:
    """Get JWT secret from Key Vault or environment"""
    try:
        if key_vault_client:
            secret = key_vault_client.get_secret('jwt-secret')
            return secret.value
    except Exception as e:
        logger.warning(f'Failed to get JWT secret from Key Vault: {e}')
    
    secret = os.environ.get('JWT_SECRET', 'default-secret-change-in-production')
    if secret == 'default-secret-change-in-production':
        logger.warning('Using default JWT secret - change in production!')
    
    return secret

# Health endpoints (following PRP requirement #6)
@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint for Kubernetes liveness probe"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0',
        'environment': os.environ.get('ENVIRONMENT', 'dev')
    }), 200

@app.route('/ready', methods=['GET'])
def ready():
    """Readiness check endpoint for Kubernetes readiness probe"""
    try:
        # Check Service Bus connection
        if servicebus_client:
            # Simple check - if client exists and queue sender is initialized
            if payment_queue_sender:
                status = 'ready'
            else:
                status = 'not ready'
                return jsonify({
                    'status': status,
                    'timestamp': datetime.utcnow().isoformat(),
                    'error': 'Service Bus queue sender not initialized'
                }), 503
        else:
            status = 'not ready'
            return jsonify({
                'status': status,
                'timestamp': datetime.utcnow().isoformat(),
                'error': 'Service Bus client not initialized'
            }), 503
        
        return jsonify({
            'status': status,
            'timestamp': datetime.utcnow().isoformat(),
            'version': '1.0.0',
            'environment': os.environ.get('ENVIRONMENT', 'dev')
        }), 200
    except Exception as e:
        logger.error(f'Readiness check failed: {e}')
        return jsonify({
            'status': 'not ready',
            'timestamp': datetime.utcnow().isoformat(),
            'error': str(e)
        }), 503

@app.route('/startup', methods=['GET'])
def startup():
    """Startup probe endpoint for Kubernetes"""
    return jsonify({
        'status': 'started',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0',
        'environment': os.environ.get('ENVIRONMENT', 'dev')
    }), 200

# Payment simulation functions
def simulate_payment_processing(payment_data: Dict[str, Any]) -> Dict[str, Any]:
    """Simulate payment processing with external payment gateway"""
    
    # Simulate processing time
    time.sleep(0.1)  # 100ms processing time
    
    # Simulate success/failure based on amount (for demo purposes)
    amount = payment_data['amount']
    
    # Simulate failures for certain amounts (testing purposes)
    if amount == 999.99:
        return {
            'status': 'failed',
            'error_code': 'INSUFFICIENT_FUNDS',
            'error_message': 'Insufficient funds'
        }
    elif amount == 888.88:
        return {
            'status': 'failed',
            'error_code': 'CARD_DECLINED',
            'error_message': 'Card declined by issuer'
        }
    elif amount >= 10000:
        return {
            'status': 'failed',
            'error_code': 'AMOUNT_TOO_HIGH',
            'error_message': 'Amount exceeds daily limit'
        }
    
    # Generate transaction ID
    transaction_id = f'txn_{uuid.uuid4().hex[:12]}'
    
    return {
        'status': 'succeeded',
        'transaction_id': transaction_id,
        'authorization_code': f'auth_{uuid.uuid4().hex[:8]}',
        'processed_at': datetime.utcnow().isoformat()
    }

async def publish_payment_result(payment_data: Dict[str, Any], result: Dict[str, Any]):
    """Publish payment result to Service Bus"""
    if not servicebus_client or not payment_queue_sender:
        logger.warning('Service Bus not configured, skipping message publish')
        return
    
    try:
        message_body = {
            'event_type': 'payment.processed',
            'payment_id': payment_data.get('payment_id'),
            'order_id': payment_data.get('order_id'),
            'customer_id': payment_data.get('customer_id'),
            'amount': payment_data.get('amount'),
            'currency': payment_data.get('currency'),
            'status': result.get('status'),
            'transaction_id': result.get('transaction_id'),
            'authorization_code': result.get('authorization_code'),
            'error_code': result.get('error_code'),
            'error_message': result.get('error_message'),
            'processed_at': result.get('processed_at', datetime.utcnow().isoformat()),
            'source': 'payment-service'
        }
        
        message = ServiceBusMessage(
            json.dumps(message_body),
            content_type='application/json',
            correlation_id=payment_data.get('order_id'),
            message_id=f"payment_{payment_data.get('payment_id')}_{int(time.time())}"
        )
        
        payment_queue_sender.send_messages(message)
        logger.info(f"Published payment result for order {payment_data.get('order_id')}")
        
    except Exception as e:
        logger.error(f"Failed to publish payment result: {e}")

# Payment API endpoints
@app.route('/api/payments', methods=['POST'])
@token_required
def process_payment(current_user):
    """Process a payment request"""
    try:
        # Validate request data
        schema = PaymentRequestSchema()
        payment_data = schema.load(request.json)
        
        # Generate payment ID
        payment_id = str(uuid.uuid4())
        payment_data['payment_id'] = payment_id
        payment_data['customer_id'] = current_user  # From JWT token
        
        logger.info(f'Processing payment {payment_id} for order {payment_data["order_id"]}')
        
        # Simulate payment processing
        processing_result = simulate_payment_processing(payment_data)
        
        # Prepare response
        response_data = {
            'payment_id': payment_id,
            'order_id': payment_data['order_id'],
            'amount': payment_data['amount'],
            'currency': payment_data['currency'],
            'status': processing_result['status'],
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Add success-specific fields
        if processing_result['status'] == 'succeeded':
            response_data.update({
                'transaction_id': processing_result['transaction_id'],
                'authorization_code': processing_result['authorization_code'],
                'processed_at': processing_result['processed_at']
            })
            status_code = 201
        else:
            # Add failure-specific fields
            response_data.update({
                'error_code': processing_result['error_code'],
                'error_message': processing_result['error_message']
            })
            status_code = 402  # Payment Required
        
        # Publish result to Service Bus asynchronously
        asyncio.create_task(publish_payment_result(payment_data, processing_result))
        
        logger.info(f'Payment {payment_id} processed with status: {processing_result["status"]}')
        
        return jsonify(response_data), status_code
        
    except ValidationError as e:
        logger.warning(f'Payment validation error: {e.messages}')
        return jsonify({'error': 'Validation error', 'details': e.messages}), 400
    except Exception as e:
        logger.error(f'Payment processing error: {e}')
        return jsonify({'error': 'Payment processing failed'}), 500

@app.route('/api/payments/<payment_id>', methods=['GET'])
@token_required
def get_payment(current_user, payment_id):
    """Get payment details by ID"""
    # In a real implementation, this would query a database
    # For demo purposes, return a simulated response
    return jsonify({
        'payment_id': payment_id,
        'status': 'succeeded',
        'message': 'Payment lookup not implemented in demo'
    }), 200

@app.route('/api/payments/<payment_id>/refund', methods=['POST'])
@token_required
def refund_payment(current_user, payment_id):
    """Process a refund request"""
    try:
        # Validate request data
        schema = RefundRequestSchema()
        refund_data = schema.load(request.json)
        
        # Generate refund ID
        refund_id = str(uuid.uuid4())
        
        logger.info(f'Processing refund {refund_id} for payment {payment_id}')
        
        # Simulate refund processing
        refund_result = {
            'refund_id': refund_id,
            'payment_id': payment_id,
            'status': 'succeeded',
            'refund_amount': refund_data.get('amount', 0),
            'reason': refund_data['reason'],
            'processed_at': datetime.utcnow().isoformat()
        }
        
        logger.info(f'Refund {refund_id} processed successfully')
        
        return jsonify(refund_result), 201
        
    except ValidationError as e:
        logger.warning(f'Refund validation error: {e.messages}')
        return jsonify({'error': 'Validation error', 'details': e.messages}), 400
    except Exception as e:
        logger.error(f'Refund processing error: {e}')
        return jsonify({'error': 'Refund processing failed'}), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'error': 'Not Found',
        'message': f'Route {request.method} {request.path} not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f'Internal server error: {error}')
    return jsonify({
        'error': 'Internal Server Error',
        'message': 'An unexpected error occurred'
    }), 500

@app.errorhandler(HTTPException)
def handle_http_exception(e):
    return jsonify({
        'error': e.name,
        'message': e.description
    }), e.code

# Application factory pattern
def create_app():
    initialize_azure_services()
    return app

if __name__ == '__main__':
    # Initialize Azure services
    initialize_azure_services()
    
    # Run the application
    port = int(os.environ.get('PORT', 8002))
    debug = os.environ.get('ENVIRONMENT', 'dev') == 'dev'
    
    logger.info(f'Starting Payment Service on port {port}')
    logger.info(f'Environment: {os.environ.get("ENVIRONMENT", "dev")}')
    
    app.run(host='0.0.0.0', port=port, debug=debug)