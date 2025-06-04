import { spawn } from 'node:child_process';
import EventEmitter from 'node:events';

// Environment variable configuration with fallbacks
const DEFAULT_TTL_MS = (parseInt(process.env.DEFAULT_TTL_MINUTES) || 15) * 60_000; // Convert minutes to milliseconds
const SWEEP_INTERVAL_MS = (parseInt(process.env.SWEEP_INTERVAL_MINUTES) || 1) * 60_000; // Convert minutes to milliseconds

class MCPManager extends EventEmitter {
  constructor() {
    super();
    // Structure: uniqueKey -> { proc, config, configHash, lastHit, ttlMs, clientId, MCPServerName, isInitialized }
    this.registry = new Map(); 
    
    // Start timeout sweep
    setInterval(() => this.sweepExpiredProcesses(), SWEEP_INTERVAL_MS);
    
    console.log(`[MCP] Manager initialized with TTL: ${DEFAULT_TTL_MS / 60000} minutes, Sweep interval: ${SWEEP_INTERVAL_MS / 60000} minutes`);
  }

  /**
   * Generates unique key for registry
   * @param {string} clientId 
   * @param {string} MCPServerName 
   * @returns {string}
   */
  _generateKey(clientId, MCPServerName) {
    return `${clientId}:${MCPServerName}`;
  }

