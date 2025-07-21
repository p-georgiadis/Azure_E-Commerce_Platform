#!/usr/bin/env python3
"""
Health Check Script for E-Commerce Platform Services
Demonstrates service health monitoring with Azure integration
"""

import asyncio
import aiohttp
import json
import logging
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

from azure.monitor.opentelemetry import configure_azure_monitor
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient
from opentelemetry import trace
from opentelemetry.metrics import get_meter

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configure Azure Monitor
if os.getenv('APPLICATIONINSIGHTS_CONNECTION_STRING'):
    configure_azure_monitor(
        connection_string=os.getenv('APPLICATIONINSIGHTS_CONNECTION_STRING'),
        disable_logging=False,
        disable_metrics=False,
        disable_tracing=False,
    )

# Initialize OpenTelemetry
tracer = trace.get_tracer(__name__)
meter = get_meter(__name__)

# Create metrics
health_check_counter = meter.create_counter(
    name="health_check_total",
    description="Total number of health checks performed",
    unit="1"
)

health_check_duration = meter.create_histogram(
    name="health_check_duration_seconds",
    description="Duration of health checks",
    unit="s"
)

service_health_gauge = meter.create_gauge(
    name="service_health_status",
    description="Health status of services (1=healthy, 0=unhealthy)",
    unit="1"
)

@dataclass
class ServiceHealth:
    """Data class for service health information"""
    service_name: str
    endpoint: str
    status: str
    response_time: float
    status_code: Optional[int] = None
    error_message: Optional[str] = None
    timestamp: str = None
    
    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat()

class HealthChecker:
    """Main health checker class for monitoring services"""
    
    def __init__(self, services: List[Dict[str, str]], timeout: int = 10):
        self.services = services
        self.timeout = timeout
        self.credential = DefaultAzureCredential()
        self.results: List[ServiceHealth] = []
        
        # Initialize Key Vault client if configured
        self.key_vault_client = None
        if key_vault_url := os.getenv('KEY_VAULT_URL'):
            self.key_vault_client = SecretClient(
                vault_url=key_vault_url,
                credential=self.credential
            )
    
    async def check_service(self, session: aiohttp.ClientSession, service: Dict[str, str]) -> ServiceHealth:
        """Check health of a single service"""
        service_name = service['name']
        endpoint = service['endpoint']
        
        with tracer.start_as_current_span(f"health_check_{service_name}") as span:
            span.set_attribute("service.name", service_name)
            span.set_attribute("service.endpoint", endpoint)
            
            start_time = datetime.utcnow()
            
            try:
                # Add authentication header if needed
                headers = {}
                if self.key_vault_client and service.get('auth_required'):
                    try:
                        api_key = self.key_vault_client.get_secret(f"{service_name}-api-key").value
                        headers['Authorization'] = f"Bearer {api_key}"
                    except Exception as e:
                        logger.warning(f"Failed to get API key for {service_name}: {e}")
                
                async with session.get(
                    endpoint,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=self.timeout)
                ) as response:
                    response_time = (datetime.utcnow() - start_time).total_seconds()
                    
                    # Check if response is healthy
                    if response.status == 200:
                        try:
                            health_data = await response.json()
                            status = health_data.get('status', 'healthy')
                        except:
                            status = 'healthy'
                    else:
                        status = 'unhealthy'
                    
                    result = ServiceHealth(
                        service_name=service_name,
                        endpoint=endpoint,
                        status=status,
                        response_time=response_time,
                        status_code=response.status
                    )
                    
                    span.set_attribute("health.status", status)
                    span.set_attribute("http.status_code", response.status)
                    
            except asyncio.TimeoutError:
                response_time = self.timeout
                result = ServiceHealth(
                    service_name=service_name,
                    endpoint=endpoint,
                    status='timeout',
                    response_time=response_time,
                    error_message=f"Request timed out after {self.timeout}s"
                )
                span.set_attribute("health.status", "timeout")
                
            except Exception as e:
                response_time = (datetime.utcnow() - start_time).total_seconds()
                result = ServiceHealth(
                    service_name=service_name,
                    endpoint=endpoint,
                    status='error',
                    response_time=response_time,
                    error_message=str(e)
                )
                span.set_attribute("health.status", "error")
                span.record_exception(e)
                logger.error(f"Error checking {service_name}: {e}")
            
            # Record metrics
            health_check_counter.add(1, {"service": service_name, "status": result.status})
            health_check_duration.record(response_time, {"service": service_name})
            service_health_gauge.set(
                1 if result.status == 'healthy' else 0,
                {"service": service_name}
            )
            
            return result
    
    async def check_all_services(self) -> List[ServiceHealth]:
        """Check health of all configured services"""
        async with aiohttp.ClientSession() as session:
            tasks = [self.check_service(session, service) for service in self.services]
            self.results = await asyncio.gather(*tasks)
            return self.results
    
    def get_summary(self) -> Dict:
        """Get summary of health check results"""
        total = len(self.results)
        healthy = sum(1 for r in self.results if r.status == 'healthy')
        unhealthy = sum(1 for r in self.results if r.status == 'unhealthy')
        timeout = sum(1 for r in self.results if r.status == 'timeout')
        error = sum(1 for r in self.results if r.status == 'error')
        
        avg_response_time = sum(r.response_time for r in self.results) / total if total > 0 else 0
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'total_services': total,
            'healthy': healthy,
            'unhealthy': unhealthy,
            'timeout': timeout,
            'error': error,
            'health_percentage': (healthy / total * 100) if total > 0 else 0,
            'average_response_time': avg_response_time,
            'results': [asdict(r) for r in self.results]
        }
    
    async def send_to_power_bi(self, summary: Dict):
        """Send health metrics to Power BI streaming dataset"""
        power_bi_url = os.getenv('POWER_BI_STREAMING_URL')
        if not power_bi_url:
            logger.info("Power BI streaming URL not configured")
            return
        
        async with aiohttp.ClientSession() as session:
            for result in self.results:
                payload = [{
                    'timestamp': result.timestamp,
                    'serviceName': result.service_name,
                    'responseTime': result.response_time * 1000,  # Convert to ms
                    'errorRate': 0.0 if result.status == 'healthy' else 100.0,
                    'requestsPerSecond': 0.0,  # Would be calculated from actual metrics
                    'cpuUsage': 0.0,  # Would come from container metrics
                    'memoryUsage': 0.0,  # Would come from container metrics
                    'podCount': 1,  # Would come from K8s API
                    'healthStatus': 'Healthy' if result.status == 'healthy' else 'Unhealthy'
                }]
                
                try:
                    async with session.post(power_bi_url, json=payload) as response:
                        if response.status != 200:
                            logger.error(f"Failed to send to Power BI: {response.status}")
                except Exception as e:
                    logger.error(f"Error sending to Power BI: {e}")

