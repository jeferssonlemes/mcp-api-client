import express from 'express';
import { mcpManager } from './mcpManager.js';
import { strictRateLimitMiddleware } from './middleware/rateLimit.js';

export const router = express.Router();

// Environment variable configuration
const DEFAULT_TTL_MINUTES = parseInt(process.env.DEFAULT_TTL_MINUTES) || 15;
const API_RESPONSE_TIMEOUT_MS = parseInt(process.env.API_RESPONSE_TIMEOUT_MS) || 3000; // 3 seconds default
const API_RUN_TIMEOUT_MS = parseInt(process.env.API_RUN_TIMEOUT_MS) || 5000; // 5 seconds default

/**
 * POST /api/start
 * Starts or checks status of an MCP server
 * Body: { 
 *   clientId: string, 
 *   MCPServerName: string,
 *   config: { command: string, args: string[], env?: object }, 
 *   ttlMinutes?: number 
 * }
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
 * GET /api/list?clientId=xxx
 * Lists all MCP servers for a client
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
 * GET /api/details?clientId=xxx&MCPServerName=yyy
 * Returns details of specific MCP server
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
 * POST /api/run
 * Executes a tool/command on specific MCP server
 * Body: { 
 *   clientId: string,
 *   MCPServerName: string,
 *   tool: string,
 *   arguments?: object,
 *   input?: string
 * }
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
 * GET /api/health?clientId=xxx&MCPServerName=yyy
 * Checks health of a specific MCP server
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
 * GET /api/status
 * Lists all active MCP processes (for debugging/monitoring)
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
 * DELETE /api/kill?clientId=xxx&MCPServerName=yyy
 * Forces termination of a specific process
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