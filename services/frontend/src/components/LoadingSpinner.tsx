// src/components/LoadingSpinner.tsx
// Loading spinner component

import React from 'react';
import {
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';

interface LoadingSpinnerProps {
  message?: string;
  size?: number;
  fullScreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  size = 40,
  fullScreen = false,
}) => {
  const containerStyles = fullScreen
    ? {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        zIndex: 9999,
      }
    : {};

  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      p={3}
      minHeight={fullScreen ? '100vh' : '200px'}
      sx={containerStyles}
    >
      <CircularProgress 
        size={size} 
        sx={{ mb: 2 }}
        aria-label="Loading"
      />
      <Typography 
        variant="body1" 
        color="text.secondary"
        aria-live="polite"
      >
        {message}
      </Typography>
    </Box>
  );
};

export default LoadingSpinner;