// src/components/ErrorFallback.tsx
// Error boundary fallback component

import React from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Paper,
  Alert,
} from '@mui/material';
import {
  Refresh,
  Home,
  ErrorOutline,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetErrorBoundary }) => {
  const navigate = useNavigate();
  
  const handleGoHome = () => {
    navigate('/');
    resetErrorBoundary();
  };
  
  const handleRetry = () => {
    resetErrorBoundary();
  };
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return (
    <Container maxWidth="md" sx={{ py: 8 }}>
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        textAlign="center"
        gap={3}
      >
        <ErrorOutline 
          sx={{ 
            fontSize: 120, 
            color: 'error.main',
          }} 
        />
        
        <Typography variant="h3" component="h1" gutterBottom>
          Oops! Something went wrong
        </Typography>
        
        <Typography variant="h6" color="text.secondary" gutterBottom>
          We're sorry, but an unexpected error occurred.
        </Typography>
        
        <Typography variant="body1" color="text.secondary" gutterBottom>
          Our team has been notified and is working to fix the issue.
        </Typography>
        
        {/* Error Details (only in development) */}
        {isDevelopment && (
          <Paper 
            elevation={2} 
            sx={{ 
              p: 3, 
              mt: 3, 
              backgroundColor: 'grey.50',
              width: '100%',
              maxWidth: 600,
            }}
          >
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                Development Error Details
              </Typography>
            </Alert>
            
            <Typography 
              variant="body2" 
              component="pre" 
              sx={{ 
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                backgroundColor: 'grey.100',
                p: 2,
                borderRadius: 1,
              }}
            >
              <strong>Error:</strong> {error.message}
              {error.stack && (
                <>
                  <br /><br />
                  <strong>Stack Trace:</strong><br />
                  {error.stack}
                </>
              )}
            </Typography>
          </Paper>
        )}
        
        {/* Action Buttons */}
        <Box display="flex" gap={2} flexWrap="wrap" justifyContent="center" mt={3}>
          <Button
            variant="contained"
            size="large"
            startIcon={<Refresh />}
            onClick={handleRetry}
          >
            Try Again
          </Button>
          
          <Button
            variant="outlined"
            size="large"
            startIcon={<Home />}
            onClick={handleGoHome}
          >
            Go to Home
          </Button>
          
          <Button
            variant="text"
            size="large"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </Button>
        </Box>
        
        {/* Support Information */}
        <Paper 
          elevation={1}
          sx={{ 
            p: 2, 
            mt: 4,
            backgroundColor: 'primary.50',
            border: 1,
            borderColor: 'primary.200',
          }}
        >
          <Typography variant="body2" color="primary.main">
            <strong>Need help?</strong> Contact our support team at{' '}
            <a href="mailto:support@ecommerce-platform.com" style={{ color: 'inherit' }}>
              support@ecommerce-platform.com
            </a>
            {' '}or call <strong>+1 (555) 123-4567</strong>
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default ErrorFallback;