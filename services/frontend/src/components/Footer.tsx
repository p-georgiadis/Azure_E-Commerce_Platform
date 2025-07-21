// src/components/Footer.tsx
// Footer component with links and company information

import React from 'react';
import {
  Box,
  Container,
  Grid,
  Typography,
  Link,
  Divider,
  IconButton,
} from '@mui/material';
import {
  Facebook,
  Twitter,
  Instagram,
  LinkedIn,
  Email,
  Phone,
  LocationOn,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  
  const quickLinks = [
    { label: 'Home', path: '/' },
    { label: 'Products', path: '/products' },
    { label: 'About Us', path: '/about' },
    { label: 'Contact', path: '/contact' },
  ];
  
  const customerService = [
    { label: 'Help Center', path: '/help' },
    { label: 'Shipping Info', path: '/shipping' },
    { label: 'Returns', path: '/returns' },
    { label: 'Size Guide', path: '/size-guide' },
  ];
  
  const policies = [
    { label: 'Privacy Policy', path: '/privacy' },
    { label: 'Terms of Service', path: '/terms' },
    { label: 'Cookie Policy', path: '/cookies' },
    { label: 'Refund Policy', path: '/refunds' },
  ];
  
  const socialLinks = [
    { icon: <Facebook />, url: 'https://facebook.com', label: 'Facebook' },
    { icon: <Twitter />, url: 'https://twitter.com', label: 'Twitter' },
    { icon: <Instagram />, url: 'https://instagram.com', label: 'Instagram' },
    { icon: <LinkedIn />, url: 'https://linkedin.com', label: 'LinkedIn' },
  ];
  
  return (
    <Box
      component="footer"
      sx={{
        backgroundColor: 'grey.900',
        color: 'white',
        mt: 'auto',
        py: 6,
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={4}>
          {/* Company Info */}
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="h6" gutterBottom>
              E-Commerce Platform
            </Typography>
            <Typography variant="body2" sx={{ mb: 2, color: 'grey.300' }}>
              Your trusted partner for online shopping. 
              Quality products, fast delivery, and excellent customer service.
            </Typography>
            
            {/* Contact Info */}
            <Box sx={{ mb: 2 }}>
              <Box display="flex" alignItems="center" mb={1}>
                <LocationOn sx={{ fontSize: 16, mr: 1, color: 'grey.400' }} />
                <Typography variant="body2" color="grey.300">
                  123 Commerce St, Tech City, TC 12345
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" mb={1}>
                <Phone sx={{ fontSize: 16, mr: 1, color: 'grey.400' }} />
                <Typography variant="body2" color="grey.300">
                  +1 (555) 123-4567
                </Typography>
              </Box>
              <Box display="flex" alignItems="center">
                <Email sx={{ fontSize: 16, mr: 1, color: 'grey.400' }} />
                <Typography variant="body2" color="grey.300">
                  support@ecommerce-platform.com
                </Typography>
              </Box>
            </Box>
          </Grid>
          
          {/* Quick Links */}
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="h6" gutterBottom>
              Quick Links
            </Typography>
            <Box>
              {quickLinks.map((link) => (
                <Link
                  key={link.path}
                  component={RouterLink}
                  to={link.path}
                  sx={{
                    display: 'block',
                    color: 'grey.300',
                    textDecoration: 'none',
                    mb: 1,
                    '&:hover': {
                      color: 'primary.main',
                    },
                  }}
                >
                  <Typography variant="body2">
                    {link.label}
                  </Typography>
                </Link>
              ))}
            </Box>
          </Grid>
          
          {/* Customer Service */}
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="h6" gutterBottom>
              Customer Service
            </Typography>
            <Box>
              {customerService.map((link) => (
                <Link
                  key={link.path}
                  component={RouterLink}
                  to={link.path}
                  sx={{
                    display: 'block',
                    color: 'grey.300',
                    textDecoration: 'none',
                    mb: 1,
                    '&:hover': {
                      color: 'primary.main',
                    },
                  }}
                >
                  <Typography variant="body2">
                    {link.label}
                  </Typography>
                </Link>
              ))}
            </Box>
          </Grid>
          
          {/* Legal */}
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="h6" gutterBottom>
              Legal
            </Typography>
            <Box>
              {policies.map((link) => (
                <Link
                  key={link.path}
                  component={RouterLink}
                  to={link.path}
                  sx={{
                    display: 'block',
                    color: 'grey.300',
                    textDecoration: 'none',
                    mb: 1,
                    '&:hover': {
                      color: 'primary.main',
                    },
                  }}
                >
                  <Typography variant="body2">
                    {link.label}
                  </Typography>
                </Link>
              ))}
            </Box>
          </Grid>
        </Grid>
        
        <Divider sx={{ my: 4, borderColor: 'grey.700' }} />
        
        {/* Bottom Bar */}
        <Box
          display="flex"
          flexDirection={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems="center"
          gap={2}
        >
          {/* Copyright */}
          <Typography variant="body2" color="grey.400">
            © {currentYear} E-Commerce Platform. All rights reserved.
          </Typography>
          
          {/* Social Links */}
          <Box display="flex" gap={1}>
            {socialLinks.map((social) => (
              <IconButton
                key={social.label}
                component="a"
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                sx={{
                  color: 'grey.400',
                  '&:hover': {
                    color: 'primary.main',
                  },
                }}
              >
                {social.icon}
              </IconButton>
            ))}
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default Footer;