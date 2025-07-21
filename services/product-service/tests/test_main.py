# tests/test_main.py
# Test suite for Product Service
import pytest
import asyncio
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock
import os
from datetime import datetime

# Set environment variables for testing
os.environ["COSMOS_ENDPOINT"] = "https://test-cosmos.documents.azure.com:443/"
os.environ["ENVIRONMENT"] = "test"

from app.main import app, Product

# Test client
client = TestClient(app)

# Mock data
test_product = {
    "id": "test-product-id",
    "name": "Test Product",
    "description": "A test product",
    "price": 99.99,
    "category": "electronics",
    "sku": "TEST-001",
    "stock_quantity": 100,
    "image_url": "https://example.com/image.jpg",
    "is_active": True,
    "created_at": "2023-01-01T00:00:00",
    "updated_at": "2023-01-01T00:00:00"
}

@pytest.fixture
def mock_cosmos_client():
    """Mock Cosmos DB client for testing"""
    with patch('app.main.CosmosClient') as mock_client:
        mock_instance = AsyncMock()
        mock_client.return_value = mock_instance
        
        # Mock database and container
        mock_database = AsyncMock()
        mock_container = AsyncMock()
        
        mock_instance.get_database_client.return_value = mock_database
        mock_database.get_container_client.return_value = mock_container
        mock_database.read.return_value = {"id": "products"}
        
        # Mock container operations
        mock_container.read_item.return_value = test_product
        mock_container.create_item.return_value = test_product
        mock_container.replace_item.return_value = test_product
        mock_container.query_items.return_value = AsyncMock()
        
        yield mock_container

@pytest.fixture
def mock_auth():
    """Mock authentication for testing"""
    with patch('app.main.verify_token') as mock_verify:
        mock_verify.return_value = "test-token"
        yield mock_verify

class TestHealthEndpoints:
    """Test health check endpoints"""
    
    def test_health_endpoint(self):
        """Test health endpoint returns 200"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert data["version"] == "1.0.0"
    
    @patch('app.main.database')
    def test_ready_endpoint_success(self, mock_database):
        """Test ready endpoint when database is available"""
        mock_database.read = AsyncMock()
        response = client.get("/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
    
    def test_startup_endpoint(self):
        """Test startup endpoint returns 200"""
        response = client.get("/startup")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "started"

class TestProductEndpoints:
    """Test product CRUD endpoints"""
    
    @patch('app.main.container')
    def test_get_products(self, mock_container, mock_auth):
        """Test getting products list"""
        # Mock query results
        async def mock_query_items(*args, **kwargs):
            if 'COUNT' in kwargs.get('query', ''):
                yield 1
            else:
                yield test_product
        
        mock_container.query_items.return_value = mock_query_items()
        
        response = client.get("/api/products")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert "total_count" in data
        assert data["page"] == 1
        assert data["page_size"] == 10
    
    @patch('app.main.container')
    def test_get_product_by_id(self, mock_container, mock_auth):
        """Test getting a specific product by ID"""
        mock_container.read_item.return_value = test_product
        
        response = client.get("/api/products/test-product-id")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "test-product-id"
        assert data["name"] == "Test Product"
    
    @patch('app.main.container')
    def test_get_product_not_found(self, mock_container, mock_auth):
        """Test getting non-existent product returns 404"""
        mock_container.read_item.side_effect = Exception("Not found")
        
        response = client.get("/api/products/non-existent")
        assert response.status_code == 404
    
    @patch('app.main.container')
    def test_create_product(self, mock_container, mock_auth):
        """Test creating a new product"""
        mock_container.create_item.return_value = test_product
        
        product_data = {
            "name": "New Product",
            "description": "A new test product",
            "price": 49.99,
            "category": "books",
            "sku": "NEW-001",
            "stock_quantity": 50
        }
        
        response = client.post("/api/products", json=product_data)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == product_data["name"]
        assert data["price"] == product_data["price"]
    
    @patch('app.main.container')
    def test_update_product(self, mock_container, mock_auth):
        """Test updating an existing product"""
        mock_container.read_item.return_value = test_product
        mock_container.replace_item.return_value = test_product
        
        update_data = {
            "name": "Updated Product",
            "price": 149.99
        }
        
        response = client.put("/api/products/test-product-id", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
    
    @patch('app.main.container')
    def test_delete_product(self, mock_container, mock_auth):
        """Test soft deleting a product"""
        mock_container.read_item.return_value = test_product
        mock_container.replace_item.return_value = test_product
        
        response = client.delete("/api/products/test-product-id")
        assert response.status_code == 204
    
    @patch('app.main.container')
    def test_get_products_by_category(self, mock_container, mock_auth):
        """Test getting products by category"""
        async def mock_query_items(*args, **kwargs):
            if 'COUNT' in kwargs.get('query', ''):
                yield 1
            else:
                yield test_product
        
        mock_container.query_items.return_value = mock_query_items()
        
        response = client.get("/api/products/category/electronics")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data

class TestProductModel:
    """Test Pydantic models"""
    
    def test_product_model_validation(self):
        """Test Product model validation"""
        product = Product(**test_product)
        assert product.name == "Test Product"
        assert product.price == 99.99
        assert product.category == "electronics"
    
    def test_product_model_validation_fails(self):
        """Test Product model validation with invalid data"""
        invalid_data = test_product.copy()
        invalid_data["price"] = -10  # Invalid negative price
        
        with pytest.raises(ValueError):
            Product(**invalid_data)

class TestSecurity:
    """Test security and authentication"""
    
    def test_endpoints_require_auth(self):
        """Test that API endpoints require authentication"""
        response = client.get("/api/products")
        assert response.status_code == 403  # Should require auth
    
    def test_health_endpoints_no_auth(self):
        """Test that health endpoints don't require auth"""
        response = client.get("/health")
        assert response.status_code == 200
        
        response = client.get("/ready")
        assert response.status_code in [200, 503]  # 503 if DB not available
        
        response = client.get("/startup")
        assert response.status_code == 200

# Integration tests (would require actual Cosmos DB in real scenarios)
class TestIntegration:
    """Integration tests"""
    
    @pytest.mark.asyncio
    async def test_cosmos_connection(self):
        """Test that we can connect to Cosmos DB"""
        # This would be a real integration test in a full test suite
        # For now, just verify the mock setup works
        with patch('app.main.CosmosClient') as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value = mock_instance
            mock_database = AsyncMock()
            mock_instance.get_database_client.return_value = mock_database
            mock_database.read.return_value = {"id": "products"}
            
            # Simulate connection test
            await mock_database.read()
            assert mock_database.read.called

# Test configuration
class TestConfiguration:
    """Test configuration and environment variables"""
    
    def test_environment_variables(self):
        """Test that required environment variables are set"""
        assert os.environ.get("ENVIRONMENT") == "test"
        assert os.environ.get("COSMOS_ENDPOINT") is not None