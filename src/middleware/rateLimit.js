import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

// Environment variable configuration with fallbacks
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX) || 100;
const SLOW_DOWN_WINDOW_MS = parseInt(process.env.SLOW_DOWN_WINDOW_MS) || 60 * 1000; // 1 minute
const SLOW_DOWN_DELAY_AFTER = parseInt(process.env.SLOW_DOWN_DELAY_AFTER) || 50;
const SLOW_DOWN_DELAY_MS = parseInt(process.env.SLOW_DOWN_DELAY_MS) || 500;
const SLOW_DOWN_MAX_DELAY_MS = parseInt(process.env.SLOW_DOWN_MAX_DELAY_MS) || 10000;

// Auth rate limiting config
const AUTH_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 60 * 1000; // 1 minute
const AUTH_RATE_LIMIT_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10;

// Strict rate limiting config (for /api/run)
const STRICT_RATE_LIMIT_WINDOW_MS = parseInt(process.env.STRICT_RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000; // 5 minutes
const STRICT_RATE_LIMIT_MAX = parseInt(process.env.STRICT_RATE_LIMIT_MAX) || 20;

/**
 * Standard rate limiting middleware
 * Configurable via environment variables
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: {
    error: 'Too many requests from this IP',
    message: `Please try again after ${Math.ceil(RATE_LIMIT_WINDOW_MS / 60000)} minutes`,
    limit: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
    timestamp: new Date().toISOString()
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req) => {
    // Use IP + user ID if authenticated for more granular limiting
    const baseKey = req.ip || req.connection.remoteAddress;
    const userKey = req.user?.id || req.user?.sub;
    return userKey ? `${baseKey}:${userKey}` : baseKey;
  },
  handler: (req, res) => {
    console.warn(`[RateLimit] Rate limit exceeded for ${req.ip} on ${req.method} ${req.path}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      limit: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
      timestamp: new Date().toISOString()
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/';
  }
});

/**
 * Slow down middleware - starts slowing down requests after N requests
 * Configurable via environment variables
 */
export const slowDownMiddleware = slowDown({
  windowMs: SLOW_DOWN_WINDOW_MS,
  delayAfter: SLOW_DOWN_DELAY_AFTER,
  delayMs: SLOW_DOWN_DELAY_MS,
  maxDelayMs: SLOW_DOWN_MAX_DELAY_MS,
  keyGenerator: (req) => {
    const baseKey = req.ip || req.connection.remoteAddress;
    const userKey = req.user?.id || req.user?.sub;
    return userKey ? `${baseKey}:${userKey}` : baseKey;
  },
  skip: (req) => {
    // Skip slow down for health checks
    return req.path === '/health' || req.path === '/';
  },
  onLimitReached: (req, res, options) => {
    console.warn(`[SlowDown] Slow down activated for ${req.ip} on ${req.method} ${req.path}`);
  }
});

/**
 * Strict rate limiting for sensitive operations (like /api/run)
 * Configurable via environment variables
 */
export const strictRateLimitMiddleware = rateLimit({
  windowMs: STRICT_RATE_LIMIT_WINDOW_MS,
  max: STRICT_RATE_LIMIT_MAX,
  message: {
    error: 'Too many execution requests',
    message: `This endpoint has stricter limits. Please try again in ${Math.ceil(STRICT_RATE_LIMIT_WINDOW_MS / 60000)} minutes.`,
    limit: STRICT_RATE_LIMIT_MAX,
    windowMs: STRICT_RATE_LIMIT_WINDOW_MS,
    timestamp: new Date().toISOString()
  },
  keyGenerator: (req) => {
    const baseKey = req.ip || req.connection.remoteAddress;
    const userKey = req.user?.id || req.user?.sub;
    return userKey ? `${baseKey}:${userKey}:strict` : `${baseKey}:strict`;
  },
  handler: (req, res) => {
    console.warn(`[StrictRateLimit] Strict rate limit exceeded for ${req.ip} on ${req.method} ${req.path}`);
    res.status(429).json({
      error: 'Too many execution requests',
      message: 'You have exceeded the limit for execution endpoints. Please try again later.',
      limit: STRICT_RATE_LIMIT_MAX,
      windowMs: STRICT_RATE_LIMIT_WINDOW_MS,
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
      endpoint: req.path,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Burst protection for authentication endpoints
 * Configurable via environment variables
 */
export const authRateLimitMiddleware = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  message: {
    error: 'Too many authentication attempts',
    message: 'Please wait before trying to authenticate again.',
    limit: AUTH_RATE_LIMIT_MAX,
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    timestamp: new Date().toISOString()
  },
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
  handler: (req, res) => {
    console.warn(`[AuthRateLimit] Auth rate limit exceeded for ${req.ip} on ${req.method} ${req.path}`);
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Please wait before trying to authenticate again.',
      limit: AUTH_RATE_LIMIT_MAX,
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Create custom rate limiter with specific configuration
 */
export function createRateLimit(options = {}) {
  const defaultOptions = {
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    message: {
      error: 'Rate limit exceeded',
      timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false
  };

  return rateLimit({ ...defaultOptions, ...options });
}

/**
 * IP whitelist middleware (for trusted IPs)
 */
export function createIPWhitelist(trustedIPs = []) {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (trustedIPs.length > 0 && !trustedIPs.includes(clientIP)) {
      console.warn(`[IPWhitelist] Blocked request from ${clientIP}`);
      return res.status(403).json({
        error: 'Access denied',
        message: 'Your IP address is not whitelisted',
        ip: clientIP,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
}

/**
 * Request size limiting middleware
 * Configurable via environment variables
 */
export const requestSizeLimit = (req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  const maxSizeEnv = process.env.MAX_REQUEST_SIZE || '10mb';
  
  // Parse size string (e.g., "10mb" -> 10485760)
  let maxSize = 10 * 1024 * 1024; // Default 10MB
  const sizeMatch = maxSizeEnv.match(/^(\d+)(mb|kb|gb)?$/i);
  if (sizeMatch) {
    const value = parseInt(sizeMatch[1]);
    const unit = (sizeMatch[2] || 'mb').toLowerCase();
    switch (unit) {
      case 'kb': maxSize = value * 1024; break;
      case 'mb': maxSize = value * 1024 * 1024; break;
      case 'gb': maxSize = value * 1024 * 1024 * 1024; break;
      default: maxSize = value;
    }
  }

  if (contentLength > maxSize) {
    console.warn(`[RequestSize] Request too large: ${contentLength} bytes from ${req.ip}`);
    return res.status(413).json({
      error: 'Request entity too large',
      maxSize: maxSizeEnv,
      receivedSize: `${Math.round(contentLength / 1024 / 1024 * 100) / 100}MB`,
      timestamp: new Date().toISOString()
    });
  }

  next();
}; 