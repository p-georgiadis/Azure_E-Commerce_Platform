// src/pages/CartPage.tsx
// Shopping cart page with checkout functionality

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Button,
  IconButton,
  TextField,
  Divider,
  Alert,
  Paper,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  InputAdornment,
} from '@mui/material';
import {
  Add,
  Remove,
  Delete,
  ShoppingCartOutlined,
  ArrowBack,
  ShoppingBag,
} from '@mui/icons-material';
import { Helmet } from 'react-helmet-async';

import { useCart, CartItem } from '../contexts/CartContext';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    items, 
    updateQuantity, 
    removeFromCart, 
    clearCart, 
    getTotalItems, 
    getTotalPrice 
  } = useCart();
  
  const totalItems = getTotalItems();
  const totalPrice = getTotalPrice();
  const shippingCost = totalPrice >= 50 ? 0 : 5.99;
  const tax = totalPrice * 0.08; // 8% tax
  const finalTotal = totalPrice + shippingCost + tax;
  
  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(itemId);
    } else {
      updateQuantity(itemId, newQuantity);
    }
  };
  
  const handleProceedToCheckout = () => {
    navigate('/checkout');
  };
  
  const handleContinueShopping = () => {
    navigate('/products');
  };
  
  if (items.length === 0) {
    return (
      <>
        <Helmet>
          <title>Shopping Cart - E-Commerce Platform</title>
          <meta name="description" content="Your shopping cart is empty. Start shopping for amazing products!" />
        </Helmet>
        
        <Container maxWidth="md">
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            minHeight="50vh"
            textAlign="center"
            py={8}
          >
            <ShoppingCartOutlined 
              sx={{ fontSize: 120, color: 'grey.400', mb: 3 }} 
            />
            <Typography variant="h4" gutterBottom>
              Your cart is empty
            </Typography>
            <Typography variant="body1" color="text.secondary" gutterBottom>
              Looks like you haven't added anything to your cart yet.
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<ShoppingBag />}
              onClick={handleContinueShopping}
              sx={{ mt: 3 }}
            >
              Start Shopping
            </Button>
          </Box>
        </Container>
      </>
    );
  }
  
  return (
    <>
      <Helmet>
        <title>Shopping Cart ({totalItems} items) - E-Commerce Platform</title>
        <meta name="description" content={`Your shopping cart contains ${totalItems} items. Review and proceed to checkout.`} />
      </Helmet>
      
      <Container maxWidth="lg">
        <Box py={4}>
          {/* Header */}
          <Box display="flex" alignItems="center" gap={2} mb={4}>
            <Button
              variant="text"
              startIcon={<ArrowBack />}
              onClick={handleContinueShopping}
            >
              Continue Shopping
            </Button>
            <Typography variant="h3" component="h1">
              Shopping Cart
            </Typography>
          </Box>
          
          <Grid container spacing={4}>
            {/* Cart Items */}
            <Grid item xs={12} lg={8}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h5" component="h2">
                      Cart Items ({totalItems})
                    </Typography>
                    <Button
                      variant="text"
                      color="error"
                      startIcon={<Delete />}
                      onClick={clearCart}
                      size="small"
                    >
                      Clear Cart
                    </Button>
                  </Box>
                  
                  <Divider sx={{ mb: 2 }} />
                  
                  <List>
                    {items.map((item, index) => (
                      <React.Fragment key={item.id}>
                        <ListItem
                          alignItems="flex-start"
                          sx={{
                            px: 0,
                            py: 2,
                          }}
                        >
                          <ListItemAvatar>
                            <Avatar
                              variant="rounded"
                              src={item.image_url || '/images/placeholder-product.jpg'}
                              alt={item.name}
                              sx={{ width: 80, height: 80, mr: 2 }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/images/placeholder-product.jpg';
                              }}
                            />
                          </ListItemAvatar>
                          
                          <ListItemText
                            primary={
                              <Typography
                                variant="h6"
                                component="div"
                                sx={{ 
                                  cursor: 'pointer',
                                  '&:hover': { color: 'primary.main' }
                                }}
                                onClick={() => navigate(`/products/${item.id}`)}
                              >
                                {item.name}
                              </Typography>
                            }
                            secondary={
                              <Box mt={1}>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                  Price: {formatCurrency(item.price)}
                                </Typography>
                                
                                {/* Quantity Controls */}
                                <Box display="flex" alignItems="center" gap={1} mt={2}>
                                  <Typography variant="body2" sx={{ mr: 1 }}>
                                    Quantity:
                                  </Typography>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                    disabled={item.quantity <= 1}
                                  >
                                    <Remove />
                                  </IconButton>
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const newQuantity = parseInt(e.target.value) || 1;
                                      handleQuantityChange(item.id, newQuantity);
                                    }}
                                    inputProps={{ min: 1, max: 99 }}
                                    sx={{ width: 70 }}
                                  />
                                  <IconButton
                                    size="small"
                                    onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                  >
                                    <Add />
                                  </IconButton>
                                  
                                  <IconButton
                                    color="error"
                                    onClick={() => removeFromCart(item.id)}
                                    sx={{ ml: 2 }}
                                    aria-label={`Remove ${item.name} from cart`}
                                  >
                                    <Delete />
                                  </IconButton>
                                </Box>
                              </Box>
                            }
                          />
                          
                          {/* Item Total */}
                          <Box textAlign="right" ml={2}>
                            <Typography variant="h6" color="primary">
                              {formatCurrency(item.price * item.quantity)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {item.quantity} × {formatCurrency(item.price)}
                            </Typography>
                          </Box>
                        </ListItem>
                        
                        {index < items.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
            
            {/* Order Summary */}
            <Grid item xs={12} lg={4}>
              <Paper elevation={2} sx={{ p: 3, position: 'sticky', top: 24 }}>
                <Typography variant="h5" gutterBottom>
                  Order Summary
                </Typography>
                
                <Box mb={3}>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body1">
                      Subtotal ({totalItems} items)
                    </Typography>
                    <Typography variant="body1">
                      {formatCurrency(totalPrice)}
                    </Typography>
                  </Box>
                  
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body1">
                      Shipping
                      {totalPrice >= 50 && (
                        <Typography component="span" variant="body2" color="success.main" sx={{ ml: 1 }}>
                          (Free)
                        </Typography>
                      )}
                    </Typography>
                    <Typography variant="body1">
                      {shippingCost > 0 ? formatCurrency(shippingCost) : 'Free'}
                    </Typography>
                  </Box>
                  
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body1">
                      Tax (8%)
                    </Typography>
                    <Typography variant="body1">
                      {formatCurrency(tax)}
                    </Typography>
                  </Box>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography variant="h6">
                      Total
                    </Typography>
                    <Typography variant="h6" color="primary">
                      {formatCurrency(finalTotal)}
                    </Typography>
                  </Box>
                </Box>
                
                {totalPrice < 50 && (
                  <Alert severity="info" sx={{ mb: 3 }}>
                    <Typography variant="body2">
                      Add {formatCurrency(50 - totalPrice)} more for free shipping!
                    </Typography>
                  </Alert>
                )}
                
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  onClick={handleProceedToCheckout}
                  sx={{ mb: 2 }}
                >
                  Proceed to Checkout
                </Button>
                
                <Button
                  variant="outlined"
                  size="large"
                  fullWidth
                  onClick={handleContinueShopping}
                >
                  Continue Shopping
                </Button>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </>
  );
};

export default CartPage;