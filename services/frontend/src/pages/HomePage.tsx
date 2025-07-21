// src/pages/HomePage.tsx
// Home page component with featured products and categories

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardMedia,
  CardActions,
  Button,
  Box,
  Chip,
  Alert,
} from '@mui/material';
import { Helmet } from 'react-helmet-async';
import { useQuery } from 'react-query';
import { ShoppingCart, Storefront, LocalShipping, Security } from '@mui/icons-material';

import { apiService, Product } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { useCart } from '../contexts/CartContext';
import { formatCurrency } from '../utils/format';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();

  // Fetch featured products
  const {
    data: productsData,
    isLoading,
    error,
  } = useQuery(
    'featured-products',
    () => apiService.getProducts({ page: 1, pageSize: 6 }),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  const handleAddToCart = (product: Product) => {
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image_url: product.image_url,
    });
  };

  const handleViewProduct = (productId: string) => {
    navigate(`/products/${productId}`);
  };

  const features = [
    {
      icon: <Storefront fontSize="large" />,
      title: 'Wide Selection',
      description: 'Thousands of products across multiple categories',
    },
    {
      icon: <LocalShipping fontSize="large" />,
      title: 'Fast Delivery',
      description: 'Free shipping on orders over $50',
    },
    {
      icon: <Security fontSize="large" />,
      title: 'Secure Shopping',
      description: 'Your data and payments are always protected',
    },
  ];

  const categories = [
    { name: 'Electronics', image: '/images/categories/electronics.jpg', count: '250+ items' },
    { name: 'Clothing', image: '/images/categories/clothing.jpg', count: '500+ items' },
    { name: 'Books', image: '/images/categories/books.jpg', count: '1000+ items' },
    { name: 'Home & Garden', image: '/images/categories/home.jpg', count: '300+ items' },
  ];

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <Container>
        <ErrorMessage 
          message="Failed to load featured products. Please try again later." 
          onRetry={() => window.location.reload()}
        />
      </Container>
    );
  }

  return (
    <>
      <Helmet>
        <title>E-Commerce Platform - Your One-Stop Shop</title>
        <meta 
          name="description" 
          content="Discover amazing products at great prices. Shop electronics, clothing, books, and more with fast, secure delivery." 
        />
        <meta name="keywords" content="ecommerce, shopping, products, online store" />
      </Helmet>

      <Container maxWidth="lg">
        {/* Hero Section */}
        <Box
          sx={{
            backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 2,
            color: 'white',
            p: 4,
            mb: 4,
            textAlign: 'center',
          }}
        >
          <Typography variant="h2" component="h1" gutterBottom>
            Welcome to E-Commerce Platform
          </Typography>
          <Typography variant="h5" gutterBottom>
            Discover amazing products at unbeatable prices
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            size="large"
            startIcon={<ShoppingCart />}
            onClick={() => navigate('/products')}
            sx={{ mt: 2 }}
          >
            Shop Now
          </Button>
        </Box>

        {/* Features Section */}
        <Box mb={4}>
          <Typography variant="h4" component="h2" textAlign="center" gutterBottom>
            Why Shop With Us?
          </Typography>
          <Grid container spacing={3} sx={{ mt: 2 }}>
            {features.map((feature, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card
                  sx={{
                    textAlign: 'center',
                    p: 2,
                    height: '100%',
                    transition: 'transform 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                    },
                  }}
                >
                  <CardContent>
                    <Box color="primary.main" mb={2}>
                      {feature.icon}
                    </Box>
                    <Typography variant="h6" component="h3" gutterBottom>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {feature.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Categories Section */}
        <Box mb={4}>
          <Typography variant="h4" component="h2" textAlign="center" gutterBottom>
            Shop by Category
          </Typography>
          <Grid container spacing={3} sx={{ mt: 2 }}>
            {categories.map((category, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    '&:hover': {
                      transform: 'scale(1.02)',
                    },
                  }}
                  onClick={() => navigate(`/products?category=${category.name.toLowerCase()}`)}
                >
                  <CardMedia
                    component="img"
                    height="140"
                    image={category.image}
                    alt={category.name}
                    sx={{
                      objectFit: 'cover',
                      backgroundColor: 'grey.200',
                    }}
                    onError={(e) => {
                      // Fallback for missing images
                      (e.target as HTMLImageElement).src = '/images/placeholder.jpg';
                    }}
                  />
                  <CardContent>
                    <Typography variant="h6" component="h3">
                      {category.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {category.count}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Featured Products Section */}
        <Box mb={4}>
          <Typography variant="h4" component="h2" textAlign="center" gutterBottom>
            Featured Products
          </Typography>
          {productsData?.data.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              No featured products available at the moment.
            </Alert>
          ) : (
            <Grid container spacing={3} sx={{ mt: 2 }}>
              {productsData?.data.slice(0, 6).map((product) => (
                <Grid item xs={12} sm={6} md={4} key={product.id}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 0.2s',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                      },
                    }}
                  >
                    <CardMedia
                      component="img"
                      height="200"
                      image={product.image_url || '/images/placeholder-product.jpg'}
                      alt={product.name}
                      sx={{ objectFit: 'cover', cursor: 'pointer' }}
                      onClick={() => handleViewProduct(product.id)}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/placeholder-product.jpg';
                      }}
                    />
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Typography 
                        variant="h6" 
                        component="h3" 
                        gutterBottom
                        sx={{ 
                          cursor: 'pointer',
                          '&:hover': { color: 'primary.main' }
                        }}
                        onClick={() => handleViewProduct(product.id)}
                      >
                        {product.name}
                      </Typography>
                      <Typography 
                        variant="body2" 
                        color="text.secondary" 
                        gutterBottom
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {product.description}
                      </Typography>
                      <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
                        <Typography variant="h6" color="primary.main" component="div">
                          {formatCurrency(product.price)}
                        </Typography>
                        <Chip 
                          label={product.category} 
                          size="small" 
                          variant="outlined" 
                        />
                      </Box>
                      {product.stock_quantity <= 5 && product.stock_quantity > 0 && (
                        <Alert severity="warning" sx={{ mt: 1 }}>
                          Only {product.stock_quantity} left in stock!
                        </Alert>
                      )}
                      {product.stock_quantity === 0 && (
                        <Alert severity="error" sx={{ mt: 1 }}>
                          Out of stock
                        </Alert>
                      )}
                    </CardContent>
                    <CardActions>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleViewProduct(product.id)}
                      >
                        View Details
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<ShoppingCart />}
                        onClick={() => handleAddToCart(product)}
                        disabled={product.stock_quantity === 0}
                      >
                        Add to Cart
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>

        {/* Call to Action */}
        <Box
          sx={{
            textAlign: 'center',
            p: 4,
            backgroundColor: 'grey.50',
            borderRadius: 2,
          }}
        >
          <Typography variant="h5" gutterBottom>
            Ready to Start Shopping?
          </Typography>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            Browse our full catalog of products and find exactly what you need.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/products')}
            sx={{ mt: 2 }}
          >
            View All Products
          </Button>
        </Box>
      </Container>
    </>
  );
};

export default HomePage;