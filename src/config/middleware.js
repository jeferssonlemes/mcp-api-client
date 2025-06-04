import { authMiddleware, requireRole } from '../middleware/auth.js';
import { 
  rateLimitMiddleware, 
  slowDownMiddleware, 
  strictRateLimitMiddleware,
  authRateLimitMiddleware,
  requestSizeLimit,
  createIPWhitelist
} from '../middleware/rateLimit.js';

/**
 * Middleware configuration and combinations
 */

// Standard middleware stack for most API endpoints
export const standardMiddleware = [
  rateLimitMiddleware,
  slowDownMiddleware,
  authMiddleware
];

// Strict middleware stack for sensitive operations
export const strictMiddleware = [
  rateLimitMiddleware,
  slowDownMiddleware,
  strictRateLimitMiddleware,
  authMiddleware
];

// Admin-only middleware stack
export const adminMiddleware = [
  rateLimitMiddleware,
  slowDownMiddleware,
  authMiddleware,
  requireRole(['admin'])
];

// Authentication endpoints middleware
export const authEndpointMiddleware = [
  authRateLimitMiddleware,
  requestSizeLimit
];

// Public endpoints middleware (no auth required)
export const publicMiddleware = [
  rateLimitMiddleware
];

/**
 * Middleware configurations based on environment
 */
export function getMiddlewareConfig() {
  const config = {
    development: {
      enableCORS: true,
      enableDetailedErrors: true,
      enableDevAuth: true,
      trustProxy: false
    },
    production: {
      enableCORS: false, // Configure specific origins
      enableDetailedErrors: false,
      enableDevAuth: false,
      trustProxy: true
    },
    test: {
      enableCORS: true,
      enableDetailedErrors: true,
      enableDevAuth: true,
      trustProxy: false
    }
  };

  const env = process.env.NODE_ENV || 'development';
  return config[env] || config.development;
}

/**
 * Security middleware configuration
 */
export const securityConfig = {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin', 
      'X-Requested-With', 
      'Content-Type', 
      'Accept', 
      'Authorization', 
      'X-API-Key'
    ],
    credentials: true
  },
  headers: {
    contentType: 'nosniff',
    frameOptions: 'DENY',
    xssProtection: '1; mode=block',
    referrerPolicy: 'strict-origin-when-cross-origin',
    hsts: 'max-age=31536000; includeSubDomains',
    csp: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  slowDown: {
    windowMs: parseInt(process.env.SLOW_DOWN_WINDOW_MS) || 60 * 1000,
    delayAfter: parseInt(process.env.SLOW_DOWN_DELAY_AFTER) || 50,
    delayMs: parseInt(process.env.SLOW_DOWN_DELAY_MS) || 500,
    maxDelayMs: parseInt(process.env.SLOW_DOWN_MAX_DELAY_MS) || 10000
  }
};

/**
 * IP whitelist configuration
 */
export function createTrustedIPMiddleware() {
  const trustedIPs = process.env.TRUSTED_IPS ? process.env.TRUSTED_IPS.split(',') : [];
  return trustedIPs.length > 0 ? createIPWhitelist(trustedIPs) : null;
} 