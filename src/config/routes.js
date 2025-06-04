import express from 'express';
import { router as apiRouter } from '../api.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware, slowDownMiddleware } from '../middleware/rateLimit.js';

// Environment variable configuration
const MAX_JSON_SIZE = process.env.MAX_JSON_SIZE || '10mb';
const ENABLE_CORS = process.env.ENABLE_CORS === 'true' || true; // Default true for development
const CORS_CREDENTIALS = process.env.CORS_CREDENTIALS === 'true' || true;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || '*';
const ENABLE_HSTS = process.env.ENABLE_HSTS === 'true';
const ENABLE_CSP = process.env.ENABLE_CSP === 'true';
const CSP_POLICY = process.env.CSP_POLICY || "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';";
const ENABLE_DETAILED_ERRORS = process.env.ENABLE_DETAILED_ERRORS === 'true' || process.env.NODE_ENV === 'development';

/**
 * Setup all routes for the application
 */
export function setupRoutes(app) {
  // Global middleware
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
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
      
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

  // Health route (public - no auth required)
  app.get('/health', (req, res) => {
    res.json({ 
      ok: true, 
      service: 'mcp-api-client',
      version: '2.3.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Root route with documentation (public)
  app.get('/', (req, res) => {
    res.json({
      service: 'MCP API Client',
      description: 'Service for managing multiple MCP servers with multi-session support',
      version: '2.3.0',
      endpoints: {
        'GET /health': 'Health check (public)',
        'POST /api/start': 'Start or check status of an MCP server (protected)',
        'GET /api/list?clientId=xxx': 'List all MCP servers for a client (protected)',
        'GET /api/details?clientId=xxx&MCPServerName=yyy': 'Get details of specific MCP server (protected)',
        'POST /api/run': 'Execute tool on specific MCP server (protected)',
        'GET /api/health?clientId=xxx&MCPServerName=yyy': 'Check health of specific MCP server (protected)',
        'GET /api/status': 'List all active processes (protected)',
        'DELETE /api/kill?clientId=xxx&MCPServerName=yyy': 'Terminate specific process (protected)'
      },
      authentication: {
        method: 'Static Token',
        headers: [
          'Authorization: Bearer <your-token>',
          'X-Auth-Token: <your-token>'
        ],
        query: '?token=<your-token>',
        note: 'All API endpoints require authentication except /health and /'
      },
      rateLimits: {
        standard: `${process.env.RATE_LIMIT_MAX || 100} requests per ${Math.ceil((process.env.RATE_LIMIT_WINDOW_MS || 900000) / 60000)} minutes`,
        burst: `Slow down after ${process.env.SLOW_DOWN_DELAY_AFTER || 50} requests per minute`,
        strict: `${process.env.STRICT_RATE_LIMIT_MAX || 20} requests per ${Math.ceil((process.env.STRICT_RATE_LIMIT_WINDOW_MS || 300000) / 60000)} minutes for execution endpoints`
      },
      configuration: {
        maxRequestSize: MAX_JSON_SIZE,
        corsEnabled: ENABLE_CORS,
        environment: process.env.NODE_ENV || 'development',
        defaultTTL: `${process.env.DEFAULT_TTL_MINUTES || 15} minutes`
      },
      features: [
        'Support for multiple MCP servers per client',
        'Unique identifier: clientId + MCPServerName',
        'Server listing by client',
        'MCPServerName field required for identification',
        'Automatic MCP protocol initialization',
        'Comprehensive health monitoring',
        'Cross-platform support (Windows/Unix)',
        'Simple token authentication',
        'Configurable rate limiting and DDoS protection',
        'Environment-based configuration'
      ]
    });
  });

  // Protected API routes with authentication and rate limiting
  app.use('/api', 
    rateLimitMiddleware,    // Apply rate limiting first
    slowDownMiddleware,    // Apply slow down after rate limit
    authMiddleware,        // Then authenticate
    apiRouter              // Finally handle API routes
  );

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Endpoint not found',
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
      available_endpoints: {
        documentation: '/docs',
        api_info: '/',
        health_check: '/health',
        api_routes: '/api/*'
      }
    });
  });

  // Global error handler
  app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    
    if (res.headersSent) {
      return next(error);
    }

    const status = error.status || error.statusCode || 500;
    const message = error.message || 'Internal server error';

    const errorResponse = {
      error: message,
      timestamp: new Date().toISOString()
    };

    // Include stack trace only in development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = error.stack;
    }

    res.status(status).json(errorResponse);
  });
} 