// src/utils/format.ts
// Utility functions for formatting data

/**
 * Format a number as currency
 */
export const formatCurrency = (
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string => {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    // Fallback for unsupported currencies/locales
    return `$${amount.toFixed(2)}`;
  }
};

/**
 * Format a date string
 */
export const formatDate = (
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  },
  locale: string = 'en-US'
): string => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(locale, options).format(dateObj);
  } catch (error) {
    return 'Invalid Date';
  }
};

/**
 * Format a date as relative time (e.g., "2 days ago")
 */
export const formatRelativeTime = (
  date: string | Date,
  locale: string = 'en-US'
): string => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    
    // Define time units in milliseconds
    const units: Array<[string, number]> = [
      ['year', 365 * 24 * 60 * 60 * 1000],
      ['month', 30 * 24 * 60 * 60 * 1000],
      ['week', 7 * 24 * 60 * 60 * 1000],
      ['day', 24 * 60 * 60 * 1000],
      ['hour', 60 * 60 * 1000],
      ['minute', 60 * 1000],
      ['second', 1000],
    ];
    
    for (const [unit, ms] of units) {
      if (Math.abs(diffMs) >= ms || unit === 'second') {
        const value = Math.round(diffMs / ms);
        return rtf.format(-value, unit as Intl.RelativeTimeFormatUnit);
      }
    }
    
    return 'just now';
  } catch (error) {
    return formatDate(date);
  }
};

/**
 * Format a number with thousands separators
 */
export const formatNumber = (
  num: number,
  locale: string = 'en-US'
): string => {
  try {
    return new Intl.NumberFormat(locale).format(num);
  } catch (error) {
    return num.toString();
  }
};

/**
 * Format file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Truncate text to specified length
 */
export const truncateText = (
  text: string,
  maxLength: number,
  suffix: string = '...'
): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
};

/**
 * Format phone number
 */
export const formatPhoneNumber = (phone: string): string => {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Format based on length (assuming US format)
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  // Return original if doesn't match expected patterns
  return phone;
};