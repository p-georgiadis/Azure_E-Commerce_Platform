// src/App.tsx
// Main React application component with Application Insights integration
// Following PRP pattern from requirements for telemetry integration

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ReactQueryDevtools } from 'react-query/devtools';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { HelmetProvider } from 'react-helmet-async';
import { ErrorBoundary } from 'react-error-boundary';

// Application Insights integration (following PRP requirement)
import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { ReactPlugin } from '@microsoft/applicationinsights-react-js';

// Components and Pages
import Header from './components/Header';
import Footer from './components/Footer';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorFallback from './components/ErrorFallback';
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrdersPage from './pages/OrdersPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import NotFoundPage from './pages/NotFoundPage';

// Contexts and Theme
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { theme } from './theme';
import './App.css';

// Initialize Application Insights
const reactPlugin = new ReactPlugin();
const appInsights = new ApplicationInsights({
  config: {
    connectionString: process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING,
    extensions: [reactPlugin],
    extensionConfig: {
      [reactPlugin.identifier]: { history: window.history }
    },
    enableAutoRouteTracking: true,
    enableCorsCorrelation: true,
    enableRequestHeaderTracking: true,
    enableResponseHeaderTracking: true,
    disableFetchTracking: false,
    enableAjaxErrorStatusText: true,
    enableUnhandledPromiseRejectionTracking: true,
  }
});

// Initialize Application Insights only in production
if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING) {
  appInsights.loadAppInsights();
  appInsights.trackPageView(); // Manually track page view on app start
}

// Create React Query client with error handling
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        return failureCount < 3;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
    mutations: {
      retry: 1,
    },
  },
});

// Error logging function
const logError = (error: Error, errorInfo: { componentStack: string }) => {
  console.error('Application Error:', error, errorInfo);
  
  // Send error to Application Insights
  if (appInsights && process.env.NODE_ENV === 'production') {
    appInsights.trackException({
      exception: error,
      properties: {
        componentStack: errorInfo.componentStack,
      },
    });
  }
};

function App() {
  useEffect(() => {
    // Track app initialization
    if (appInsights && process.env.NODE_ENV === 'production') {
      appInsights.trackEvent({
        name: 'AppInitialized',
        properties: {
          environment: process.env.NODE_ENV,
          version: process.env.REACT_APP_VERSION || '1.0.0',
        },
      });
    }

    // Set up global error handler for unhandled promises
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      if (appInsights && process.env.NODE_ENV === 'production') {
        appInsights.trackException({
          exception: new Error(event.reason),
          properties: {
            type: 'UnhandledPromiseRejection',
          },
        });
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onError={logError}>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <AuthProvider>
              <CartProvider>
                <Router>
                  <div className="App">
                    <Header />
                    <main className="main-content">
                      <Suspense fallback={<LoadingSpinner />}>
                        <Routes>
                          <Route path="/" element={<HomePage />} />
                          <Route path="/products" element={<ProductsPage />} />
                          <Route path="/products/:id" element={<ProductDetailPage />} />
                          <Route path="/cart" element={<CartPage />} />
                          <Route path="/checkout" element={<CheckoutPage />} />
                          <Route path="/orders" element={<OrdersPage />} />
                          <Route path="/login" element={<LoginPage />} />
                          <Route path="/register" element={<RegisterPage />} />
                          <Route path="*" element={<NotFoundPage />} />
                        </Routes>
                      </Suspense>
                    </main>
                    <Footer />
                  </div>
                </Router>
              </CartProvider>
            </AuthProvider>
          </ThemeProvider>
          {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;