// src/services/ServiceBusService.ts
// Service Bus service for publishing order events

import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { logger } from '../config/logger';

export interface OrderEvent {
  orderId: string;
  customerId: string;
  orderNumber: string;
  totalAmount?: number;
  currency?: string;
  oldStatus?: string;
  newStatus?: string;
  timestamp: string;
}

export class ServiceBusService {
  private static instance: ServiceBusService;
  private client: ServiceBusClient | null = null;
  private topicSender: ServiceBusSender | null = null;
  private credential: DefaultAzureCredential;
  private keyVaultClient: SecretClient | null = null;

  private constructor() {
    this.credential = new DefaultAzureCredential();
    
    // Initialize Key Vault client if configured
    const keyVaultUrl = process.env.KEY_VAULT_URL;
    if (keyVaultUrl) {
      this.keyVaultClient = new SecretClient(keyVaultUrl, this.credential);
    }
  }

  public static getInstance(): ServiceBusService {
    if (!ServiceBusService.instance) {
      ServiceBusService.instance = new ServiceBusService();
    }
    return ServiceBusService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing Service Bus connection...');

      // Get connection string from Key Vault or environment
      let connectionString = process.env.SERVICE_BUS_CONNECTION_STRING;

      if (this.keyVaultClient && !connectionString) {
        try {
          const secret = await this.keyVaultClient.getSecret('servicebus-connection-string');
          connectionString = secret.value;
          logger.info('Retrieved Service Bus connection string from Key Vault');
        } catch (error) {
          logger.warn('Failed to get Service Bus connection string from Key Vault');
        }
      }

      if (!connectionString) {
        // Fallback to namespace-based connection
        const namespace = process.env.SERVICE_BUS_NAMESPACE || 'sb-ecommerce-dev.servicebus.windows.net';
        connectionString = `Endpoint=sb://${namespace}/;Authentication=ManagedIdentity`;
      }

      // Initialize Service Bus client
      if (connectionString.includes('ManagedIdentity')) {
        this.client = new ServiceBusClient(connectionString, this.credential);
      } else {
        this.client = new ServiceBusClient(connectionString);
      }

      // Initialize topic sender for order events
      const topicName = process.env.ORDER_EVENTS_TOPIC || 'order-events';
      this.topicSender = this.client.createSender(topicName);

      logger.info('Service Bus service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Service Bus service:', error);
      throw error;
    }
  }

  public async publishOrderEvent(eventType: string, eventData: OrderEvent): Promise<void> {
    if (!this.topicSender) {
      // Initialize if not already done (lazy initialization)
      await this.initialize();
    }

    if (!this.topicSender) {
      throw new Error('Service Bus sender not initialized');
    }

    try {
      const message = {
        body: {
          eventType,
          data: eventData,
          timestamp: new Date().toISOString(),
          source: 'order-service',
          version: '1.0',
        },
        subject: eventType,
        contentType: 'application/json',
        correlationId: eventData.orderId,
        messageId: `${eventType}-${eventData.orderId}-${Date.now()}`,
        timeToLive: 24 * 60 * 60 * 1000, // 24 hours
        applicationProperties: {
          eventType,
          orderId: eventData.orderId,
          customerId: eventData.customerId,
        },
      };

      await this.topicSender.sendMessages(message);
      logger.info(`Published ${eventType} event for order ${eventData.orderId}`);
    } catch (error) {
      logger.error(`Failed to publish ${eventType} event for order ${eventData.orderId}:`, error);
      throw error;
    }
  }

  public async publishPaymentProcessingEvent(orderId: string, paymentData: any): Promise<void> {
    if (!this.client) {
      await this.initialize();
    }

    if (!this.client) {
      throw new Error('Service Bus client not initialized');
    }

    try {
      const queueName = process.env.PAYMENT_QUEUE || 'payment-processing';
      const queueSender = this.client.createSender(queueName);

      const message = {
        body: {
          orderId,
          ...paymentData,
          timestamp: new Date().toISOString(),
          source: 'order-service',
        },
        correlationId: orderId,
        messageId: `payment-${orderId}-${Date.now()}`,
        timeToLive: 30 * 60 * 1000, // 30 minutes
      };

      await queueSender.sendMessages(message);
      await queueSender.close();

      logger.info(`Published payment processing message for order ${orderId}`);
    } catch (error) {
      logger.error(`Failed to publish payment processing message for order ${orderId}:`, error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.topicSender) {
        await this.topicSender.close();
        logger.info('Service Bus topic sender closed');
      }

      if (this.client) {
        await this.client.close();
        logger.info('Service Bus client closed');
      }
    } catch (error) {
      logger.error('Error closing Service Bus connections:', error);
    }
  }
}