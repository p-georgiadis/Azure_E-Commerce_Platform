// src/config/config.ts
// Application configuration

interface DatabaseConfig {
  server: string;
  database: string;
  username: string;
  password?: string;
  connectionString?: string;
  pool: {
    max: number;
    min: number;
    idle: number;
  };
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    enableArithAbort: boolean;
  };
}

interface ServiceBusConfig {
  namespace: string;
  connectionString?: string;
  orderEventsTopic: string;
  paymentQueue: string;
}

interface AuthConfig {
  jwtSecret?: string;
  jwtExpiration: string;
  audience: string;
  issuer: string;
}

interface AppConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  database: DatabaseConfig;
  serviceBus: ServiceBusConfig;
  auth: AuthConfig;
  azure: {
    keyVaultUrl?: string;
    applicationInsightsConnectionString?: string;
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '8001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  },

  database: {
    server: process.env.SQL_SERVER || 'sql-ecommerce-dev.database.windows.net',
    database: process.env.SQL_DATABASE || 'orders',
    username: process.env.SQL_USERNAME || 'ecommerceadmin',
    password: process.env.SQL_PASSWORD,
    connectionString: process.env.SQL_CONNECTION_STRING,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      min: parseInt(process.env.DB_POOL_MIN || '0'),
      idle: parseInt(process.env.DB_POOL_IDLE || '30000'),
    },
    options: {
      encrypt: true,
      trustServerCertificate: process.env.NODE_ENV === 'development',
      enableArithAbort: true,
    },
  },

  serviceBus: {
    namespace: process.env.SERVICE_BUS_NAMESPACE || 'sb-ecommerce-dev.servicebus.windows.net',
    connectionString: process.env.SERVICE_BUS_CONNECTION_STRING,
    orderEventsTopic: process.env.ORDER_EVENTS_TOPIC || 'order-events',
    paymentQueue: process.env.PAYMENT_QUEUE || 'payment-processing',
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiration: process.env.JWT_EXPIRATION || '24h',
    audience: process.env.JWT_AUDIENCE || 'ecommerce-api',
    issuer: process.env.JWT_ISSUER || 'ecommerce-platform',
  },

  azure: {
    keyVaultUrl: process.env.KEY_VAULT_URL,
    applicationInsightsConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  },
};

// Validation
export const validateConfig = (): void => {
  const required = [
    'database.server',
    'database.database',
    'database.username',
  ];

  const missing: string[] = [];

  for (const key of required) {
    const value = key.split('.').reduce((obj: any, k) => obj?.[k], config);
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  // Warn about missing optional but important configs
  if (!config.database.password && !config.database.connectionString) {
    console.warn('Warning: No database password or connection string provided');
  }

  if (!config.auth.jwtSecret) {
    console.warn('Warning: No JWT secret provided');
  }
};

export default config;