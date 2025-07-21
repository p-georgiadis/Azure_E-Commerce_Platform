// src/middleware/auth.ts
// Authentication middleware

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';
import { logger } from '../config/logger';
import { config } from '../config/config';

interface JwtPayload {
  sub: string; // user ID
  email: string;
  roles: string[];
  iat: number;
  exp: number;
  aud: string;
  iss: string;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
  };
}

class AuthService {
  private jwtSecret: string | null = null;
  private keyVaultClient: SecretClient | null = null;

  constructor() {
    // Initialize Key Vault client if configured
    if (config.azure.keyVaultUrl) {
      const credential = new DefaultAzureCredential();
      this.keyVaultClient = new SecretClient(config.azure.keyVaultUrl, credential);
    }
  }

  private async getJwtSecret(): Promise<string> {
    if (this.jwtSecret) {
      return this.jwtSecret;
    }

    // Try to get JWT secret from Key Vault first
    if (this.keyVaultClient) {
      try {
        const secret = await this.keyVaultClient.getSecret('jwt-secret');
        if (secret.value) {
          this.jwtSecret = secret.value;
          return this.jwtSecret;
        }
      } catch (error) {
        logger.warn('Failed to get JWT secret from Key Vault, using environment variable');
      }
    }

    // Fallback to environment variable
    if (config.auth.jwtSecret) {
      this.jwtSecret = config.auth.jwtSecret;
      return this.jwtSecret;
    }

    throw new Error('JWT secret not found');
  }

  public async verifyToken(token: string): Promise<JwtPayload> {
    try {
      const secret = await this.getJwtSecret();
      const payload = jwt.verify(token, secret, {
        audience: config.auth.audience,
        issuer: config.auth.issuer,
      }) as JwtPayload;

      return payload;
    } catch (error) {
      throw new Error(`Invalid token: ${error}`);
    }
  }
}

const authService = new AuthService();

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Bearer token required',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token not provided',
      });
      return;
    }

    // Verify token
    const payload = await authService.verifyToken(token);

    // Add user information to request
    req.user = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles || [],
    };

    logger.debug(`Authenticated user: ${payload.email} (${payload.sub})`);
    next();
  } catch (error) {
    logger.warn(`Authentication failed: ${error}`);
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
};

export const requireRole = (requiredRole: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    if (!req.user.roles.includes(requiredRole)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Role '${requiredRole}' required`,
      });
      return;
    }

    next();
  };
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      next();
      return;
    }

    const token = authHeader.substring(7);
    if (!token) {
      next();
      return;
    }

    // Try to verify token, but don't fail if invalid
    try {
      const payload = await authService.verifyToken(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles || [],
      };
    } catch (error) {
      // Log warning but continue without authentication
      logger.warn(`Optional authentication failed: ${error}`);
    }

    next();
  } catch (error) {
    // Continue without authentication on any error
    logger.warn(`Optional authentication error: ${error}`);
    next();
  }
};