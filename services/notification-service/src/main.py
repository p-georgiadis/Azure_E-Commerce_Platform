# src/main.py
# Notification Service - Python service with Event Hub integration
# Following PRP patterns from /examples/scripts/health-check.py for async patterns

import asyncio
import json
import logging
import os
import signal
import sys
from datetime import datetime
from typing import Dict, Any, List, Optional
import uuid
import smtplib
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart

# Azure imports
from azure.eventhub.aio import EventHubConsumerClient
from azure.eventhub import EventData
from azure.servicebus.aio import ServiceBusClient
from azure.identity.aio import DefaultAzureCredential
from azure.keyvault.secrets.aio import SecretClient

# FastAPI for health endpoints
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

# Pydantic models
from pydantic import BaseModel
from dataclasses import dataclass
from enum import Enum

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class NotificationType(Enum):
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"

class NotificationTemplate(Enum):
    ORDER_CREATED = "order_created"
    ORDER_CONFIRMED = "order_confirmed"
    ORDER_SHIPPED = "order_shipped"
    ORDER_DELIVERED = "order_delivered"
    ORDER_CANCELLED = "order_cancelled"
    PAYMENT_SUCCESS = "payment_success"
    PAYMENT_FAILED = "payment_failed"
    REFUND_PROCESSED = "refund_processed"

@dataclass
class NotificationEvent:
    id: str
    event_type: str
    customer_id: str
    customer_email: str
    template: NotificationTemplate
    data: Dict[str, Any]
    timestamp: datetime
    priority: int = 1  # 1=high, 2=medium, 3=low

