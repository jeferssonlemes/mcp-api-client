import express from 'express';
import { mcpManager } from './mcpManager.js';
import { strictRateLimitMiddleware } from './middleware/rateLimit.js';

export const router = express.Router();

// Environment variable configuration
const DEFAULT_TTL_MINUTES = parseInt(process.env.DEFAULT_TTL_MINUTES) || 15;
const API_RESPONSE_TIMEOUT_MS = parseInt(process.env.API_RESPONSE_TIMEOUT_MS) || 3000; // 3 seconds default
const API_RUN_TIMEOUT_MS = parseInt(process.env.API_RUN_TIMEOUT_MS) || 5000; // 5 seconds default

/**
 * @swagger
 * /api/start:
 *   post:
 *     summary: Start or check status of an MCP server
 *     description: Starts a new MCP server or returns existing server info if already running with same config
 *     tags: [MCP Management]
 *     security:
 *       - BearerAuth: []
 *       - TokenHeader: []
 *       - TokenQuery: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StartRequest'
 *           examples:
 *             github:
 *               summary: GitHub MCP Server
 *               value:
 *                 clientId: "client-github"
 *                 MCPServerName: "github"
 *                 ttlMinutes: 20
 *                 config:
 *                   command: "npx"
 *                   args: ["-y", "@smithery/cli@latest", "run", "@smithery-ai/github", "--key", "YOUR_API_KEY"]
 *             mysql:
 *               summary: MySQL MCP Server
 *               value:
 *                 clientId: "client-mysql"
 *                 MCPServerName: "mysql"
 *                 ttlMinutes: 15
 *                 config:
 *                   command: "npx"
 *                   args: ["-y", "@smithery/cli@latest", "run", "@michael7736/mysql-mcp-server"]
 *                   env:
 *                     MYSQL_HOST: "localhost"
 *                     MYSQL_PORT: "3306"
 *                     MYSQL_USER: "username"
 *                     MYSQL_PASS: "password"
 *                     MYSQL_DB: "database"
 *     responses:
 *       200:
 *         description: Server started successfully or already running
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     clientId:
 *                       type: string
 *                       example: "client-github"
 *                     MCPServerName:
 *                       type: string
 *                       example: "github"
 *                     uniqueKey:
 *                       type: string
 *                       example: "client-github:github"
 *                     status:
 *                       type: string
 *                       enum: [started, already-running]
 *                     pid:
 *                       type: integer
 *                       example: 12345
 *                     user:
 *                       type: string
 *                       example: "authenticated-user"
 *                     authMethod:
 *                       type: string
 *                       example: "static-token"
 *                     message:
 *                       type: string
 *                       example: "MCP Server 'github' started successfully"
 *       400:
 *         description: Bad request - missing required parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthErrorResponse'
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RateLimitResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/start', async (req, res) => {
  const { clientId, MCPServerName, config, ttlMinutes = DEFAULT_TTL_MINUTES } = req.body || {};

  // Parameter validation
  if (!clientId) {
    return res.status(400).json({ 
      error: 'clientId is required' 
    });
  }

  if (!MCPServerName) {
    return res.status(400).json({ 
      error: 'MCPServerName is required' 
    });
  }

  if (!config || !config.command || !Array.isArray(config.args)) {
    return res.status(400).json({ 
      error: 'config must contain {command: string, args: string[]}' 
    });
  }

  try {
    const ttlMs = ttlMinutes * 60_000;
    const { proc, wasAlreadyRunning, uniqueKey } = await mcpManager.ensureProcess(clientId, MCPServerName, config, ttlMs);

    const response = {
      ok: true,
      clientId,
      MCPServerName,
      uniqueKey,
      status: wasAlreadyRunning ? 'already-running' : 'started',
      pid: proc.pid,
      message: wasAlreadyRunning 
        ? `MCP Server '${MCPServerName}' is already running and operational for receiving calls`
        : `MCP Server '${MCPServerName}' started successfully. MCP initialization in progress...`,
      user: req.user?.id || req.user?.sub,
      authMethod: req.authMethod,
      configuration: {
        ttlMinutes,
        defaultTTL: DEFAULT_TTL_MINUTES
      }
    };

    console.log(`[API] ${req.authMethod} user ${req.user?.id || req.user?.sub} started MCP server ${uniqueKey}`);
    res.json(response);
  } catch (error) {
    console.error(`[API] Error starting MCP ${MCPServerName} for ${clientId}:`, error);
    res.status(500).json({ 
      error: 'Internal error starting MCP server',
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/list:
 *   get:
 *     summary: List all MCP servers for a client
 *     description: Returns a list of all active MCP servers for the specified client
 *     tags: [MCP Management]
 *     security:
 *       - BearerAuth: []
 *       - TokenHeader: []
 *       - TokenQuery: []
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client identifier
 *         example: "client-github"
 *     responses:
 *       200:
 *         description: List of MCP servers
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     clientId:
 *                       type: string
 *                       example: "client-github"
 *                     totalServers:
 *                       type: integer
 *                       example: 2
 *                     servers:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/MCPServer'
 *       400:
 *         description: Bad request - clientId is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthErrorResponse'
 */
