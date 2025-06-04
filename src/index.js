import express from 'express';
import { router } from './api.js';
import { mcpManager } from './mcpManager.js';

const app = express();

// Middleware
app.use('/api', router);

// Health route
app.get('/health', (req, res) => {
  res.json({ 
    ok: true, 
    service: 'mcp-api-client',
    timestamp: new Date().toISOString()
  });
});

// Root route with basic documentation
app.get('/', (req, res) => {
  res.json({
    service: 'MCP API Client',
    description: 'Service for managing multiple MCP servers with multi-session support',
    version: '2.2.0',
    endpoints: {
      'POST /api/start': 'Start or check status of an MCP server',
      'GET /api/list?clientId=xxx': 'List all MCP servers for a client',
      'GET /api/details?clientId=xxx&MCPServerName=yyy': 'Get details of specific MCP server',
      'POST /api/run': 'Execute tool on specific MCP server',
      'GET /api/health?clientId=xxx&MCPServerName=yyy': 'Check health of specific MCP server',
      'GET /api/status': 'List all active processes',
      'DELETE /api/kill?clientId=xxx&MCPServerName=yyy': 'Terminate specific process'
    },
    features: [
      'Support for multiple MCP servers per client',
      'Unique identifier: clientId + MCPServerName',
      'Server listing by client',
      'MCPServerName field required for identification',
      'Automatic MCP protocol initialization',
      'Comprehensive health monitoring',
      'Cross-platform support (Windows/Unix)'
    ]
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

// Start the server
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 MCP API Client v2.2 running on http://localhost:${PORT}`);
  console.log(`📚 Documentation at http://localhost:${PORT}`);
  console.log(`💓 Health check at http://localhost:${PORT}/health`);
  console.log(`✨ MCPServerName field required for server identification!`);
}); 