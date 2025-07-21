// src/contexts/CartContext.tsx
// Shopping cart context for managing cart state

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { appInsights } from '../services/appInsights';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

export interface CartContextType {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
  isInCart: (itemId: string) => boolean;
  getCartItem: (itemId: string) => CartItem | undefined;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

interface CartProviderProps {
  children: ReactNode;
}

const CART_STORAGE_KEY = 'ecommerce-cart';

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY);
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);
        setItems(Array.isArray(parsedCart) ? parsedCart : []);
      }
    } catch (error) {
      console.error('Failed to load cart from localStorage:', error);
      setItems([]);
    }
  }, []);

  // Save cart to localStorage whenever items change
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Failed to save cart to localStorage:', error);
    }
  }, [items]);

  const addToCart = (item: Omit<CartItem, 'quantity'> & { quantity?: number }): void => {
    const quantity = item.quantity || 1;
    
    setItems(prevItems => {
      const existingItem = prevItems.find(cartItem => cartItem.id === item.id);
      
      if (existingItem) {
        // Update quantity of existing item
        return prevItems.map(cartItem =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + quantity }
            : cartItem
        );
      } else {
        // Add new item
        return [...prevItems, { ...item, quantity }];
      }
    });

    // Track add to cart event
    appInsights.trackEvent({
      name: 'AddToCart',
      properties: {
        productId: item.id,
        productName: item.name,
        price: item.price,
        quantity: quantity,
      },
    });
  };

  const removeFromCart = (itemId: string): void => {
    setItems(prevItems => {
      const item = prevItems.find(cartItem => cartItem.id === itemId);
      
      if (item) {
        // Track remove from cart event
        appInsights.trackEvent({
          name: 'RemoveFromCart',
          properties: {
            productId: item.id,
            productName: item.name,
            quantity: item.quantity,
          },
        });
      }
      
      return prevItems.filter(cartItem => cartItem.id !== itemId);
    });
  };

  const updateQuantity = (itemId: string, quantity: number): void => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    setItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = (): void => {
    const totalItems = getTotalItems();
    const totalPrice = getTotalPrice();
    
    setItems([]);

    // Track clear cart event
    appInsights.trackEvent({
      name: 'ClearCart',
      properties: {
        totalItems,
        totalPrice,
      },
    });
  };

  const getTotalItems = (): number => {
    return items.reduce((total, item) => total + item.quantity, 0);
  };

  const getTotalPrice = (): number => {
    return items.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const isInCart = (itemId: string): boolean => {
    return items.some(item => item.id === itemId);
  };

  const getCartItem = (itemId: string): CartItem | undefined => {
    return items.find(item => item.id === itemId);
  };

  const value: CartContextType = {
    items,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotalItems,
    getTotalPrice,
    isInCart,
    getCartItem,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};