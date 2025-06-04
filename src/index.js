import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import { applyMiddleware } from './config/middleware.js';
import { setupRoutes } from './config/routes.js';
import { getTokenInfo } from './middleware/auth.js';
import { mcpManager } from './mcpManager.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Apply all middleware (CORS, rate limiting, auth, etc.)
applyMiddleware(app);

// Swagger Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "MCP API Client v2.3 - Documentation",
  customfavIcon: "/favicon.ico",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    tryItOutEnabled: true
  }
}));

// Swagger JSON specification endpoint
app.get('/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Setup all routes
setupRoutes(app);

/**
 * @swagger
 * /:
 *   get:
 *     summary: API documentation and welcome page
 *     description: Returns API information and links to documentation
 *     tags: [General]
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                   example: "MCP API Client"
 *                 version:
 *                   type: string
 *                   example: "2.3.0"
 *                 description:
 *                   type: string
 *                   example: "A robust Node.js service for managing multiple MCP servers"
 *                 documentation:
 *                   type: string
 *                   example: "http://localhost:4000/docs"
 *                 swagger_json:
 *                   type: string
 *                   example: "http://localhost:4000/docs.json"
 *                 health:
 *                   type: string
 *                   example: "http://localhost:4000/health"
 *                 authentication:
 *                   type: object
 *                   properties:
 *                     required:
 *                       type: boolean
 *                       example: true
 *                     methods:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Authorization: Bearer <token>", "X-Auth-Token: <token>", "?token=<token>"]
 *                 rate_limiting:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                       example: true
 *                     standard_limit:
 *                       type: string
 *                       example: "100 requests per 15 minutes"
 *                     strict_limit:
 *                       type: string
 *                       example: "20 requests per 5 minutes for /api/run"
 */
// Root endpoint
app.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.json({
    service: 'MCP API Client',
    version: '2.3.0',
    description: 'A robust Node.js service for managing multiple MCP (Model Context Protocol) servers with multi-session support, simple token authentication, and comprehensive rate limiting.',
    documentation: `${baseUrl}/docs`,
    swagger_json: `${baseUrl}/docs.json`,
    health: `${baseUrl}/health`,
    authentication: {
      required: true,
      methods: [
        'Authorization: Bearer <token>',
        'X-Auth-Token: <token>',
        '?token=<token>'
      ]
    },
    rate_limiting: {
      enabled: true,
      standard_limit: '100 requests per 15 minutes',
      strict_limit: '20 requests per 5 minutes for /api/run'
    },
    endpoints: {
      start: 'POST /api/start - Start or check MCP server',
      list: 'GET /api/list?clientId=xxx - List client servers',
      details: 'GET /api/details?clientId=xxx&MCPServerName=yyy - Get server details',
      run: 'POST /api/run - Execute tool (strict rate limit)',
      health_check: 'GET /api/health?clientId=xxx&MCPServerName=yyy - Check server health',
      status: 'GET /api/status - List all processes',
      kill: 'DELETE /api/kill?clientId=xxx&MCPServerName=yyy - Terminate process'
    },
    quick_start: {
      step1: 'Generate token: node -e "console.log(Array.from({length:32}, () => \'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\'[Math.floor(Math.random()*62)]).join(\'\'))"',
      step2: 'Set AUTH_TOKEN in .env file',
      step3: 'Visit documentation at /docs',
      step4: 'Test authentication with any protected endpoint'
    }
  });
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Service health check
 *     description: Returns the health status of the API service itself (no authentication required)
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "healthy"
 *                 service:
 *                   type: string
 *                   example: "MCP API Client"
 *                 version:
 *                   type: string
 *                   example: "2.3.0"
 *                 timestamp:
 *                   type: string
 *                   format: 'date-time'
 *                 uptime:
 *                   type: number
 *                   description: "Service uptime in seconds"
 *                   example: 1234.567
 *                 environment:
 *                   type: string
 *                   example: "development"
 *                 node_version:
 *                   type: string
 *                   example: "v18.17.0"
 */
// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'MCP API Client',
    version: '2.3.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

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

// MCP Manager event listeners
mcpManager.on('timeout', (uniqueKey, clientId, MCPServerName) => {
  console.log(`[MCP] Server ${MCPServerName} for client ${clientId} terminated due to inactivity (${uniqueKey})`);
});

mcpManager.on('processExit', (uniqueKey, clientId, MCPServerName, code, signal) => {
  console.log(`[MCP] Process ${MCPServerName} for client ${clientId} terminated (code: ${code}, signal: ${signal}) - ${uniqueKey}`);
});

mcpManager.on('processError', (uniqueKey, clientId, MCPServerName, error) => {
  console.error(`[MCP] Error in server ${MCPServerName} for client ${clientId}:`, error.message, `- ${uniqueKey}`);
});

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  // Here you can add logic to terminate all MCP processes
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MCP API Client v2.3 running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/docs`);
  console.log(`🔍 Swagger JSON: http://localhost:${PORT}/docs.json`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
  console.log(`🔐 Authentication: Required for /api/* endpoints`);
  console.log(`🚦 Rate Limiting: Enabled with multiple tiers`);
  console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
}); 