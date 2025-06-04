import { authMiddleware } from '../middleware/auth.js';
import { 
  rateLimitMiddleware, 
  slowDownMiddleware, 
  strictRateLimitMiddleware,
  authRateLimitMiddleware,
  requestSizeLimit,
  createIPWhitelist
} from '../middleware/rateLimit.js';
import express from 'express';

// Environment variable configuration
const MAX_JSON_SIZE = process.env.MAX_JSON_SIZE || '10mb';
const ENABLE_CORS = process.env.ENABLE_CORS === 'true' || true;
const CORS_CREDENTIALS = process.env.CORS_CREDENTIALS === 'true' || true;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || '*';
const ENABLE_HSTS = process.env.ENABLE_HSTS === 'true';
const ENABLE_CSP = process.env.ENABLE_CSP === 'true';
const CSP_POLICY = process.env.CSP_POLICY || "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';";

/**
 * Apply all middleware to the Express app
 */
export function applyMiddleware(app) {
  // Basic Express middleware
  app.use(express.json({ limit: MAX_JSON_SIZE }));
  app.use(express.urlencoded({ extended: true }));

  // CORS middleware (configurable)
  if (ENABLE_CORS) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      
      // Handle ALLOWED_ORIGINS array or wildcard
      if (Array.isArray(ALLOWED_ORIGINS)) {
        if (ALLOWED_ORIGINS.includes(origin)) {
          res.header('Access-Control-Allow-Origin', origin);
        }
      } else if (ALLOWED_ORIGINS === '*') {
        res.header('Access-Control-Allow-Origin', '*');
      }
      
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Auth-Token');
      
      if (CORS_CREDENTIALS) {
        res.header('Access-Control-Allow-Credentials', 'true');
      }
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  // Security headers (configurable)
  app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Conditional security headers for production
    if (ENABLE_HSTS && process.env.NODE_ENV === 'production') {
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    if (ENABLE_CSP) {
      res.header('Content-Security-Policy', CSP_POLICY);
    }
    
    next();
  });
}

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