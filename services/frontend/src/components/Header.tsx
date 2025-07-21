// src/components/Header.tsx
// Main navigation header component

import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Box,
  Container,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ShoppingCart,
  AccountCircle,
  Menu as MenuIcon,
  Store,
  Login,
  PersonAdd,
  Logout,
  ShoppingBag,
} from '@mui/icons-material';

import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const { user, logout } = useAuth();
  const { items, getTotalItems } = useCart();
  
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const totalItems = getTotalItems();

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    handleUserMenuClose();
    navigate('/');
  };

  const handleMobileMenuToggle = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const navigationItems = [
    { label: 'Home', path: '/', icon: <Store /> },
    { label: 'Products', path: '/products', icon: <ShoppingBag /> },
  ];

  const userMenuItems = user
    ? [
        { label: 'My Orders', path: '/orders', icon: <ShoppingBag /> },
        { label: 'Logout', action: handleLogout, icon: <Logout /> },
      ]
    : [
        { label: 'Login', path: '/login', icon: <Login /> },
        { label: 'Register', path: '/register', icon: <PersonAdd /> },
      ];

  const renderMobileMenu = (
    <Drawer
      anchor="left"
      open={mobileMenuOpen}
      onClose={handleMobileMenuToggle}
      sx={{
        '& .MuiDrawer-paper': {
          width: 240,
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" component="div">
          E-Commerce Platform
        </Typography>
      </Box>
      <List>
        {navigationItems.map((item) => (
          <ListItem
            key={item.label}
            component={RouterLink}
            to={item.path}
            onClick={handleMobileMenuToggle}
            sx={{ color: 'inherit', textDecoration: 'none' }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItem>
        ))}
        
        {/* Cart */}
        <ListItem
          component={RouterLink}
          to="/cart"
          onClick={handleMobileMenuToggle}
          sx={{ color: 'inherit', textDecoration: 'none' }}
        >
          <ListItemIcon>
            <Badge badgeContent={totalItems} color="secondary">
              <ShoppingCart />
            </Badge>
          </ListItemIcon>
          <ListItemText primary={`Cart (${totalItems})`} />
        </ListItem>

        {/* User menu items */}
        {userMenuItems.map((item) => (
          <ListItem
            key={item.label}
            component={item.path ? RouterLink : 'div'}
            to={item.path}
            onClick={() => {
              handleMobileMenuToggle();
              if (item.action) {
                item.action();
              }
            }}
            sx={{ 
              color: 'inherit', 
              textDecoration: 'none',
              cursor: 'pointer'
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItem>
        ))}
      </List>
    </Drawer>
  );

  return (
    <>
      <AppBar position="sticky" color="primary">
        <Container maxWidth="lg">
          <Toolbar>
            {/* Mobile menu button */}
            {isMobile && (
              <IconButton
                edge="start"
                color="inherit"
                aria-label="menu"
                onClick={handleMobileMenuToggle}
                sx={{ mr: 2 }}
              >
                <MenuIcon />
              </IconButton>
            )}

            {/* Logo/Title */}
            <Typography
              variant="h6"
              component="div"
              sx={{ 
                flexGrow: isMobile ? 1 : 0, 
                mr: isMobile ? 0 : 4,
                cursor: 'pointer'
              }}
              onClick={() => navigate('/')}
            >
              E-Commerce Platform
            </Typography>

            {/* Desktop Navigation */}
            {!isMobile && (
              <>
                <Box sx={{ flexGrow: 1, display: 'flex', gap: 2 }}>
                  {navigationItems.map((item) => (
                    <Button
                      key={item.label}
                      color="inherit"
                      component={RouterLink}
                      to={item.path}
                      startIcon={item.icon}
                    >
                      {item.label}
                    </Button>
                  ))}
                </Box>

                {/* Cart Button */}
                <IconButton
                  color="inherit"
                  onClick={() => navigate('/cart')}
                  sx={{ mr: 1 }}
                  aria-label={`Shopping cart with ${totalItems} items`}
                >
                  <Badge badgeContent={totalItems} color="secondary">
                    <ShoppingCart />
                  </Badge>
                </IconButton>

                {/* User Menu */}
                {user ? (
                  <>
                    <Button
                      color="inherit"
                      startIcon={<AccountCircle />}
                      onClick={handleUserMenuOpen}
                    >
                      {user.name || user.email}
                    </Button>
                    <Menu
                      anchorEl={anchorEl}
                      open={Boolean(anchorEl)}
                      onClose={handleUserMenuClose}
                      anchorOrigin={{
                        vertical: 'bottom',
                        horizontal: 'right',
                      }}
                      transformOrigin={{
                        vertical: 'top',
                        horizontal: 'right',
                      }}
                    >
                      <MenuItem
                        onClick={() => {
                          navigate('/orders');
                          handleUserMenuClose();
                        }}
                      >
                        <ListItemIcon>
                          <ShoppingBag fontSize="small" />
                        </ListItemIcon>
                        My Orders
                      </MenuItem>
                      <MenuItem onClick={handleLogout}>
                        <ListItemIcon>
                          <Logout fontSize="small" />
                        </ListItemIcon>
                        Logout
                      </MenuItem>
                    </Menu>
                  </>
                ) : (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      color="inherit"
                      startIcon={<Login />}
                      onClick={() => navigate('/login')}
                    >
                      Login
                    </Button>
                    <Button
                      color="inherit"
                      variant="outlined"
                      startIcon={<PersonAdd />}
                      onClick={() => navigate('/register')}
                    >
                      Register
                    </Button>
                  </Box>
                )}
              </>
            )}
          </Toolbar>
        </Container>
      </AppBar>
      
      {/* Mobile Menu Drawer */}
      {renderMobileMenu}
    </>
  );
};

export default Header;