# services/product-service/app/main.py
# Product Service - FastAPI microservice with Cosmos DB integration
# Following PRP patterns from /examples/scripts/health-check.py for async patterns

from fastapi import FastAPI, HTTPException, Depends, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from contextlib import asynccontextmanager
import os
import logging
from typing import Optional, List
from azure.cosmos.aio import CosmosClient, DatabaseProxy, ContainerProxy
from azure.identity.aio import DefaultAzureCredential
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry import trace, metrics
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from pydantic import BaseModel, Field
from datetime import datetime
import json
import uuid

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Security
security = HTTPBearer()

# Pydantic models
class Product(BaseModel):
    id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    price: float = Field(..., gt=0)
    category: str = Field(..., min_length=1, max_length=100)
    sku: str = Field(..., min_length=1, max_length=50)
    stock_quantity: int = Field(..., ge=0)
    image_url: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    price: Optional[float] = Field(None, gt=0)
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    sku: Optional[str] = Field(None, min_length=1, max_length=50)
    stock_quantity: Optional[int] = Field(None, ge=0)
    image_url: Optional[str] = None
    is_active: Optional[bool] = None

class HealthResponse(BaseModel):
    status: str
    timestamp: datetime
    version: str = "1.0.0"
    environment: str

class ProductResponse(BaseModel):
    products: List[Product]
    total_count: int
    page: int
    page_size: int

# Global variables for Azure services
cosmos_client: Optional[CosmosClient] = None
database: Optional[DatabaseProxy] = None
container: Optional[ContainerProxy] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Product Service...")
    
    global cosmos_client, database, container
    
    try:
        # Initialize Azure credentials and Cosmos client
        logger.info("Initializing Azure Cosmos DB connection...")
        credential = DefaultAzureCredential()
        cosmos_endpoint = os.environ.get("COSMOS_ENDPOINT")
        
        if not cosmos_endpoint:
            raise ValueError("COSMOS_ENDPOINT environment variable is required")
        
        cosmos_client = CosmosClient(cosmos_endpoint, credential=credential)
        database = cosmos_client.get_database_client("products")
        container = database.get_container_client("products")
        
        # Test connection
        await database.read()
        logger.info("Successfully connected to Cosmos DB")
        
    except Exception as e:
        logger.error(f"Failed to initialize Cosmos DB: {e}")
        raise e
    
    yield
    
    # Shutdown
    logger.info("Shutting down Product Service...")
    if cosmos_client:
        await cosmos_client.close()

app = FastAPI(
    title="Product Service",
    description="E-Commerce Product Management Service",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Configure CORS (following PRP requirement #5)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Security middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=os.environ.get("ALLOWED_HOSTS", "*").split(",")
)

# Instrument for observability
FastAPIInstrumentor.instrument_app(app)

# Initialize OpenTelemetry
tracer = trace.get_tracer(__name__)
meter = metrics.get_meter(__name__)

# Create metrics
product_requests_counter = meter.create_counter(
    name="product_requests_total",
    description="Total number of product requests",
    unit="1"
)

product_response_time = meter.create_histogram(
    name="product_response_time_seconds",
    description="Response time for product requests",
    unit="s"
)

# Dependency injection for authentication
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify JWT token from Azure AD or custom auth service
    In production, this would validate the JWT token
    """
    # Placeholder for JWT token validation
    # In a real implementation, you would validate the token here
    if not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials

# Health endpoints matching K8s probes pattern (following PRP requirement #6)
@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint for Kubernetes liveness probe"""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow(),
        environment=os.environ.get("ENVIRONMENT", "dev")
    )

@app.get("/ready", response_model=HealthResponse)
async def ready():
    """Readiness check endpoint for Kubernetes readiness probe"""
    try:
        # Check Cosmos DB connection
        if database is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database not initialized"
            )
        
        await database.read()
        return HealthResponse(
            status="ready",
            timestamp=datetime.utcnow(),
            environment=os.environ.get("ENVIRONMENT", "dev")
        )
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not ready"
        )

@app.get("/startup", response_model=HealthResponse)
async def startup():
    """Startup probe endpoint for Kubernetes"""
    return HealthResponse(
        status="started",
        timestamp=datetime.utcnow(),
        environment=os.environ.get("ENVIRONMENT", "dev")
    )

# Prometheus metrics endpoint
@app.get("/metrics")
async def metrics_endpoint():
    """Prometheus metrics endpoint"""
    return {"message": "Metrics available at /metrics"}

