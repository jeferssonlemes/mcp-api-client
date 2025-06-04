import express from 'express';
import { configureRoutes } from './config/routes.js';
import { getTokenInfo } from './middleware/auth.js';
import { mcpManager } from './mcpManager.js';

const app = express();

// Trust proxy for rate limiting (if behind reverse proxy)
app.set('trust proxy', 1);

// Configure all routes and middleware through centralized configuration
configureRoutes(app);

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

// Start the server
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 MCP API Client v2.3 running on http://localhost:${PORT}`);
  console.log(`📚 Documentation at http://localhost:${PORT}`);
  console.log(`💓 Health check at http://localhost:${PORT}/health`);
  console.log(`🔐 All API endpoints are protected with token authentication`);
  
  // Display rate limiting configuration
  const rateLimitMax = process.env.RATE_LIMIT_MAX || 100;
  const rateLimitWindow = Math.ceil((process.env.RATE_LIMIT_WINDOW_MS || 900000) / 60000);
  const slowDownAfter = process.env.SLOW_DOWN_DELAY_AFTER || 50;
  const strictRateMax = process.env.STRICT_RATE_LIMIT_MAX || 20;
  const strictRateWindow = Math.ceil((process.env.STRICT_RATE_LIMIT_WINDOW_MS || 300000) / 60000);
  
  console.log(`🛡️  Rate limiting: ${rateLimitMax} requests per ${rateLimitWindow} minutes`);
  console.log(`⚡ Slow down: After ${slowDownAfter} requests per minute`);
  console.log(`🚨 Strict limiting: ${strictRateMax} execution requests per ${strictRateWindow} minutes`);
  
  console.log('');
  console.log('Authentication method:');
  console.log('  • Token: Authorization: Bearer <your-token>');
  console.log('  • Token: X-Auth-Token: <your-token>');
  console.log('  • Token: ?token=<your-token>');
  
  // Display token configuration
  const tokenInfo = getTokenInfo();
  console.log(`  • Token: ${tokenInfo.configured ? 'configured' : 'using demo token (change in production!)'}`);
  console.log(`  • Token prefix: ${tokenInfo.tokenPrefix}`);
  
  console.log('');
  console.log('Environment configuration:');
  console.log(`  • NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  • AUTH_TOKEN: ${tokenInfo.configured ? 'configured' : 'using demo token (change in production!)'}`);
  console.log(`  • DEFAULT_TTL: ${process.env.DEFAULT_TTL_MINUTES || 15} minutes`);
  console.log(`  • MAX_REQUEST_SIZE: ${process.env.MAX_REQUEST_SIZE || '10mb'}`);
  console.log(`  • CORS_ENABLED: ${process.env.ENABLE_CORS || 'true'}`);
  console.log(`  • DETAILED_ERRORS: ${process.env.ENABLE_DETAILED_ERRORS || 'auto (dev mode)'}`);
  
  // Warning for production
  if (process.env.NODE_ENV === 'production') {
    console.log('');
    console.log('🔥 PRODUCTION MODE WARNINGS:');
    if (!process.env.AUTH_TOKEN || process.env.AUTH_TOKEN.includes('demo-token')) {
      console.log('  ⚠️  WARNING: Using demo AUTH_TOKEN! Change immediately!');
    }
    if (tokenInfo.length !== 32) {
      console.log('  ⚠️  WARNING: AUTH_TOKEN should be exactly 32 characters long!');
    }
  }
  
  // Helpful setup info
  if (!tokenInfo.configured || process.env.AUTH_TOKEN.includes('demo-token')) {
    console.log('');
    console.log('💡 Setup tip: Generate a secure token with:');
    console.log('   node -e "console.log(Array.from({length:32}, () => \'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\'[Math.floor(Math.random()*62)]).join(\'\'))"');
  }
}); 