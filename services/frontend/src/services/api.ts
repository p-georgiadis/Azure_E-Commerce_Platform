// src/services/api.ts
// API service layer with error handling and authentication

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';

// Types
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  sku: string;
  stock_quantity: number;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerEmail: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  totalAmount: number;
  currency: string;
  shippingAddress: string;
  billingAddress: string;
  orderItems: OrderItem[];
  createdAt: string;
  updatedAt: string;
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

export interface CreateOrderRequest {
  shippingAddress: string;
  billingAddress: string;
  currency?: string;
  orderItems: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
}

export interface PaymentRequest {
  order_id: string;
  amount: number;
  currency: string;
  payment_method: 'credit_card' | 'debit_card' | 'paypal' | 'bank_transfer';
  card_token?: string;
  billing_address: Record<string, any>;
}

export interface PaymentResponse {
  payment_id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed';
  transaction_id?: string;
  authorization_code?: string;
  error_code?: string;
  error_message?: string;
  created_at: string;
  processed_at?: string;
}

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

class ApiService {
  private client: AxiosInstance;
  private appInsights?: ApplicationInsights;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Initialize Application Insights if available
    if (process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING) {
      this.appInsights = new ApplicationInsights({
        config: {
          connectionString: process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING,
        },
      });
    }

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add authentication token if available
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add request ID for tracking
        config.headers['X-Request-ID'] = this.generateRequestId();

        // Track API calls with Application Insights
        if (this.appInsights) {
          this.appInsights.trackDependencyData({
            name: `${config.method?.toUpperCase()} ${config.url}`,
            data: config.url || '',
            duration: 0, // Will be updated in response interceptor
            success: true, // Will be updated in response interceptor
            type: 'Http',
          });
        }

        return config;
      },
      (error) => {
        console.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        // Track successful API responses
        if (this.appInsights) {
          this.appInsights.trackDependencyData({
            name: `${response.config.method?.toUpperCase()} ${response.config.url}`,
            data: response.config.url || '',
            duration: this.calculateDuration(response.config),
            success: true,
            type: 'Http',
            responseCode: response.status,
          });
        }

        return response;
      },
      (error) => {
        // Handle different types of errors
        if (error.response) {
          // Server responded with error status
          const { status, data } = error.response;

          // Track failed API responses
          if (this.appInsights) {
            this.appInsights.trackDependencyData({
              name: `${error.config?.method?.toUpperCase()} ${error.config?.url}`,
              data: error.config?.url || '',
              duration: this.calculateDuration(error.config),
              success: false,
              type: 'Http',
              responseCode: status,
            });
          }

          // Handle authentication errors
          if (status === 401) {
            this.handleAuthError();
          }

          // Format error message
          const errorMessage = data?.message || data?.error || 'An error occurred';
          throw new Error(`${status}: ${errorMessage}`);
        } else if (error.request) {
          // Network error
          console.error('Network error:', error.request);
          throw new Error('Network error - please check your connection');
        } else {
          // Other error
          console.error('API error:', error.message);
          throw new Error(error.message || 'An unexpected error occurred');
        }
      }
    );
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateDuration(config: any): number {
    // Simple duration calculation - in a real app, you'd track start time
    return performance.now() % 1000; // Mock duration
  }

  private handleAuthError() {
    // Clear stored token
    localStorage.removeItem('authToken');
    
    // Redirect to login page
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  // Product API methods
  async getProducts(params?: {
    search?: string;
    category?: string;
    sort_by?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ProductsResponse> {
    const response = await this.client.get('/products', { params });
    return response.data;
  }

  async getProduct(id: string): Promise<Product> {
    const response = await this.client.get(`/products/${id}`);
    return response.data;
  }

  async getProductsByCategory(category: string, params?: {
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<Product>> {
    const response = await this.client.get(`/products/category/${category}`, { params });
    return response.data;
  }

  // Order API methods
  async getOrders(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<Order>> {
    const response = await this.client.get('/orders', { params });
    return response.data;
  }

  async getOrder(id: string): Promise<Order> {
    const response = await this.client.get(`/orders/${id}`);
    return response.data;
  }

  async createOrder(orderData: CreateOrderRequest): Promise<Order> {
    const response = await this.client.post('/orders', orderData);
    return response.data;
  }

  async cancelOrder(id: string): Promise<Order> {
    const response = await this.client.patch(`/orders/${id}/cancel`);
    return response.data;
  }

  // Payment API methods
  async processPayment(paymentData: PaymentRequest): Promise<PaymentResponse> {
    const response = await this.client.post('/payments', paymentData);
    return response.data;
  }

  async getPayment(id: string): Promise<PaymentResponse> {
    const response = await this.client.get(`/payments/${id}`);
    return response.data;
  }

  async refundPayment(paymentId: string, refundData: {
    amount?: number;
    reason: string;
  }): Promise<any> {
    const response = await this.client.post(`/payments/${paymentId}/refund`, refundData);
    return response.data;
  }

  // Authentication API methods (mock implementation)
  async login(credentials: { email: string; password: string }): Promise<{
    token: string;
    user: { id: string; email: string; name?: string; role?: string; created_at: string };
  }> {
    // Mock login - in real implementation, this would call authentication service
    const response = await this.client.post('/auth/login', credentials);
    return response.data;
  }

  async register(userData: {
    email: string;
    password: string;
    name?: string;
  }): Promise<{
    token: string;
    user: { id: string; email: string; name?: string; role?: string; created_at: string };
  }> {
    // Mock register - in real implementation, this would call authentication service
    const response = await this.client.post('/auth/register', userData);
    return response.data;
  }

  async getCurrentUser(): Promise<{
    id: string;
    email: string;
    name?: string;
    role?: string;
    created_at: string;
  }> {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  async logout(): Promise<void> {
    // Clear local storage
    localStorage.removeItem('authToken');
    
    // Track logout event
    if (this.appInsights) {
      this.appInsights.trackEvent({
        name: 'UserLogout',
      });
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;