// src/components/ErrorMessage.tsx
// Error message component with retry functionality

import React from 'react';
import {
  Box,
  Alert,
  AlertTitle,
  Button,
  Typography,
} from '@mui/material';
import { Refresh, ErrorOutline } from '@mui/icons-material';

interface ErrorMessageProps {
  message: string;
  title?: string;
  onRetry?: () => void;
  retryText?: string;
  variant?: 'error' | 'warning' | 'info';
  fullWidth?: boolean;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  title = 'Something went wrong',
  onRetry,
  retryText = 'Try Again',
  variant = 'error',
  fullWidth = true,
}) => {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      p={3}
      sx={{
        width: fullWidth ? '100%' : 'auto',
        maxWidth: '500px',
        mx: 'auto',
      }}
    >
      <Alert 
        severity={variant}
        sx={{ 
          width: '100%',
          '& .MuiAlert-message': {
            width: '100%',
          },
        }}
        icon={<ErrorOutline />}
      >
        <AlertTitle sx={{ fontWeight: 'bold' }}>
          {title}
        </AlertTitle>
        <Typography variant="body2" sx={{ mt: 1 }}>
          {message}
        </Typography>
        
        {onRetry && (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="outlined"
              color={variant === 'error' ? 'error' : 'primary'}
              startIcon={<Refresh />}
              onClick={onRetry}
              size="small"
            >
              {retryText}
            </Button>
          </Box>
        )}
      </Alert>
    </Box>
  );
};

export default ErrorMessage;