# Product API endpoints
@app.get("/api/products", response_model=ProductResponse)
async def get_products(
    category: Optional[str] = Query(None, description="Filter by category"),
    active_only: bool = Query(True, description="Return only active products"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    token: str = Depends(verify_token)
):
    """Get paginated list of products with optional filtering"""
    with tracer.start_as_current_span("get_products") as span:
        span.set_attribute("category", category or "all")
        span.set_attribute("page", page)
        span.set_attribute("page_size", page_size)
        
        try:
            query = "SELECT * FROM c WHERE 1=1"
            parameters = []
            
            if active_only:
                query += " AND c.is_active = @active"
                parameters.append({"name": "@active", "value": True})
            
            if category:
                query += " AND c.category = @category"
                parameters.append({"name": "@category", "value": category})
            
            # Add ordering and pagination
            query += " ORDER BY c.created_at DESC"
            query += f" OFFSET {(page - 1) * page_size} LIMIT {page_size}"
            
            items = container.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True
            )
            
            products = [Product(**item) async for item in items]
            
            # Get total count for pagination
            count_query = "SELECT VALUE COUNT(1) FROM c WHERE 1=1"
            if active_only:
                count_query += " AND c.is_active = true"
            if category:
                count_query += f" AND c.category = '{category}'"
            
            count_items = container.query_items(
                query=count_query,
                enable_cross_partition_query=True
            )
            total_count = [count async for count in count_items][0]
            
            product_requests_counter.add(1, {"operation": "list", "category": category or "all"})
            
            return ProductResponse(
                products=products,
                total_count=total_count,
                page=page,
                page_size=page_size
            )
            
        except Exception as e:
            logger.error(f"Failed to get products: {e}")
            span.record_exception(e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve products"
            )

@app.get("/api/products/{product_id}", response_model=Product)
async def get_product(product_id: str, token: str = Depends(verify_token)):
    """Get a specific product by ID"""
    with tracer.start_as_current_span("get_product") as span:
        span.set_attribute("product_id", product_id)
        
        try:
            item = await container.read_item(
                item=product_id,
                partition_key=product_id  # Using ID as partition key for simplicity
            )
            
            product_requests_counter.add(1, {"operation": "get"})
            return Product(**item)
            
        except Exception as e:
            logger.error(f"Failed to get product {product_id}: {e}")
            span.record_exception(e)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found"
            )

@app.post("/api/products", response_model=Product, status_code=status.HTTP_201_CREATED)
async def create_product(product: Product, token: str = Depends(verify_token)):
    """Create a new product"""
    with tracer.start_as_current_span("create_product") as span:
        span.set_attribute("product_name", product.name)
        span.set_attribute("product_category", product.category)
        
        try:
            # Ensure timestamps are set
            product.created_at = datetime.utcnow()
            product.updated_at = datetime.utcnow()
            
            # Convert to dict for Cosmos DB
            product_dict = product.model_dump()
            
            await container.create_item(
                body=product_dict,
                partition_key=product.category
            )
            
            product_requests_counter.add(1, {"operation": "create", "category": product.category})
            logger.info(f"Created product: {product.id}")
            
            return product
            
        except Exception as e:
            logger.error(f"Failed to create product: {e}")
            span.record_exception(e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create product"
            )

@app.put("/api/products/{product_id}", response_model=Product)
async def update_product(
    product_id: str,
    product_update: ProductUpdate,
    token: str = Depends(verify_token)
):
    """Update an existing product"""
    with tracer.start_as_current_span("update_product") as span:
        span.set_attribute("product_id", product_id)
        
        try:
            # Get existing product
            existing_item = await container.read_item(
                item=product_id,
                partition_key=product_id
            )
            
            existing_product = Product(**existing_item)
            
            # Update fields
            update_data = product_update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                setattr(existing_product, field, value)
            
            existing_product.updated_at = datetime.utcnow()
            
            # Save updated product
            product_dict = existing_product.model_dump()
            await container.replace_item(
                item=product_id,
                body=product_dict,
                partition_key=existing_product.category
            )
            
            product_requests_counter.add(1, {"operation": "update"})
            logger.info(f"Updated product: {product_id}")
            
            return existing_product
            
        except Exception as e:
            logger.error(f"Failed to update product {product_id}: {e}")
            span.record_exception(e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update product"
            )

@app.delete("/api/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: str, token: str = Depends(verify_token)):
    """Delete a product (soft delete by setting is_active to False)"""
    with tracer.start_as_current_span("delete_product") as span:
        span.set_attribute("product_id", product_id)
        
        try:
            # Get existing product
            existing_item = await container.read_item(
                item=product_id,
                partition_key=product_id
            )
            
            existing_product = Product(**existing_item)
            existing_product.is_active = False
            existing_product.updated_at = datetime.utcnow()
            
            # Save updated product
            product_dict = existing_product.model_dump()
            await container.replace_item(
                item=product_id,
                body=product_dict,
                partition_key=existing_product.category
            )
            
            product_requests_counter.add(1, {"operation": "delete"})
            logger.info(f"Deleted (soft) product: {product_id}")
            
        except Exception as e:
            logger.error(f"Failed to delete product {product_id}: {e}")
            span.record_exception(e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete product"
            )

@app.get("/api/products/category/{category}", response_model=ProductResponse)
async def get_products_by_category(
    category: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    token: str = Depends(verify_token)
):
    """Get products by category"""
    return await get_products(
        category=category,
        active_only=True,
        page=page,
        page_size=page_size,
        token=token
    )

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=os.environ.get("ENVIRONMENT") == "dev",
        log_level="info"
    )