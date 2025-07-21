// src/pages/ProductsPage.tsx
// Products listing page with search and filters

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Chip,
  Pagination,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Search,
  Clear,
  ShoppingCart,
  FilterList,
} from '@mui/icons-material';
import { Helmet } from 'react-helmet-async';
import { useQuery } from 'react-query';

import { apiService, Product, ProductsResponse } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { useCart } from '../contexts/CartContext';
import { formatCurrency } from '../utils/format';

const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToCart } = useCart();
  
  // URL parameters
  const initialSearch = searchParams.get('search') || '';
  const initialCategory = searchParams.get('category') || '';
  const initialPage = parseInt(searchParams.get('page') || '1');
  
  // Local state
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState('name');
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(12);
  
  // Fetch products
  const {
    data: productsData,
    isLoading,
    error,
    refetch,
  } = useQuery<ProductsResponse>(
    ['products', searchTerm, category, sortBy, page, pageSize],
    () => apiService.getProducts({
      search: searchTerm || undefined,
      category: category || undefined,
      sort_by: sortBy,
      page,
      pageSize,
    }),
    {
      keepPreviousData: true,
      staleTime: 2 * 60 * 1000, // 2 minutes
    }
  );
  
  // Categories for filter dropdown
  const categories = [
    'Electronics',
    'Clothing',
    'Books',
    'Home & Garden',
    'Sports & Outdoors',
    'Beauty & Personal Care',
  ];
  
  // Sort options
  const sortOptions = [
    { value: 'name', label: 'Name (A-Z)' },
    { value: 'name_desc', label: 'Name (Z-A)' },
    { value: 'price', label: 'Price (Low to High)' },
    { value: 'price_desc', label: 'Price (High to Low)' },
    { value: 'created_at', label: 'Newest First' },
  ];
  
  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (category) params.set('category', category);
    if (page > 1) params.set('page', page.toString());
    
    setSearchParams(params);
  }, [searchTerm, category, page, setSearchParams]);
  
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };
  
  const handleClearFilters = () => {
    setSearchTerm('');
    setCategory('');
    setSortBy('name');
    setPage(1);
  };
  
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
  
  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const hasFilters = searchTerm || category;
  const totalPages = Math.ceil((productsData?.total || 0) / pageSize);
  
  if (isLoading && !productsData) {
    return <LoadingSpinner message="Loading products..." />;
  }
  
  if (error) {
    return (
      <Container>
        <ErrorMessage
          message="Failed to load products. Please try again."
          onRetry={() => refetch()}
        />
      </Container>
    );
  }
  
  return (
    <>
      <Helmet>
        <title>
          {searchTerm 
            ? `Search results for "${searchTerm}" - E-Commerce Platform`
            : category
            ? `${category} - E-Commerce Platform`
            : 'Products - E-Commerce Platform'
          }
        </title>
        <meta 
          name="description" 
          content={`Browse our ${category ? category.toLowerCase() + ' ' : ''}products. Find great deals and fast shipping.`}
        />
      </Helmet>
      
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ py: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            {searchTerm 
              ? `Search Results for "${searchTerm}"`
              : category
              ? category
              : 'All Products'
            }
          </Typography>
          
          {productsData && (
            <Typography variant="body1" color="text.secondary">
              Showing {productsData.data.length} of {productsData.total} products
              {hasFilters && (
                <Button
                  variant="text"
                  startIcon={<Clear />}
                  onClick={handleClearFilters}
                  sx={{ ml: 2 }}
                >
                  Clear Filters
                </Button>
              )}
            </Typography>
          )}
        </Box>
        
        {/* Search and Filters */}
        <Box sx={{ mb: 4 }}>
          <Grid container spacing={3} alignItems="center">
            {/* Search */}
            <Grid item xs={12} md={4}>
              <form onSubmit={handleSearchSubmit}>
                <TextField
                  fullWidth
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search color="action" />
                      </InputAdornment>
                    ),
                    endAdornment: searchTerm && (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setSearchTerm('')}
                          size="small"
                        >
                          <Clear />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </form>
            </Grid>
            
            {/* Category Filter */}
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={category}
                  label="Category"
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPage(1);
                  }}
                >
                  <MenuItem value="">
                    <em>All Categories</em>
                  </MenuItem>
                  {categories.map((cat) => (
                    <MenuItem key={cat} value={cat.toLowerCase()}>
                      {cat}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {/* Sort */}
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth>
                <InputLabel>Sort by</InputLabel>
                <Select
                  value={sortBy}
                  label="Sort by"
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  {sortOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {/* Filter indicator */}
            <Grid item xs={12} md={2}>
              {hasFilters && (
                <Box display="flex" alignItems="center" gap={1}>
                  <FilterList color="primary" />
                  <Typography variant="body2" color="primary">
                    Filters Applied
                  </Typography>
                </Box>
              )}
            </Grid>
          </Grid>
        </Box>
        
        {/* Products Grid */}
        {isLoading ? (
          <LoadingSpinner message="Loading products..." />
        ) : productsData?.data.length === 0 ? (
          <Alert severity="info" sx={{ my: 4 }}>
            <Typography variant="h6" gutterBottom>
              No products found
            </Typography>
            <Typography variant="body2">
              {hasFilters 
                ? 'Try adjusting your search criteria or clearing filters.'
                : 'No products are currently available.'
              }
            </Typography>
          </Alert>
        ) : (
          <>
            <Grid container spacing={3}>
              {productsData?.data.map((product) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={product.id}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: 4,
                      },
                    }}
                  >
                    <CardMedia
                      component="img"
                      height="200"
                      image={product.image_url || '/images/placeholder-product.jpg'}
                      alt={product.name}
                      sx={{ 
                        objectFit: 'cover', 
                        cursor: 'pointer',
                        backgroundColor: 'grey.100',
                      }}
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
                          '&:hover': { color: 'primary.main' },
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
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
                          minHeight: '2.5em',
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
                          Only {product.stock_quantity} left!
                        </Alert>
                      )}
                      
                      {product.stock_quantity === 0 && (
                        <Alert severity="error" sx={{ mt: 1 }}>
                          Out of stock
                        </Alert>
                      )}
                    </CardContent>
                    
                    <CardActions sx={{ p: 2 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleViewProduct(product.id)}
                        sx={{ mr: 1 }}
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
            
            {/* Pagination */}
            {totalPages > 1 && (
              <Box display="flex" justifyContent="center" mt={4}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={handlePageChange}
                  color="primary"
                  size="large"
                  showFirstButton
                  showLastButton
                />
              </Box>
            )}
          </>
        )}
      </Container>
    </>
  );
};

export default ProductsPage;