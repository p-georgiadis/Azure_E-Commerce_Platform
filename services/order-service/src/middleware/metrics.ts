// src/middleware/metrics.ts
// Prometheus metrics middleware

import { Request, Response, NextFunction } from 'express';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Enable default metrics collection
collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [register],
});

export const orderOperationsTotal = new Counter({
  name: 'order_operations_total',
  help: 'Total number of order operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

export const orderProcessingDuration = new Histogram({
  name: 'order_processing_duration_seconds',
  help: 'Duration of order processing operations in seconds',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const activeOrders = new Gauge({
  name: 'active_orders_total',
  help: 'Current number of active orders',
  registers: [register],
});

export const databaseConnectionsActive = new Gauge({
  name: 'database_connections_active',
  help: 'Current number of active database connections',
  registers: [register],
});

export const serviceBusMessagesTotal = new Counter({
  name: 'servicebus_messages_total',
  help: 'Total number of Service Bus messages sent',
  labelNames: ['topic', 'queue', 'status'],
  registers: [register],
});

// Middleware to collect HTTP metrics
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const route = getRoutePattern(req.route?.path || req.path);

  // Override res.end to capture metrics
  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any, cb?: any): any {
    const duration = (Date.now() - startTime) / 1000;
    const statusCode = res.statusCode.toString();

    // Record metrics
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: statusCode,
      },
      duration
    );

    // Call the original end method
    return originalEnd.call(this, chunk, encoding, cb);
  };

  next();
};

// Helper function to normalize route patterns
function getRoutePattern(path: string): string {
  // Replace dynamic segments with placeholders
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id') // UUIDs
    .replace(/\/\d+/g, '/:id') // Numeric IDs
    .replace(/\/[a-z0-9\-]+/gi, '/:param'); // Other parameters
}

// Helper functions for custom metrics
export const incrementOrderOperation = (operation: string, status: 'success' | 'failure'): void => {
  orderOperationsTotal.inc({ operation, status });
};

export const observeOrderProcessingTime = (operation: string, duration: number): void => {
  orderProcessingDuration.observe({ operation }, duration);
};

export const setActiveOrdersCount = (count: number): void => {
  activeOrders.set(count);
};

export const setDatabaseConnectionsCount = (count: number): void => {
  databaseConnectionsActive.set(count);
};

export const incrementServiceBusMessage = (
  topic?: string,
  queue?: string,
  status: 'success' | 'failure' = 'success'
): void => {
  serviceBusMessagesTotal.inc({
    topic: topic || '',
    queue: queue || '',
    status,
  });
};

export { register };