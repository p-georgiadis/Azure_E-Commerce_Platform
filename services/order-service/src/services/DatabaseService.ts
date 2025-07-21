// src/services/DatabaseService.ts
// Database service for SQL Server connectivity with Azure integration

import sql from 'mssql';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { logger } from '../config/logger';
import { config } from '../config/config';

export interface Order {
  id: string;
  customerId: string;
  customerEmail: string;
  orderNumber: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  totalAmount: number;
  currency: string;
  shippingAddress: string;
  billingAddress: string;
  orderItems: OrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private pool: sql.ConnectionPool | null = null;
  private credential: DefaultAzureCredential;
  private keyVaultClient: SecretClient | null = null;
  private connectionConfig: sql.config | null = null;

  private constructor() {
    this.credential = new DefaultAzureCredential();
    
    // Initialize Key Vault client if configured
    const keyVaultUrl = process.env.KEY_VAULT_URL;
    if (keyVaultUrl) {
      this.keyVaultClient = new SecretClient(keyVaultUrl, this.credential);
    }
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing database connection...');
      
      // Get connection string from Key Vault or environment
      let connectionString = process.env.SQL_CONNECTION_STRING;
      
      if (this.keyVaultClient && !connectionString) {
        try {
          const secret = await this.keyVaultClient.getSecret('sql-connection-string');
          connectionString = secret.value;
          logger.info('Retrieved SQL connection string from Key Vault');
        } catch (error) {
          logger.warn('Failed to get SQL connection string from Key Vault, using environment variables');
        }
      }

      if (connectionString) {
        this.connectionConfig = {
          connectionString,
          options: {
            encrypt: true,
            trustServerCertificate: false,
            enableArithAbort: true,
          },
          pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000,
          },
        };
      } else {
        // Build connection config from individual parameters
        const server = process.env.SQL_SERVER || 'sql-ecommerce-dev.database.windows.net';
        const database = process.env.SQL_DATABASE || 'orders';
        const username = process.env.SQL_USERNAME || 'ecommerceadmin';
        let password = process.env.SQL_PASSWORD;

        // Try to get password from Key Vault
        if (this.keyVaultClient && !password) {
          try {
            const secret = await this.keyVaultClient.getSecret('sql-admin-password');
            password = secret.value;
            logger.info('Retrieved SQL password from Key Vault');
          } catch (error) {
            logger.error('Failed to get SQL password from Key Vault');
            throw new Error('SQL password not available');
          }
        }

        if (!password) {
          throw new Error('SQL password not provided');
        }

        this.connectionConfig = {
          server,
          database,
          user: username,
          password,
          options: {
            encrypt: true,
            trustServerCertificate: false,
            enableArithAbort: true,
          },
          pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000,
          },
        };
      }

      // Create connection pool
      this.pool = new sql.ConnectionPool(this.connectionConfig);
      
      // Set up event handlers
      this.pool.on('error', (error) => {
        logger.error('Database pool error:', error);
      });

      // Connect to database
      await this.pool.connect();
      logger.info('Successfully connected to SQL Server');

      // Initialize database schema
      await this.initializeSchema();
      
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async initializeSchema(): Promise<void> {
    try {
      if (!this.pool) {
        throw new Error('Database pool not initialized');
      }

      const request = this.pool.request();

      // Create Orders table if it doesn't exist
      await request.query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Orders' AND xtype='U')
        CREATE TABLE Orders (
          id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
          customerId NVARCHAR(255) NOT NULL,
          customerEmail NVARCHAR(255) NOT NULL,
          orderNumber NVARCHAR(50) UNIQUE NOT NULL,
          status NVARCHAR(50) NOT NULL DEFAULT 'pending',
          totalAmount DECIMAL(10,2) NOT NULL,
          currency NVARCHAR(3) NOT NULL DEFAULT 'USD',
          shippingAddress NTEXT,
          billingAddress NTEXT,
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          updatedAt DATETIME2 DEFAULT GETUTCDATE()
        )
      `);

      // Create OrderItems table if it doesn't exist
      await request.query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='OrderItems' AND xtype='U')
        CREATE TABLE OrderItems (
          id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
          orderId UNIQUEIDENTIFIER NOT NULL,
          productId NVARCHAR(255) NOT NULL,
          productName NVARCHAR(255) NOT NULL,
          quantity INT NOT NULL,
          unitPrice DECIMAL(10,2) NOT NULL,
          totalPrice DECIMAL(10,2) NOT NULL,
          FOREIGN KEY (orderId) REFERENCES Orders(id) ON DELETE CASCADE
        )
      `);

      // Create indexes
      await request.query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Orders_CustomerId')
        CREATE INDEX IX_Orders_CustomerId ON Orders(customerId)
      `);

      await request.query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Orders_Status')
        CREATE INDEX IX_Orders_Status ON Orders(status)
      `);

      await request.query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OrderItems_OrderId')
        CREATE INDEX IX_OrderItems_OrderId ON OrderItems(orderId)
      `);

      logger.info('Database schema initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database schema:', error);
      throw error;
    }
  }

  public async checkConnection(): Promise<void> {
    if (!this.pool || !this.pool.connected) {
      throw new Error('Database not connected');
    }

    try {
      const request = this.pool.request();
      await request.query('SELECT 1 as test');
    } catch (error) {
      throw new Error(`Database connection check failed: ${error}`);
    }
  }

  public getPool(): sql.ConnectionPool {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
    return this.pool;
  }

  // Order CRUD operations
  public async createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const transaction = this.pool.transaction();
    
    try {
      await transaction.begin();

      // Insert order
      const orderRequest = transaction.request();
      const orderResult = await orderRequest
        .input('customerId', sql.NVarChar, order.customerId)
        .input('customerEmail', sql.NVarChar, order.customerEmail)
        .input('orderNumber', sql.NVarChar, order.orderNumber)
        .input('status', sql.NVarChar, order.status)
        .input('totalAmount', sql.Decimal(10, 2), order.totalAmount)
        .input('currency', sql.NVarChar, order.currency)
        .input('shippingAddress', sql.NText, order.shippingAddress)
        .input('billingAddress', sql.NText, order.billingAddress)
        .query(`
          INSERT INTO Orders (customerId, customerEmail, orderNumber, status, totalAmount, currency, shippingAddress, billingAddress)
          OUTPUT INSERTED.*
          VALUES (@customerId, @customerEmail, @orderNumber, @status, @totalAmount, @currency, @shippingAddress, @billingAddress)
        `);

      const createdOrder = orderResult.recordset[0] as Order;

      // Insert order items
      for (const item of order.orderItems) {
        const itemRequest = transaction.request();
        await itemRequest
          .input('orderId', sql.UniqueIdentifier, createdOrder.id)
          .input('productId', sql.NVarChar, item.productId)
          .input('productName', sql.NVarChar, item.productName)
          .input('quantity', sql.Int, item.quantity)
          .input('unitPrice', sql.Decimal(10, 2), item.unitPrice)
          .input('totalPrice', sql.Decimal(10, 2), item.totalPrice)
          .query(`
            INSERT INTO OrderItems (orderId, productId, productName, quantity, unitPrice, totalPrice)
            VALUES (@orderId, @productId, @productName, @quantity, @unitPrice, @totalPrice)
          `);
      }

      await transaction.commit();
      
      // Fetch complete order with items
      const completeOrder = await this.getOrderById(createdOrder.id);
      logger.info(`Created order: ${createdOrder.id}`);
      
      return completeOrder!;
    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to create order:', error);
      throw error;
    }
  }

  public async getOrderById(orderId: string): Promise<Order | null> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    try {
      const request = this.pool.request();
      const result = await request
        .input('orderId', sql.UniqueIdentifier, orderId)
        .query(`
          SELECT o.*, 
                 oi.id as item_id, oi.productId, oi.productName, 
                 oi.quantity, oi.unitPrice, oi.totalPrice as item_total
          FROM Orders o
          LEFT JOIN OrderItems oi ON o.id = oi.orderId
          WHERE o.id = @orderId
        `);

      if (result.recordset.length === 0) {
        return null;
      }

      const orderData = result.recordset[0];
      const order: Order = {
        id: orderData.id,
        customerId: orderData.customerId,
        customerEmail: orderData.customerEmail,
        orderNumber: orderData.orderNumber,
        status: orderData.status,
        totalAmount: orderData.totalAmount,
        currency: orderData.currency,
        shippingAddress: orderData.shippingAddress,
        billingAddress: orderData.billingAddress,
        createdAt: orderData.createdAt,
        updatedAt: orderData.updatedAt,
        orderItems: result.recordset
          .filter(row => row.item_id)
          .map(row => ({
            id: row.item_id,
            orderId: row.id,
            productId: row.productId,
            productName: row.productName,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            totalPrice: row.item_total,
          })),
      };

      return order;
    } catch (error) {
      logger.error(`Failed to get order ${orderId}:`, error);
      throw error;
    }
  }

  public async getOrdersByCustomer(customerId: string, page: number = 1, pageSize: number = 10): Promise<{ orders: Order[]; totalCount: number }> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    try {
      const offset = (page - 1) * pageSize;
      const request = this.pool.request();

      // Get orders with pagination
      const ordersResult = await request
        .input('customerId', sql.NVarChar, customerId)
        .input('offset', sql.Int, offset)
        .input('pageSize', sql.Int, pageSize)
        .query(`
          SELECT * FROM Orders
          WHERE customerId = @customerId
          ORDER BY createdAt DESC
          OFFSET @offset ROWS
          FETCH NEXT @pageSize ROWS ONLY
        `);

      // Get total count
      const countRequest = this.pool.request();
      const countResult = await countRequest
        .input('customerId', sql.NVarChar, customerId)
        .query(`
          SELECT COUNT(*) as totalCount
          FROM Orders
          WHERE customerId = @customerId
        `);

      const orders: Order[] = [];
      
      // Get order items for each order
      for (const orderData of ordersResult.recordset) {
        const itemsRequest = this.pool.request();
        const itemsResult = await itemsRequest
          .input('orderId', sql.UniqueIdentifier, orderData.id)
          .query(`
            SELECT * FROM OrderItems
            WHERE orderId = @orderId
          `);

        const order: Order = {
          ...orderData,
          orderItems: itemsResult.recordset.map(item => ({
            id: item.id,
            orderId: item.orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        };

        orders.push(order);
      }

      return {
        orders,
        totalCount: countResult.recordset[0].totalCount,
      };
    } catch (error) {
      logger.error(`Failed to get orders for customer ${customerId}:`, error);
      throw error;
    }
  }

  public async updateOrderStatus(orderId: string, status: Order['status']): Promise<Order | null> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    try {
      const request = this.pool.request();
      await request
        .input('orderId', sql.UniqueIdentifier, orderId)
        .input('status', sql.NVarChar, status)
        .query(`
          UPDATE Orders 
          SET status = @status, updatedAt = GETUTCDATE()
          WHERE id = @orderId
        `);

      return await this.getOrderById(orderId);
    } catch (error) {
      logger.error(`Failed to update order ${orderId} status:`, error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.close();
        logger.info('Database connection closed');
      } catch (error) {
        logger.error('Error closing database connection:', error);
      }
    }
  }
}