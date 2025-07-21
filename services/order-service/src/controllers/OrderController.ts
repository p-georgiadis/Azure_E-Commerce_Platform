// src/controllers/OrderController.ts
// Order Controller - handles HTTP requests for order management

import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService, Order } from '../services/DatabaseService';
import { ServiceBusService } from '../services/ServiceBusService';
import { logger } from '../config/logger';
import { ValidationError, NotFoundError, BadRequestError } from '../utils/errors';

// Validation schemas
const createOrderSchema = Joi.object({
  customerId: Joi.string().required(),
  customerEmail: Joi.string().email().required(),
  shippingAddress: Joi.string().required(),
  billingAddress: Joi.string().required(),
  currency: Joi.string().length(3).default('USD'),
  orderItems: Joi.array().items(
    Joi.object({
      productId: Joi.string().required(),
      productName: Joi.string().required(),
      quantity: Joi.number().integer().min(1).required(),
      unitPrice: Joi.number().positive().required(),
    })
  ).min(1).required(),
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'processing', 'shipped', 'delivered', 'cancelled').required(),
});

const queryParamsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
});

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
  };
}

export class OrderController {
  public router: Router;
  private dbService: DatabaseService;
  private serviceBusService: ServiceBusService;

  constructor() {
    this.router = Router();
    this.dbService = DatabaseService.getInstance();
    this.serviceBusService = ServiceBusService.getInstance();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Get orders for authenticated user
    this.router.get('/', this.getOrders.bind(this));
    
    // Get specific order by ID
    this.router.get('/:orderId', this.getOrderById.bind(this));
    
    // Create new order
    this.router.post('/', this.createOrder.bind(this));
    
    // Update order status (admin only)
    this.router.patch('/:orderId/status', this.updateOrderStatus.bind(this));
    
    // Cancel order
    this.router.patch('/:orderId/cancel', this.cancelOrder.bind(this));
  }

  private async getOrders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { error, value } = queryParamsSchema.validate(req.query);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const { page, pageSize } = value;
      const customerId = req.user?.id;

      if (!customerId) {
        throw new BadRequestError('Customer ID not found in token');
      }

      const { orders, totalCount } = await this.dbService.getOrdersByCustomer(
        customerId,
        page,
        pageSize
      );

      res.json({
        orders,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      });

      logger.info(`Retrieved ${orders.length} orders for customer ${customerId}`);
    } catch (error) {
      next(error);
    }
  }

  private async getOrderById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.orderId;
      const customerId = req.user?.id;

      if (!customerId) {
        throw new BadRequestError('Customer ID not found in token');
      }

      const order = await this.dbService.getOrderById(orderId);

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      // Check if user owns the order or is admin
      const isAdmin = req.user?.roles?.includes('admin') || false;
      if (!isAdmin && order.customerId !== customerId) {
        throw new NotFoundError('Order not found');
      }

      res.json(order);
      logger.info(`Retrieved order ${orderId} for customer ${customerId}`);
    } catch (error) {
      next(error);
    }
  }

  private async createOrder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { error, value } = createOrderSchema.validate(req.body);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const customerId = req.user?.id;
      const customerEmail = req.user?.email;

      if (!customerId || !customerEmail) {
        throw new BadRequestError('Customer information not found in token');
      }

      // Generate unique order number
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      // Calculate total amount
      const orderItems = value.orderItems.map((item: any) => ({
        ...item,
        id: uuidv4(),
        orderId: '', // Will be set after order creation
        totalPrice: item.quantity * item.unitPrice,
      }));

      const totalAmount = orderItems.reduce((sum: number, item: any) => sum + item.totalPrice, 0);

      const orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'> = {
        customerId,
        customerEmail,
        orderNumber,
        status: 'pending',
        totalAmount,
        currency: value.currency,
        shippingAddress: value.shippingAddress,
        billingAddress: value.billingAddress,
        orderItems,
      };

      // Create order in database
      const createdOrder = await this.dbService.createOrder(orderData);

      // Publish order created event to Service Bus
      try {
        await this.serviceBusService.publishOrderEvent('order.created', {
          orderId: createdOrder.id,
          customerId: createdOrder.customerId,
          orderNumber: createdOrder.orderNumber,
          totalAmount: createdOrder.totalAmount,
          currency: createdOrder.currency,
          timestamp: new Date().toISOString(),
        });
      } catch (eventError) {
        // Log error but don't fail the order creation
        logger.error('Failed to publish order created event:', eventError);
      }

      res.status(201).json(createdOrder);
      logger.info(`Created order ${createdOrder.id} for customer ${customerId}`);
    } catch (error) {
      next(error);
    }
  }

  private async updateOrderStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check if user is admin
      const isAdmin = req.user?.roles?.includes('admin') || false;
      if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
        return;
      }

      const { error, value } = updateOrderStatusSchema.validate(req.body);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const orderId = req.params.orderId;
      const { status } = value;

      const updatedOrder = await this.dbService.updateOrderStatus(orderId, status);

      if (!updatedOrder) {
        throw new NotFoundError('Order not found');
      }

      // Publish order status changed event
      try {
        await this.serviceBusService.publishOrderEvent('order.status_changed', {
          orderId: updatedOrder.id,
          customerId: updatedOrder.customerId,
          orderNumber: updatedOrder.orderNumber,
          oldStatus: 'unknown', // Would need to track this
          newStatus: status,
          timestamp: new Date().toISOString(),
        });
      } catch (eventError) {
        logger.error('Failed to publish order status changed event:', eventError);
      }

      res.json(updatedOrder);
      logger.info(`Updated order ${orderId} status to ${status}`);
    } catch (error) {
      next(error);
    }
  }

  private async cancelOrder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.orderId;
      const customerId = req.user?.id;

      if (!customerId) {
        throw new BadRequestError('Customer ID not found in token');
      }

      // Get the current order to verify ownership
      const currentOrder = await this.dbService.getOrderById(orderId);

      if (!currentOrder) {
        throw new NotFoundError('Order not found');
      }

      // Check ownership or admin access
      const isAdmin = req.user?.roles?.includes('admin') || false;
      if (!isAdmin && currentOrder.customerId !== customerId) {
        throw new NotFoundError('Order not found');
      }

      // Check if order can be cancelled
      if (currentOrder.status === 'cancelled') {
        throw new BadRequestError('Order is already cancelled');
      }

      if (['shipped', 'delivered'].includes(currentOrder.status)) {
        throw new BadRequestError('Cannot cancel shipped or delivered orders');
      }

      // Update status to cancelled
      const updatedOrder = await this.dbService.updateOrderStatus(orderId, 'cancelled');

      // Publish order cancelled event
      try {
        await this.serviceBusService.publishOrderEvent('order.cancelled', {
          orderId: updatedOrder!.id,
          customerId: updatedOrder!.customerId,
          orderNumber: updatedOrder!.orderNumber,
          totalAmount: updatedOrder!.totalAmount,
          timestamp: new Date().toISOString(),
        });
      } catch (eventError) {
        logger.error('Failed to publish order cancelled event:', eventError);
      }

      res.json(updatedOrder);
      logger.info(`Cancelled order ${orderId} for customer ${customerId}`);
    } catch (error) {
      next(error);
    }
  }
}