async def main():
    """Main function"""
    # Load service configuration
    services = [
        {
            'name': 'frontend',
            'endpoint': os.getenv('FRONTEND_URL', 'http://frontend-service/health'),
            'auth_required': False
        },
        {
            'name': 'product-service',
            'endpoint': os.getenv('PRODUCT_SERVICE_URL', 'http://product-service/health'),
            'auth_required': True
        },
        {
            'name': 'order-service',
            'endpoint': os.getenv('ORDER_SERVICE_URL', 'http://order-service/health'),
            'auth_required': True
        },
        {
            'name': 'payment-service',
            'endpoint': os.getenv('PAYMENT_SERVICE_URL', 'http://payment-service/health'),
            'auth_required': True
        },
        {
            'name': 'notification-service',
            'endpoint': os.getenv('NOTIFICATION_SERVICE_URL', 'http://notification-service/health'),
            'auth_required': True
        }
    ]
    
    # Create health checker
    checker = HealthChecker(services)
    
    # Run health checks
    logger.info("Starting health checks...")
    await checker.check_all_services()
    
    # Get summary
    summary = checker.get_summary()
    
    # Print results
    print(json.dumps(summary, indent=2))
    
    # Send to Power BI
    await checker.send_to_power_bi(summary)
    
    # Exit with appropriate code
    if summary['healthy'] == summary['total_services']:
        logger.info("All services are healthy")
        sys.exit(0)
    else:
        logger.warning(f"Some services are unhealthy: {summary['unhealthy']} unhealthy, {summary['timeout']} timeout, {summary['error']} error")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())