  /**
   * Initializes an MCP server following the correct protocol
   * @param {ChildProcess} proc - MCP server process
   * @returns {Promise<boolean>} - True if successfully initialized
   */
  async _initializeMCPServer(proc) {
    return new Promise((resolve) => {
      let output = '';
      let initialized = false;

      const cleanup = () => {
        proc.stdout.off('data', dataListener);
        proc.stderr.off('data', errorListener);
      };

      const dataListener = (data) => {
        output += data.toString();
        
        // Look for initialize response
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            try {
              const response = JSON.parse(line.trim());
              if (response.id === 1 && response.result) {
                // Received initialize response, now send initialized
                const initializedMessage = JSON.stringify({
                  jsonrpc: "2.0",
                  method: "notifications/initialized"
                }) + '\n';
                
                proc.stdin.write(initializedMessage);
                initialized = true;
                cleanup();
                setTimeout(() => resolve(true), 100); // Small delay to ensure
                return;
              }
            } catch (e) {
              // Ignore parse error
            }
          }
        }
      };

      const errorListener = (data) => {
        console.error('[MCP] Error during initialization:', data.toString());
      };

      proc.stdout.on('data', dataListener);
      proc.stderr.on('data', errorListener);

      // Send initialize command
      const initializeMessage = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            roots: {
              listChanged: true
            },
            sampling: {}
          },
          clientInfo: {
            name: "mcp-api-client",
            version: "2.3.0"
          }
        }
      }) + '\n';

      proc.stdin.write(initializeMessage);

      // 10 second timeout for initialization
      setTimeout(() => {
        if (!initialized) {
          cleanup();
          resolve(false);
        }
      }, 10000);
    });
  }

  /**
   * Ensures an MCP process exists for clientId + MCPServerName
   * @param {string} clientId - Unique client ID
   * @param {string} MCPServerName - MCP server name/identifier
   * @param {Object} config - MCP configuration {command, args}
   * @param {number} ttlMs - TTL in milliseconds
   * @returns {Object} { proc, wasAlreadyRunning, uniqueKey }
   */
  async ensureProcess(clientId, MCPServerName, config, ttlMs = DEFAULT_TTL_MS) {
    const uniqueKey = this._generateKey(clientId, MCPServerName);
    const configHash = JSON.stringify(config);
    const existing = this.registry.get(uniqueKey);

    // If process already exists with same config and is alive and initialized
    if (existing && 
        existing.configHash === configHash && 
        !existing.proc.killed &&
        existing.isInitialized) {
      existing.lastHit = Date.now();
      return { proc: existing.proc, wasAlreadyRunning: true, uniqueKey };
    }

    // If exists but with different config or not initialized, kill previous process
    if (existing && !existing.proc.killed) {
      console.log(`[MCP] Killing previous process for ${uniqueKey} (config changed or not initialized)`);
      existing.proc.kill('SIGTERM');
      this.registry.delete(uniqueKey);
    }

    // Create new process
    console.log(`[MCP] Starting new process for ${uniqueKey}: ${config.command} ${config.args.join(' ')}`);
    
    const spawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true  // Windows support
    };

    // Add environment variables if provided
    if (config.env) {
      spawnOptions.env = {
        ...process.env,  // Preserve system variables (including PATH)
        ...config.env    // Add custom ones
      };
    }
    
    const proc = spawn(config.command, config.args, spawnOptions);

    // Register process handlers
    proc.on('exit', (code, signal) => {
      console.log(`[MCP] Process ${uniqueKey} terminated (code: ${code}, signal: ${signal})`);
      this.registry.delete(uniqueKey);
      this.emit('processExit', uniqueKey, clientId, MCPServerName, code, signal);
    });

    proc.on('error', (error) => {
      console.error(`[MCP] Error in process ${uniqueKey}:`, error);
      this.registry.delete(uniqueKey);
      this.emit('processError', uniqueKey, clientId, MCPServerName, error);
    });

    // Register in registry (not yet initialized)
    this.registry.set(uniqueKey, {
      proc,
      config,
      configHash,
      lastHit: Date.now(),
      ttlMs,
      clientId,
      MCPServerName,
      isInitialized: false
    });

    // Wait a bit for process to be ready, then initialize
    setTimeout(async () => {
      try {
        console.log(`[MCP] Initializing MCP server ${uniqueKey}`);
        const initialized = await this._initializeMCPServer(proc);
        
        if (initialized) {
          const entry = this.registry.get(uniqueKey);
          if (entry) {
            entry.isInitialized = true;
            console.log(`[MCP] Server ${uniqueKey} successfully initialized`);
          }
        } else {
          console.error(`[MCP] Failed to initialize server ${uniqueKey}`);
          // Don't kill process, let user decide
        }
      } catch (error) {
        console.error(`[MCP] Error initializing ${uniqueKey}:`, error);
      }
    }, 1000); // 1 second for process to be ready

    return { proc, wasAlreadyRunning: false, uniqueKey };
  }

  /**
   * Gets MCP process for clientId + MCPServerName
   * @param {string} clientId 
   * @param {string} MCPServerName 
   * @returns {ChildProcess|null}
   */
  getProcess(clientId, MCPServerName) {
    const uniqueKey = this._generateKey(clientId, MCPServerName);
    const entry = this.registry.get(uniqueKey);
    
    if (!entry || entry.proc.killed) {
      return null;
    }

    // Update last access
    entry.lastHit = Date.now();
    return entry.proc;
  }

  /**
   * Checks if process exists for clientId + MCPServerName
   * @param {string} clientId 
   * @param {string} MCPServerName 
   * @returns {boolean}
   */
  hasProcess(clientId, MCPServerName) {
    const uniqueKey = this._generateKey(clientId, MCPServerName);
    const entry = this.registry.get(uniqueKey);
    return entry && !entry.proc.killed;
  }

  /**
   * Lists all MCP servers for a specific client
   * @param {string} clientId 
   * @returns {Array}
   */
  listClientServers(clientId) {
    const servers = [];
    
    for (const [uniqueKey, entry] of this.registry) {
      if (entry.clientId === clientId && !entry.proc.killed) {
        servers.push({
          MCPServerName: entry.MCPServerName,
          uniqueKey,
          pid: entry.proc.pid,
          lastHit: entry.lastHit,
          ttlMs: entry.ttlMs,
          config: entry.config
        });
      }
    }

    return servers;
  }

  /**
   * Sweeps and removes expired processes
   */
  sweepExpiredProcesses() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [uniqueKey, entry] of this.registry) {
      if (now - entry.lastHit > entry.ttlMs) {
        expiredKeys.push(uniqueKey);
        console.log(`[MCP] Terminating process ${uniqueKey} due to inactivity`);
        entry.proc.kill('SIGTERM');
        this.emit('timeout', uniqueKey, entry.clientId, entry.MCPServerName);
      }
    }

    // Remove from registry
    expiredKeys.forEach(uniqueKey => this.registry.delete(uniqueKey));
  }

  /**
   * Lists all active processes
   * @returns {Array}
   */
  listActiveProcesses() {
    const processes = [];
    
    for (const [uniqueKey, entry] of this.registry) {
      if (!entry.proc.killed) {
        processes.push({
          uniqueKey,
          clientId: entry.clientId,
          MCPServerName: entry.MCPServerName,
          pid: entry.proc.pid,
          lastHit: entry.lastHit,
          ttlMs: entry.ttlMs,
          config: entry.config
        });
      }
    }

    return processes;
  }

  /**
   * Forces termination of a process
   * @param {string} clientId 
   * @param {string} MCPServerName 
   * @returns {boolean}
   */
  killProcess(clientId, MCPServerName) {
    const uniqueKey = this._generateKey(clientId, MCPServerName);
    const entry = this.registry.get(uniqueKey);
    
    if (!entry || entry.proc.killed) {
      return false;
    }

    entry.proc.kill('SIGTERM');
    this.registry.delete(uniqueKey);
    return true;
  }

  /**
   * Marks a process as initialized
   * @param {string} clientId 
   * @param {string} MCPServerName 
   */
  markAsInitialized(clientId, MCPServerName) {
    const uniqueKey = this._generateKey(clientId, MCPServerName);
    const entry = this.registry.get(uniqueKey);
    
    if (entry) {
      entry.isInitialized = true;
    }
  }

  /**
   * Checks if a process is initialized
   * @param {string} clientId 
   * @param {string} MCPServerName 
   * @returns {boolean}
   */
  isInitialized(clientId, MCPServerName) {
    const uniqueKey = this._generateKey(clientId, MCPServerName);
    const entry = this.registry.get(uniqueKey);
    
    return entry && !entry.proc.killed && entry.isInitialized;
  }

  /**
   * Checks if a process is healthy (alive + initialized + responsive)
   * @param {string} clientId 
   * @param {string} MCPServerName 
   * @returns {Object} { healthy: boolean, reason?: string }
   */
  isHealthy(clientId, MCPServerName) {
    const uniqueKey = this._generateKey(clientId, MCPServerName);
    const entry = this.registry.get(uniqueKey);
    
    if (!entry) {
      return { healthy: false, reason: 'Process not found' };
    }
    
    if (entry.proc.killed) {
      return { healthy: false, reason: 'Process killed' };
    }
    
    if (!entry.isInitialized) {
      return { healthy: false, reason: 'Not initialized' };
    }
    
    // Check if process didn't become zombie (still has valid PID)
    try {
      process.kill(entry.proc.pid, 0); // Signal 0 = check if exists
      return { healthy: true };
    } catch (error) {
      return { healthy: false, reason: 'Process not responding (zombie)' };
    }
  }
}

export const mcpManager = new MCPManager(); 