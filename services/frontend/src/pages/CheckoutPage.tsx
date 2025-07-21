// src/pages/CheckoutPage.tsx
// Checkout page with order summary and payment

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Grid,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  Alert,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { Helmet } from 'react-helmet-async';

import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { items, getTotalItems, getTotalPrice } = useCart();
  const { user } = useAuth();
  
  const [activeStep, setActiveStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const totalItems = getTotalItems();
  const totalPrice = getTotalPrice();
  const shippingCost = totalPrice >= 50 ? 0 : 5.99;
  const tax = totalPrice * 0.08;
  const finalTotal = totalPrice + shippingCost + tax;
  
  const steps = ['Review Order', 'Shipping Details', 'Payment', 'Confirmation'];
  
  // Redirect if cart is empty
  if (items.length === 0) {
    navigate('/cart');
    return null;
  }
  
  // Redirect if not logged in
  if (!user) {
    navigate('/login', { state: { from: { pathname: '/checkout' } } });
    return null;
  }
  
  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };
  
  const handleBack = () => {
    if (activeStep === 0) {
      navigate('/cart');
    } else {
      setActiveStep((prevStep) => prevStep - 1);
    }
  };
  
  const handlePlaceOrder = async () => {
    setIsProcessing(true);
    
    try {
      // Mock order placement
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Navigate to success page
      navigate('/checkout/success');
    } catch (error) {
      console.error('Order placement failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  if (isProcessing) {
    return <LoadingSpinner message="Processing your order..." fullScreen />;
  }
  
  return (
    <>
      <Helmet>
        <title>Checkout - E-Commerce Platform</title>
        <meta name="description" content="Complete your purchase securely with our checkout process." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      
      <Container maxWidth="lg">
        <Box py={4}>
          {/* Header */}
          <Box display="flex" alignItems="center" gap={2} mb={4}>
            <Button
              variant="text"
              startIcon={<ArrowBack />}
              onClick={handleBack}
            >
              {activeStep === 0 ? 'Back to Cart' : 'Back'}
            </Button>
            <Typography variant="h3" component="h1">
              Checkout
            </Typography>
          </Box>
          
          {/* Stepper */}
          <Paper sx={{ p: 3, mb: 4 }}>
            <Stepper activeStep={activeStep} alternativeLabel>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Paper>
          
          <Grid container spacing={4}>
            {/* Main Content */}
            <Grid item xs={12} lg={8}>
              <Paper sx={{ p: 3 }}>
                {activeStep === 0 && (
                  <Box>
                    <Typography variant="h5" gutterBottom>
                      Review Your Order
                    </Typography>
                    <Typography variant="body1" color="text.secondary" gutterBottom>
                      Please review your order details before proceeding.
                    </Typography>
                    
                    {items.map((item) => (
                      <Box key={item.id} display="flex" justifyContent="space-between" py={2}>
                        <Box>
                          <Typography variant="body1">{item.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Quantity: {item.quantity} × {formatCurrency(item.price)}
                          </Typography>
                        </Box>
                        <Typography variant="body1">
                          {formatCurrency(item.price * item.quantity)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
                
                {activeStep === 1 && (
                  <Box>
                    <Typography variant="h5" gutterBottom>
                      Shipping Details
                    </Typography>
                    <Alert severity="info">
                      Shipping form would be implemented here with address fields.
                    </Alert>
                  </Box>
                )}
                
                {activeStep === 2 && (
                  <Box>
                    <Typography variant="h5" gutterBottom>
                      Payment Information
                    </Typography>
                    <Alert severity="info">
                      Payment form would be implemented here with secure payment processing.
                    </Alert>
                  </Box>
                )}
                
                {activeStep === 3 && (
                  <Box>
                    <Typography variant="h5" gutterBottom>
                      Order Confirmation
                    </Typography>
                    <Alert severity="success">
                      Your order has been placed successfully!
                    </Alert>
                  </Box>
                )}
                
                {/* Navigation Buttons */}
                <Box display="flex" justifyContent="space-between" mt={4}>
                  <Button onClick={handleBack}>
                    {activeStep === 0 ? 'Back to Cart' : 'Back'}
                  </Button>
                  
                  {activeStep === steps.length - 1 ? (
                    <Button
                      variant="contained"
                      onClick={handlePlaceOrder}
                      disabled={isProcessing}
                    >
                      Place Order
                    </Button>
                  ) : (
                    <Button variant="contained" onClick={handleNext}>
                      Next
                    </Button>
                  )}
                </Box>
              </Paper>
            </Grid>
            
            {/* Order Summary Sidebar */}
            <Grid item xs={12} lg={4}>
              <Paper sx={{ p: 3, position: 'sticky', top: 24 }}>
                <Typography variant="h6" gutterBottom>
                  Order Summary
                </Typography>
                
                <Box mb={2}>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body2">
                      Subtotal ({totalItems} items)
                    </Typography>
                    <Typography variant="body2">
                      {formatCurrency(totalPrice)}
                    </Typography>
                  </Box>
                  
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body2">Shipping</Typography>
                    <Typography variant="body2">
                      {shippingCost > 0 ? formatCurrency(shippingCost) : 'Free'}
                    </Typography>
                  </Box>
                  
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body2">Tax</Typography>
                    <Typography variant="body2">
                      {formatCurrency(tax)}
                    </Typography>
                  </Box>
                  
                  <Box display="flex" justifyContent="space-between" pt={1} borderTop={1} borderColor="grey.300">
                    <Typography variant="h6">Total</Typography>
                    <Typography variant="h6" color="primary">
                      {formatCurrency(finalTotal)}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </>
  );
};

export default CheckoutPage;