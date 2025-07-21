// tests/server.test.ts
// Basic tests for Order Service

import request from 'supertest';
import app from '../src/server';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.SQL_SERVER = 'test-server';
process.env.SQL_DATABASE = 'test-db';
process.env.SQL_USERNAME = 'test-user';
process.env.SQL_PASSWORD = 'test-password';
process.env.JWT_SECRET = 'test-secret';

// Mock database service
jest.mock('../src/services/DatabaseService', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      checkConnection: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock Service Bus service
jest.mock('../src/services/ServiceBusService', () => ({
  ServiceBusService: {
    getInstance: jest.fn().mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      publishOrderEvent: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('Order Service', () => {
  describe('Health Endpoints', () => {
    test('GET /health should return healthy status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'healthy',
        version: '1.0.0',
        environment: 'test',
      });
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
    });

    test('GET /ready should return ready status', async () => {
      const response = await request(app).get('/ready');
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ready',
        version: '1.0.0',
        environment: 'test',
        database: 'connected',
      });
    });

    test('GET /startup should return started status', async () => {
      const response = await request(app).get('/startup');
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'started',
        version: '1.0.0',
        environment: 'test',
      });
    });
  });

  describe('Metrics Endpoint', () => {
    test('GET /metrics should return prometheus metrics', async () => {
      const response = await request(app).get('/metrics');
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });

  describe('Authentication', () => {
    test('GET /api/orders should require authentication', async () => {
      const response = await request(app).get('/api/orders');
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    test('POST /api/orders should require authentication', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({
          customerId: 'test-customer',
          customerEmail: 'test@example.com',
          shippingAddress: '123 Test St',
          billingAddress: '123 Test St',
          orderItems: [{
            productId: 'test-product',
            productName: 'Test Product',
            quantity: 1,
            unitPrice: 10.00,
          }],
        });
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('404 Handler', () => {
    test('Should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/non-existent-route');
      
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not Found');
      expect(response.body.message).toContain('Route GET /non-existent-route not found');
    });
  });

  describe('CORS', () => {
    test('Should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');
      
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    test('Should include security headers', async () => {
      const response = await request(app).get('/health');
      
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });
  });
});