router.get('/list', (req, res) => {
  const { clientId } = req.query;

  if (!clientId) {
    return res.status(400).json({ 
      error: 'clientId is required' 
    });
  }

  try {
    const servers = mcpManager.listClientServers(clientId);
    
    res.json({
      ok: true,
      clientId,
      totalServers: servers.length,
      servers: servers.map(server => ({
        MCPServerName: server.MCPServerName,
        uniqueKey: server.uniqueKey,
        pid: server.pid,
        lastHit: new Date(server.lastHit).toISOString(),
        ttlMinutes: Math.round(server.ttlMs / 60_000),
        command: `${server.config.command} ${server.config.args.join(' ')}`
      }))
    });
  } catch (error) {
    console.error(`[API] Error listing servers for ${clientId}:`, error);
    res.status(500).json({ 
      error: 'Internal error listing MCP servers',
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/details:
 *   get:
 *     summary: Get details of specific MCP server
 *     description: Returns detailed information about a specific MCP server including available tools
 *     tags: [MCP Information]
 *     security:
 *       - BearerAuth: []
 *       - TokenHeader: []
 *       - TokenQuery: []
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client identifier
 *         example: "client-github"
 *       - in: query
 *         name: MCPServerName
 *         required: true
 *         schema:
 *           type: string
 *         description: MCP server name
 *         example: "github"
 *     responses:
 *       200:
 *         description: MCP server details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     clientId:
 *                       type: string
 *                       example: "client-github"
 *                     MCPServerName:
 *                       type: string
 *                       example: "github"
 *                     uniqueKey:
 *                       type: string
 *                       example: "client-github:github"
 *                     details:
 *                       type: object
 *                       properties:
 *                         rawOutput:
 *                           type: string
 *                           description: Raw output from MCP server
 *                         errorOutput:
 *                           type: string
 *                           description: Error output if any
 *                         parsedResponse:
 *                           type: object
 *                           description: Parsed JSON response
 *       400:
 *         description: Bad request - missing parameters or server not initialized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: MCP server not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       410:
 *         description: Process was terminated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/details', async (req, res) => {
  const { clientId, MCPServerName } = req.query;

  if (!clientId) {
    return res.status(400).json({ 
      error: 'clientId is required' 
    });
  }

  if (!MCPServerName) {
    return res.status(400).json({ 
      error: 'MCPServerName is required' 
    });
  }

  const proc = mcpManager.getProcess(clientId, MCPServerName);
  
  if (!proc) {
    return res.status(404).json({ 
      error: `MCP Server '${MCPServerName}' not found for client '${clientId}'. Start first with /start`,
      clientId,
      MCPServerName
    });
  }

  // Check if process is still alive
  if (proc.killed) {
    return res.status(410).json({
      error: `MCP Server '${MCPServerName}' was terminated. Execute /start again`,
      clientId,
      MCPServerName,
      suggestion: "The process was terminated. Start again with /start"
    });
  }

  // Check if server is initialized
  if (!mcpManager.isInitialized(clientId, MCPServerName)) {
    return res.status(400).json({
      error: `MCP Server '${MCPServerName}' not yet initialized. Wait a few seconds after /start`,
      clientId,
      MCPServerName,
      suggestion: "Try again in a few seconds or check logs"
    });
  }

  try {
    // Request tool list
    const detailsCommand = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    }) + '\n';

    let output = '';
    let errorOutput = '';

    const stdoutListener = (data) => {
      output += data.toString();
    };

    const stderrListener = (data) => {
      errorOutput += data.toString();
    };

    proc.stdout.on('data', stdoutListener);
    proc.stderr.on('data', stderrListener);

    proc.stdin.write(detailsCommand);

    setTimeout(() => {
      proc.stdout.off('data', stdoutListener);
      proc.stderr.off('data', stderrListener);

      let parsedOutput = null;
      try {
        const lines = output.trim().split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            const parsed = JSON.parse(line.trim());
            if (parsed.id === 2) { // Response from tools/list
              parsedOutput = parsed;
              break;
            }
          }
        }
      } catch (e) {
        // Ignore parse error
      }

      res.json({
        ok: true,
        clientId,
        MCPServerName,
        uniqueKey: `${clientId}:${MCPServerName}`,
        details: {
          rawOutput: output.trim(),
          errorOutput: errorOutput.trim(),
          parsedResponse: parsedOutput
        }
      });
    }, API_RESPONSE_TIMEOUT_MS);

  } catch (error) {
    console.error(`[API] Error getting details for ${clientId}:${MCPServerName}:`, error);
    res.status(500).json({ 
      error: 'Internal error querying MCP server',
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/run:
 *   post:
 *     summary: Execute a tool on MCP server
 *     description: Executes a specific tool or sends raw input to an MCP server. This endpoint has strict rate limiting (20 requests per 5 minutes).
 *     tags: [MCP Execution]
 *     security:
 *       - BearerAuth: []
 *       - TokenHeader: []
 *       - TokenQuery: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RunRequest'
 *           examples:
 *             search_repositories:
 *               summary: Search GitHub repositories
 *               value:
 *                 clientId: "client-github"
 *                 MCPServerName: "github"
 *                 tool: "search_repositories"
 *                 arguments:
 *                   query: "typescript stars:>1000"
 *             sql_query:
 *               summary: Execute SQL query
 *               value:
 *                 clientId: "client-mysql"
 *                 MCPServerName: "mysql"
 *                 tool: "run_sql_query"
 *                 arguments:
 *                   query: "SELECT NOW() as current_time, 1 as test_value"
 *             raw_input:
 *               summary: Send raw JSON-RPC input
 *               value:
 *                 clientId: "client-github"
 *                 MCPServerName: "github"
 *                 input: "{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}"
 *     responses:
 *       200:
 *         description: Tool executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     clientId:
 *                       type: string
 *                       example: "client-github"
 *                     MCPServerName:
 *                       type: string
 *                       example: "github"
 *                     uniqueKey:
 *                       type: string
 *                       example: "client-github:github"
 *                     tool:
 *                       type: string
 *                       example: "search_repositories"
 *                     user:
 *                       type: string
 *                       example: "authenticated-user"
 *                     authMethod:
 *                       type: string
 *                       example: "static-token"
 *                     result:
 *                       type: object
 *                       properties:
 *                         rawOutput:
 *                           type: string
 *                           description: Raw output from MCP server
 *                         errorOutput:
 *                           type: string
 *                           description: Error output if any
 *                         parsedResponse:
 *                           type: object
 *                           description: Parsed JSON response
 *       400:
 *         description: Bad request - missing parameters or server not ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: MCP server not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       410:
 *         description: Process was terminated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Rate limit exceeded (strict limit for execution endpoints)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RateLimitResponse'
 *       500:
 *         description: Internal server error or process terminated during execution
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/run', strictRateLimitMiddleware, async (req, res) => {
  const { clientId, MCPServerName, tool, arguments: toolArgs, input } = req.body || {};

  if (!clientId) {
    return res.status(400).json({ 
      error: 'clientId is required' 
    });
  }

  if (!MCPServerName) {
    return res.status(400).json({ 
      error: 'MCPServerName is required' 
    });
  }

  const proc = mcpManager.getProcess(clientId, MCPServerName);
  
  if (!proc) {
    return res.status(404).json({ 
      error: `MCP Server '${MCPServerName}' not found for client '${clientId}'. Start first with /start`,
      clientId,
      MCPServerName
    });
  }

  // Check if process is still alive
  if (proc.killed) {
    return res.status(410).json({
      error: `MCP Server '${MCPServerName}' was terminated. Execute /start again`,
      clientId,
      MCPServerName,
      suggestion: "The process was terminated. Start again with /start"
    });
  }

  // Check if server is initialized
  if (!mcpManager.isInitialized(clientId, MCPServerName)) {
    return res.status(400).json({
      error: `MCP Server '${MCPServerName}' not yet initialized. Wait a few seconds after /start`,
      clientId,
      MCPServerName,
      suggestion: "Try again in a few seconds or check logs"
    });
  }

  try {
    let command;

    if (input) {
      command = input.endsWith('\n') ? input : input + '\n';
    } else if (tool) {
      command = JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: tool,
          arguments: toolArgs || {}
        }
      }) + '\n';
    } else {
      return res.status(400).json({ 
        error: 'Must provide "tool" or "input"' 
      });
    }

    let output = '';
    let errorOutput = '';

    const stdoutListener = (data) => {
      output += data.toString();
    };

    const stderrListener = (data) => {
      errorOutput += data.toString();
    };

    proc.stdout.on('data', stdoutListener);
    proc.stderr.on('data', stderrListener);

    // Protection against stdin write error
    try {
      proc.stdin.write(command);
    } catch (writeError) {
      proc.stdout.off('data', stdoutListener);
      proc.stderr.off('data', stderrListener);
      
      return res.status(500).json({
        error: `Error communicating with MCP Server '${MCPServerName}'. Process may have been terminated`,
        clientId,
        MCPServerName,
        details: writeError.message,
        suggestion: "Execute /start again"
      });
    }

    // Handler to detect if process dies during execution
    const processExitHandler = (code, signal) => {
      proc.stdout.off('data', stdoutListener);
      proc.stderr.off('data', stderrListener);
      
      if (!res.headersSent) {
        res.status(500).json({
          error: `MCP Server '${MCPServerName}' terminated during execution`,
          clientId,
          MCPServerName,
          processExitCode: code,
          processSignal: signal,
          suggestion: "Execute /start again"
        });
      }
    };

    proc.once('exit', processExitHandler);

    setTimeout(() => {
      proc.off('exit', processExitHandler);
      proc.stdout.off('data', stdoutListener);
      proc.stderr.off('data', stderrListener);

      let parsedOutput = null;
      try {
        const lines = output.trim().split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('{')) {
            parsedOutput = JSON.parse(trimmedLine);
            break;
          }
        }
      } catch (e) {
        // Ignore parse error
      }

      console.log(`[API] ${req.authMethod} user ${req.user?.id || req.user?.sub} executed tool '${tool || 'custom-input'}' on ${clientId}:${MCPServerName}`);

      res.json({
        ok: true,
        clientId,
        MCPServerName,
        uniqueKey: `${clientId}:${MCPServerName}`,
        tool: tool || 'custom-input',
        user: req.user?.id || req.user?.sub,
        authMethod: req.authMethod,
        result: {
          rawOutput: output.trim(),
          errorOutput: errorOutput.trim(),
          parsedResponse: parsedOutput
        }
      });
    }, API_RUN_TIMEOUT_MS);

  } catch (error) {
    console.error(`[API] Error executing tool for ${clientId}:${MCPServerName}:`, error);
    res.status(500).json({ 
      error: 'Internal error executing on MCP server',
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Check health of specific MCP server
 *     description: Performs a comprehensive health check of a specific MCP server
 *     tags: [MCP Health]
 *     security:
 *       - BearerAuth: []
 *       - TokenHeader: []
 *       - TokenQuery: []
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client identifier
 *         example: "client-github"
 *       - in: query
 *         name: MCPServerName
 *         required: true
 *         schema:
 *           type: string
 *         description: MCP server name
 *         example: "github"
 *     responses:
 *       200:
 *         description: MCP server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     clientId:
 *                       type: string
 *                       example: "client-github"
 *                     MCPServerName:
 *                       type: string
 *                       example: "github"
 *                     uniqueKey:
 *                       type: string
 *                       example: "client-github:github"
 *                     status:
 *                       type: string
 *                       example: "healthy"
 *                     message:
 *                       type: string
 *                       example: "MCP server is operational"
 *       503:
 *         description: MCP server is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: false
 *                 clientId:
 *                   type: string
 *                   example: "client-github"
 *                 MCPServerName:
 *                   type: string
 *                   example: "github"
 *                 uniqueKey:
 *                   type: string
 *                   example: "client-github:github"
 *                 status:
 *                   type: string
 *                   example: "unhealthy"
 *                 reason:
 *                   type: string
 *                   example: "Process not found"
 *                 suggestion:
 *                   type: string
 *                   example: "Execute /start first"
 */
router.get('/health', (req, res) => {
  const { clientId, MCPServerName } = req.query;

  if (!clientId) {
    return res.status(400).json({ 
      error: 'clientId is required' 
    });
  }

  if (!MCPServerName) {
    return res.status(400).json({ 
      error: 'MCPServerName is required' 
    });
  }

  const health = mcpManager.isHealthy(clientId, MCPServerName);
  
  if (health.healthy) {
    res.json({
      ok: true,
      clientId,
      MCPServerName,
      uniqueKey: `${clientId}:${MCPServerName}`,
      status: 'healthy',
      message: 'MCP server is operational'
    });
  } else {
    res.status(503).json({
      ok: false,
      clientId,
      MCPServerName,
      uniqueKey: `${clientId}:${MCPServerName}`,
      status: 'unhealthy',
      reason: health.reason,
      suggestion: health.reason.includes('not found') ? 'Execute /start first' : 'Execute /start again'
    });
  }
});

/**
 * @swagger
 * /api/status:
 *   get:
 *     summary: List all active MCP processes
 *     description: Returns a list of all currently active MCP processes across all clients (for monitoring)
 *     tags: [MCP Management]
 *     security:
 *       - BearerAuth: []
 *       - TokenHeader: []
 *       - TokenQuery: []
 *     responses:
 *       200:
 *         description: List of all active processes
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     activeProcesses:
 *                       type: integer
 *                       example: 3
 *                     processes:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/MCPServer'
 */
router.get('/status', (req, res) => {
  const processes = mcpManager.listActiveProcesses();
  
  res.json({
    ok: true,
    activeProcesses: processes.length,
    processes: processes.map(p => ({
      uniqueKey: p.uniqueKey,
      clientId: p.clientId,
      MCPServerName: p.MCPServerName,
      pid: p.pid,
      lastHit: new Date(p.lastHit).toISOString(),
      ttlMinutes: Math.round(p.ttlMs / 60_000),
      command: `${p.config.command} ${p.config.args.join(' ')}`
    }))
  });
});

/**
 * @swagger
 * /api/kill:
 *   delete:
 *     summary: Force termination of specific process
 *     description: Forces the termination of a specific MCP process (for debugging/cleanup)
 *     tags: [MCP Management]
 *     security:
 *       - BearerAuth: []
 *       - TokenHeader: []
 *       - TokenQuery: []
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client identifier
 *         example: "client-github"
 *       - in: query
 *         name: MCPServerName
 *         required: true
 *         schema:
 *           type: string
 *         description: MCP server name
 *         example: "github"
 *     responses:
 *       200:
 *         description: Process terminated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Process client-github:github terminated"
 *                     clientId:
 *                       type: string
 *                       example: "client-github"
 *                     MCPServerName:
 *                       type: string
 *                       example: "github"
 *       404:
 *         description: Process not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/kill', (req, res) => {
  const { clientId, MCPServerName } = req.query;

  if (!clientId) {
    return res.status(400).json({ 
      error: 'clientId is required' 
    });
  }

  if (!MCPServerName) {
    return res.status(400).json({ 
      error: 'MCPServerName is required' 
    });
  }

  const killed = mcpManager.killProcess(clientId, MCPServerName);
  
  if (killed) {
    res.json({ 
      ok: true, 
      message: `Process ${clientId}:${MCPServerName} terminated`,
      clientId,
      MCPServerName
    });
  } else {
    res.status(404).json({ 
      error: 'Process not found',
      clientId,
      MCPServerName
    });
  }
}); 