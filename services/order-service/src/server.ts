// src/server.ts
// Order Service - Express.js microservice with SQL Database integration
// Following patterns from PRP requirements

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { DatabaseService } from './services/DatabaseService';
import { OrderController } from './controllers/OrderController';
import { logger } from './config/logger';
import { config } from './config/config';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { metricsMiddleware, register } from './middleware/metrics';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration (following PRP requirement #5)
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // limit each IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Metrics middleware
app.use(metricsMiddleware);

// Health endpoints (following PRP requirement #6)
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
  });
});

app.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check database connection
    const dbService = DatabaseService.getInstance();
    await dbService.checkConnection();
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
    });
  } catch (error) {
    logger.error('Readiness check failed', error);
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
    });
  }
});

app.get('/startup', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'started',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
});

// Initialize database and controllers
const initializeApp = async () => {
  try {
    // Initialize database
    const dbService = DatabaseService.getInstance();
    await dbService.initialize();
    logger.info('Database service initialized');

    // Initialize controllers
    const orderController = new OrderController();

    // API routes with authentication
    app.use('/api/orders', authMiddleware, orderController.router);

    // Error handling middleware (must be last)
    app.use(errorHandler);

    // 404 handler
    app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      });
    });

    logger.info('Order Service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Order Service', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Received termination signal, shutting down gracefully');
  
  try {
    const dbService = DatabaseService.getInstance();
    await dbService.close();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error during shutdown', error);
  }
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 8001;

initializeApp().then(() => {
  app.listen(PORT, () => {
    logger.info(`Order Service listening on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`API Documentation: http://localhost:${PORT}/api/orders`);
  });
}).catch((error) => {
  logger.error('Failed to start Order Service', error);
  process.exit(1);
});

export default app;