class NotificationService:
    def __init__(self):
        self.credential = DefaultAzureCredential()
        self.key_vault_client: Optional[SecretClient] = None
        self.eventhub_client: Optional[EventHubConsumerClient] = None
        self.servicebus_client: Optional[ServiceBusClient] = None
        self.smtp_config: Dict[str, Any] = {}
        self.running = True
        
        # Email templates
        self.email_templates = {
            NotificationTemplate.ORDER_CREATED: {
                'subject': 'Order Confirmation - #{order_number}',
                'template': '''
                <h2>Thank you for your order!</h2>
                <p>Dear {customer_name},</p>
                <p>Your order #{order_number} has been created successfully.</p>
                <p><strong>Order Details:</strong></p>
                <ul>
                    <li>Total Amount: {total_amount} {currency}</li>
                    <li>Items: {item_count}</li>
                </ul>
                <p>We'll send you another email when your order ships.</p>
                <p>Best regards,<br>E-Commerce Platform Team</p>
                '''
            },
            NotificationTemplate.ORDER_SHIPPED: {
                'subject': 'Your Order #{order_number} has Shipped!',
                'template': '''
                <h2>Your order is on its way!</h2>
                <p>Dear {customer_name},</p>
                <p>Great news! Your order #{order_number} has been shipped and is on its way to you.</p>
                <p><strong>Tracking Information:</strong></p>
                <p>Tracking Number: {tracking_number}</p>
                <p>Estimated Delivery: {estimated_delivery}</p>
                <p>Best regards,<br>E-Commerce Platform Team</p>
                '''
            },
            NotificationTemplate.PAYMENT_FAILED: {
                'subject': 'Payment Failed for Order #{order_number}',
                'template': '''
                <h2>Payment Issue with Your Order</h2>
                <p>Dear {customer_name},</p>
                <p>We were unable to process the payment for your order #{order_number}.</p>
                <p><strong>Reason:</strong> {failure_reason}</p>
                <p>Please update your payment method to complete your order.</p>
                <p>Best regards,<br>E-Commerce Platform Team</p>
                '''
            }
        }
    
    async def initialize(self):
        """Initialize Azure services and configurations"""
        try:
            logger.info("Initializing Notification Service...")
            
            # Initialize Key Vault client
            key_vault_url = os.environ.get('KEY_VAULT_URL')
            if key_vault_url:
                self.key_vault_client = SecretClient(vault_url=key_vault_url, credential=self.credential)
                logger.info("Key Vault client initialized")
            
            # Initialize SMTP configuration
            await self._load_smtp_config()
            
            # Initialize Event Hub consumer client
            await self._initialize_eventhub()
            
            # Initialize Service Bus client for order events
            await self._initialize_servicebus()
            
            logger.info("Notification Service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize Notification Service: {e}")
            raise

    async def _load_smtp_config(self):
        """Load SMTP configuration from Key Vault or environment"""
        try:
            if self.key_vault_client:
                # Try to get SMTP configuration from Key Vault
                smtp_password_secret = await self.key_vault_client.get_secret('smtp-password')
                smtp_username_secret = await self.key_vault_client.get_secret('smtp-username')
                
                self.smtp_config = {
                    'server': os.environ.get('SMTP_SERVER', 'smtp.gmail.com'),
                    'port': int(os.environ.get('SMTP_PORT', '587')),
                    'username': smtp_username_secret.value,
                    'password': smtp_password_secret.value,
                    'use_tls': os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'
                }
                logger.info("SMTP configuration loaded from Key Vault")
            else:
                # Fallback to environment variables
                self.smtp_config = {
                    'server': os.environ.get('SMTP_SERVER', 'smtp.gmail.com'),
                    'port': int(os.environ.get('SMTP_PORT', '587')),
                    'username': os.environ.get('SMTP_USERNAME', ''),
                    'password': os.environ.get('SMTP_PASSWORD', ''),
                    'use_tls': os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'
                }
                logger.info("SMTP configuration loaded from environment variables")
                
        except Exception as e:
            logger.warning(f"Failed to load SMTP configuration: {e}")
            # Use mock configuration for testing
            self.smtp_config = {
                'server': 'mock',
                'port': 587,
                'username': 'test@example.com',
                'password': 'test',
                'use_tls': True
            }

    async def _initialize_eventhub(self):
        """Initialize Event Hub consumer client"""
        try:
            # Get Event Hub connection string
            connection_string = os.environ.get('EVENT_HUB_CONNECTION_STRING')
            
            if not connection_string and self.key_vault_client:
                secret = await self.key_vault_client.get_secret('eventhub-connection-string')
                connection_string = secret.value
            
            if connection_string:
                eventhub_name = os.environ.get('EVENT_HUB_NAME', 'system-events')
                consumer_group = os.environ.get('CONSUMER_GROUP', 'notification-service')
                
                self.eventhub_client = EventHubConsumerClient.from_connection_string(
                    connection_string,
                    consumer_group=consumer_group,
                    eventhub_name=eventhub_name
                )
                logger.info("Event Hub consumer client initialized")
            else:
                logger.warning("Event Hub connection string not found")
                
        except Exception as e:
            logger.error(f"Failed to initialize Event Hub client: {e}")

    async def _initialize_servicebus(self):
        """Initialize Service Bus client for order events"""
        try:
            # Get Service Bus connection string
            connection_string = os.environ.get('SERVICE_BUS_CONNECTION_STRING')
            
            if not connection_string and self.key_vault_client:
                secret = await self.key_vault_client.get_secret('servicebus-connection-string')
                connection_string = secret.value
            
            if connection_string:
                self.servicebus_client = ServiceBusClient.from_connection_string(connection_string)
                logger.info("Service Bus client initialized")
            else:
                logger.warning("Service Bus connection string not found")
                
        except Exception as e:
            logger.error(f"Failed to initialize Service Bus client: {e}")

    async def send_email_notification(self, notification: NotificationEvent) -> bool:
        """Send email notification"""
        try:
            if self.smtp_config['server'] == 'mock':
                # Mock email sending for testing
                logger.info(f"MOCK: Sending email to {notification.customer_email} - {notification.template.value}")
                return True
            
            # Get email template
            template_config = self.email_templates.get(notification.template)
            if not template_config:
                logger.warning(f"No email template found for {notification.template}")
                return False
            
            # Format subject and body
            subject = template_config['subject'].format(**notification.data)
            body = template_config['template'].format(**notification.data)
            
            # Create email message
            msg = MimeMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = self.smtp_config['username']
            msg['To'] = notification.customer_email
            
            # Add HTML content
            html_part = MimeText(body, 'html')
            msg.attach(html_part)
            
            # Send email
            with smtplib.SMTP(self.smtp_config['server'], self.smtp_config['port']) as server:
                if self.smtp_config['use_tls']:
                    server.starttls()
                server.login(self.smtp_config['username'], self.smtp_config['password'])
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {notification.customer_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email notification: {e}")
            return False

    async def process_order_event(self, event_data: Dict[str, Any]):
        """Process order-related events"""
        try:
            event_type = event_data.get('eventType', '')
            data = event_data.get('data', {})
            
            # Map event types to notification templates
            template_mapping = {
                'order.created': NotificationTemplate.ORDER_CREATED,
                'order.status_changed': self._get_status_template(data.get('newStatus')),
                'order.cancelled': NotificationTemplate.ORDER_CANCELLED,
            }
            
            template = template_mapping.get(event_type)
            if not template:
                logger.debug(f"No notification template for event type: {event_type}")
                return
            
            # Create notification event
            notification = NotificationEvent(
                id=str(uuid.uuid4()),
                event_type=event_type,
                customer_id=data.get('customerId', ''),
                customer_email=data.get('customerEmail', ''),
                template=template,
                data={
                    'customer_name': data.get('customerName', 'Valued Customer'),
                    'order_number': data.get('orderNumber', 'N/A'),
                    'total_amount': data.get('totalAmount', 0),
                    'currency': data.get('currency', 'USD'),
                    'item_count': data.get('itemCount', 0),
                    'tracking_number': data.get('trackingNumber', ''),
                    'estimated_delivery': data.get('estimatedDelivery', '')
                },
                timestamp=datetime.utcnow(),
                priority=1 if event_type == 'order.cancelled' else 2
            )
            
            # Send notification
            success = await self.send_email_notification(notification)
            
            if success:
                logger.info(f"Notification sent for {event_type} - Order {data.get('orderNumber')}")
            else:
                logger.error(f"Failed to send notification for {event_type} - Order {data.get('orderNumber')}")
                
        except Exception as e:
            logger.error(f"Error processing order event: {e}")

    async def process_payment_event(self, event_data: Dict[str, Any]):
        """Process payment-related events"""
        try:
            event_type = event_data.get('event_type', '')
            
            if event_type == 'payment.processed':
                payment_status = event_data.get('status')
                
                if payment_status == 'failed':
                    # Send payment failure notification
                    notification = NotificationEvent(
                        id=str(uuid.uuid4()),
                        event_type=event_type,
                        customer_id=event_data.get('customer_id', ''),
                        customer_email=event_data.get('customer_email', ''),
                        template=NotificationTemplate.PAYMENT_FAILED,
                        data={
                            'customer_name': 'Valued Customer',
                            'order_number': event_data.get('order_id', 'N/A'),
                            'failure_reason': event_data.get('error_message', 'Payment processing failed')
                        },
                        timestamp=datetime.utcnow(),
                        priority=1  # High priority for payment failures
                    )
                    
                    await self.send_email_notification(notification)
                    logger.info(f"Payment failure notification sent for order {event_data.get('order_id')}")
                    
        except Exception as e:
            logger.error(f"Error processing payment event: {e}")

    def _get_status_template(self, status: str) -> Optional[NotificationTemplate]:
        """Map order status to notification template"""
        status_mapping = {
            'shipped': NotificationTemplate.ORDER_SHIPPED,
            'delivered': NotificationTemplate.ORDER_DELIVERED,
            'cancelled': NotificationTemplate.ORDER_CANCELLED
        }
        return status_mapping.get(status)

    async def start_event_processing(self):
        """Start processing events from Event Hub and Service Bus"""
        logger.info("Starting event processing...")
        
        # Start Event Hub consumer
        if self.eventhub_client:
            asyncio.create_task(self._process_eventhub_events())
        
        # Start Service Bus consumer for order events
        if self.servicebus_client:
            asyncio.create_task(self._process_servicebus_events())

    async def _process_eventhub_events(self):
        """Process events from Event Hub"""
        async def on_event(partition_context, event):
            try:
                event_body = event.body_as_str()
                event_data = json.loads(event_body)
                
                logger.debug(f"Received Event Hub event: {event_data.get('event_type', 'unknown')}")
                
                # Process based on event source/type
                await self.process_payment_event(event_data)
                
                # Update checkpoint
                await partition_context.update_checkpoint(event)
                
            except Exception as e:
                logger.error(f"Error processing Event Hub event: {e}")
        
        try:
            async with self.eventhub_client:
                await self.eventhub_client.receive(
                    on_event=on_event,
                    starting_position="-1"  # Start from beginning
                )
        except Exception as e:
            logger.error(f"Event Hub consumer error: {e}")

    async def _process_servicebus_events(self):
        """Process events from Service Bus topic"""
        async with self.servicebus_client:
            async with self.servicebus_client.get_subscription_receiver(
                topic_name="order-events",
                subscription_name="notification-service"
            ) as receiver:
                async for msg in receiver:
                    try:
                        event_data = json.loads(str(msg))
                        logger.debug(f"Received Service Bus event: {event_data.get('eventType', 'unknown')}")
                        
                        # Process order events
                        await self.process_order_event(event_data)
                        
                        # Complete the message
                        await receiver.complete_message(msg)
                        
                    except Exception as e:
                        logger.error(f"Error processing Service Bus event: {e}")
                        # Dead letter the message
                        await receiver.dead_letter_message(msg, reason="ProcessingError", error_description=str(e))

    async def shutdown(self):
        """Shutdown the service gracefully"""
        logger.info("Shutting down Notification Service...")
        self.running = False
        
        if self.eventhub_client:
            await self.eventhub_client.close()
        
        if self.servicebus_client:
            await self.servicebus_client.close()
        
        if self.key_vault_client:
            await self.key_vault_client.close()

# FastAPI app for health endpoints
app = FastAPI(title="Notification Service", version="1.0.0")

# Global notification service instance
notification_service: Optional[NotificationService] = None

@app.on_event("startup")
async def startup_event():
    global notification_service
    notification_service = NotificationService()
    await notification_service.initialize()
    await notification_service.start_event_processing()

@app.on_event("shutdown")
async def shutdown_event():
    if notification_service:
        await notification_service.shutdown()

# Health endpoints (following PRP requirement #6)
@app.get("/health")
async def health():
    """Health check endpoint for Kubernetes liveness probe"""
    return {
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0',
        'environment': os.environ.get('ENVIRONMENT', 'dev')
    }

@app.get("/ready")
async def ready():
    """Readiness check endpoint for Kubernetes readiness probe"""
    try:
        if not notification_service:
            raise HTTPException(status_code=503, detail="Service not initialized")
        
        # Check if essential services are available
        ready_status = {
            'smtp_configured': bool(notification_service.smtp_config.get('username')),
            'eventhub_connected': notification_service.eventhub_client is not None,
            'servicebus_connected': notification_service.servicebus_client is not None
        }
        
        if not any(ready_status.values()):
            raise HTTPException(status_code=503, detail="No notification channels available")
        
        return {
            'status': 'ready',
            'timestamp': datetime.utcnow().isoformat(),
            'version': '1.0.0',
            'environment': os.environ.get('ENVIRONMENT', 'dev'),
            'channels': ready_status
        }
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))

@app.get("/startup")
async def startup():
    """Startup probe endpoint for Kubernetes"""
    return {
        'status': 'started',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0',
        'environment': os.environ.get('ENVIRONMENT', 'dev')
    }

# Signal handlers for graceful shutdown
def signal_handler(signum, frame):
    logger.info(f"Received signal {signum}")
    if notification_service:
        asyncio.create_task(notification_service.shutdown())
    sys.exit(0)

if __name__ == "__main__":
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Run the application
    port = int(os.environ.get('PORT', 8003))
    
    logger.info(f'Starting Notification Service on port {port}')
    logger.info(f'Environment: {os.environ.get("ENVIRONMENT", "dev")}')
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.environ.get("ENVIRONMENT") == "dev",
        log_level="info"
    )