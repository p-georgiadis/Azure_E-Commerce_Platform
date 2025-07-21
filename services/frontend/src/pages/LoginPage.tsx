// src/pages/LoginPage.tsx
// User login page with form validation

import React, { useState } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Link,
  InputAdornment,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Login as LoginIcon,
  PersonAdd,
} from '@mui/icons-material';
import { Helmet } from 'react-helmet-async';
import { useFormik } from 'formik';
import * as Yup from 'yup';

import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const validationSchema = Yup.object({
  email: Yup.string()
    .email('Enter a valid email address')
    .required('Email is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
});

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  
  // Redirect to intended page after login
  const from = (location.state as any)?.from?.pathname || '/';
  
  const formik = useFormik({
    initialValues: {
      email: '',
      password: '',
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        setLoginError('');
        await login(values.email, values.password);
        navigate(from, { replace: true });
      } catch (error: any) {
        setLoginError(
          error.response?.data?.message || 
          error.message || 
          'Login failed. Please check your credentials and try again.'
        );
      }
    },
  });
  
  const handleTogglePassword = () => {
    setShowPassword(!showPassword);
  };
  
  if (isLoading) {
    return <LoadingSpinner message="Logging in..." fullScreen />;
  }
  
  return (
    <>
      <Helmet>
        <title>Login - E-Commerce Platform</title>
        <meta name="description" content="Sign in to your account to access your orders, wishlist, and more." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      
      <Container component="main" maxWidth="sm">
        <Box
          sx={{
            marginTop: 8,
            marginBottom: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Paper
            elevation={3}
            sx={{
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <LoginIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
            
            <Typography component="h1" variant="h4" gutterBottom>
              Sign In
            </Typography>
            
            <Typography variant="body2" color="text.secondary" align="center" gutterBottom>
              Welcome back! Please sign in to your account.
            </Typography>
            
            {loginError && (
              <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
                {loginError}
              </Alert>
            )}
            
            <Box component="form" onSubmit={formik.handleSubmit} sx={{ mt: 2, width: '100%' }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                autoFocus
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.email && Boolean(formik.errors.email)}
                helperText={formik.touched.email && formik.errors.email}
              />
              
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="current-password"
                value={formik.values.password}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.password && Boolean(formik.errors.password)}
                helperText={formik.touched.password && formik.errors.password}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={handleTogglePassword}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isLoading || !formik.isValid}
                sx={{ mt: 3, mb: 2 }}
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </Button>
              
              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Link
                  component={RouterLink}
                  to="/forgot-password"
                  variant="body2"
                  sx={{ textDecoration: 'none' }}
                >
                  Forgot your password?
                </Link>
              </Box>
              
              <Divider sx={{ my: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  OR
                </Typography>
              </Divider>
              
              <Button
                fullWidth
                variant="outlined"
                startIcon={<PersonAdd />}
                component={RouterLink}
                to="/register"
                sx={{ mt: 1 }}
              >
                Create New Account
              </Button>
            </Box>
          </Paper>
          
          {/* Demo Credentials */}
          <Paper
            elevation={1}
            sx={{
              p: 2,
              mt: 2,
              width: '100%',
              backgroundColor: 'grey.50',
            }}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              <strong>Demo Credentials:</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Email: demo@example.com<br />
              Password: demo123
            </Typography>
          </Paper>
        </Box>
      </Container>
    </>
  );
};

export default LoginPage;