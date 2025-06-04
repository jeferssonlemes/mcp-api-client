import { spawn } from "node:child_process";
import EventEmitter from "node:events";

// Environment variable configuration with fallbacks
const DEFAULT_TTL_MS =
  (parseInt(process.env.DEFAULT_TTL_MINUTES) || 15) * 60_000; // Convert minutes to milliseconds
const SWEEP_INTERVAL_MS =
  (parseInt(process.env.SWEEP_INTERVAL_MINUTES) || 1) * 60_000; // Convert minutes to milliseconds
const PING_INTERVAL_MS =
  (parseInt(process.env.PING_INTERVAL_MINUTES) || 1) * 60_000; // Convert minutes to milliseconds

// Constants for process management
const SIGTERM_TIMEOUT_MS = 8000; // 8 seconds before SIGKILL
const MAX_OUTPUT_BUFFER = 50 * 1024; // 50KB max buffer per process
const INIT_TIMEOUT_MS = 30000; // 30 seconds initialization timeout

class MCPManager extends EventEmitter {
  constructor() {
    super();

    // Prevent memory leak warnings for many concurrent processes
    this.setMaxListeners(0);

    // Structure: uniqueKey -> { proc, config, configHash, lastHit, ttlMs, clientId, MCPServerName, isInitialized, initPromise?, lastPing? }
    this.registry = new Map();

    // Track in-flight initialization promises to prevent race conditions
    this.initializingProcesses = new Map();

    // Auto-incrementing ID for JSON-RPC to avoid collisions
    this.jsonRpcIdCounter = 1;

    // Start timeout sweep
    setInterval(() => this.sweepExpiredProcesses(), SWEEP_INTERVAL_MS);

    // Start ping/heartbeat mechanism
    setInterval(() => this.pingActiveConnections(), PING_INTERVAL_MS);

    console.log(
      `[MCP] Manager initialized with TTL: ${
        DEFAULT_TTL_MS / 60000
      } minutes, Sweep interval: ${SWEEP_INTERVAL_MS / 60000} minutes, Ping interval: ${PING_INTERVAL_MS / 60000} minutes`
    );
  }

  /**
   * Safely redact sensitive information from configuration
   * @param {Object} config
   * @returns {Object}
   */
  _redactSensitiveConfig(config) {
    const redacted = { ...config };
    const sensitiveKeys = [
      "password",
      "pass",
      "key",
      "secret",
      "token",
      "auth",
    ];

    if (redacted.env) {
      redacted.env = { ...redacted.env };
      Object.keys(redacted.env).forEach((key) => {
        const keyLower = key.toLowerCase();
        if (sensitiveKeys.some((sensitive) => keyLower.includes(sensitive))) {
          redacted.env[key] = "[REDACTED]";
        }
      });
    }

    // Redact sensitive args
    if (Array.isArray(redacted.args)) {
      redacted.args = redacted.args.map((arg, index, arr) => {
        const prevArg = index > 0 ? arr[index - 1] : "";
        if (
          sensitiveKeys.some((sensitive) =>
            prevArg.toLowerCase().includes(sensitive)
          )
        ) {
          return "[REDACTED]";
        }
        return arg;
      });
    }

    return redacted;
  }

  /**
   * Safely terminate a process with timeout fallback
   * @param {ChildProcess} proc
   * @param {string} uniqueKey
   */
  _terminateProcess(proc, uniqueKey) {
    if (!proc || proc.killed) return;

    console.log(`[MCP] Terminating process ${uniqueKey} (PID: ${proc.pid})`);

    // Try graceful termination first
    proc.kill("SIGTERM");

    // Fallback to SIGKILL if process doesn't exit
    const forceKillTimer = setTimeout(() => {
      if (!proc.killed) {
        console.log(
          `[MCP] Force killing process ${uniqueKey} (PID: ${proc.pid})`
        );
        proc.kill("SIGKILL");
      }
    }, SIGTERM_TIMEOUT_MS);

    // Clear timeout if process exits gracefully
    proc.once("exit", () => {
      clearTimeout(forceKillTimer);
    });
  }

  _sanitizedEnv(extra = {}) {
    // Keep only essential variables for NPX to work
    const essential = {
      // Core system paths
      PATH: process.env.PATH,

      // Windows essentials
      ...(process.platform === "win32" && {
        SystemRoot: process.env.SystemRoot,
        USERPROFILE: process.env.USERPROFILE,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        APPDATA: process.env.APPDATA,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        ComSpec: process.env.ComSpec,
        PATHEXT: process.env.PATHEXT,
        USERNAME: process.env.USERNAME,
        USERDOMAIN: process.env.USERDOMAIN,
        ProgramData: process.env.ProgramData,
        ProgramFiles: process.env.ProgramFiles,
        "ProgramFiles(x86)": process.env["ProgramFiles(x86)"],
        PROCESSOR_ARCHITECTURE: process.env.PROCESSOR_ARCHITECTURE,
        NUMBER_OF_PROCESSORS: process.env.NUMBER_OF_PROCESSORS,
      }),

      // Unix/Linux essentials
      ...(process.platform !== "win32" && {
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        USER: process.env.USER,
        SHELL: process.env.SHELL,
      }),

      // NPM/Node essentials for NPX
      npm_config_cache: process.env.npm_config_cache,
      npm_config_prefix: process.env.npm_config_prefix,
      npm_config_global_prefix: process.env.npm_config_global_prefix,
      npm_config_userconfig: process.env.npm_config_userconfig,
      npm_config_globalconfig: process.env.npm_config_globalconfig,
      npm_config_user_agent: process.env.npm_config_user_agent, // Important for NPX

      // Runtime paths that MCP servers might need
      NODE: process.env.NODE,
      JAVA_HOME: process.env.JAVA_HOME,
      PYTHON: process.env.PYTHON,

      // Language/locale
      LANG: process.env.LANG,

      // Custom variables from config
      ...extra,
    };

    // Remove undefined values and problematic environment variables
    Object.keys(essential).forEach((key) => {
      if (essential[key] === undefined) {
        delete essential[key];
      }
    });

    // Force NODE_ENV to production (or remove completely) to prevent development mode issues
    essential.NODE_ENV = "production";

    return essential;
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
   * @param {string} uniqueKey - Unique key for logging
   * @returns {Promise<boolean>} - True if successfully initialized
   */
  async _initializeMCPServer(proc, uniqueKey) {
    // Generate unique ID for this specific initialization (avoid race conditions)
    const initId = this.jsonRpcIdCounter++;
    
    return new Promise((resolve) => {
      let output = "";
      let initialized = false;
      let outputSize = 0;

      const cleanup = () => {
        proc.stdout.off("data", dataListener);
        proc.stderr.off("data", errorListener);
        clearTimeout(timeoutHandle);
      };

      const dataListener = (data) => {
        const chunk = data.toString();

        // Prevent memory issues with large outputs
        outputSize += chunk.length;
        if (outputSize > MAX_OUTPUT_BUFFER) {
          console.warn(
            `[MCP] Output buffer limit exceeded for ${uniqueKey}, truncating`
          );
          output = output.slice(-MAX_OUTPUT_BUFFER / 2) + chunk;
          outputSize = output.length;
        } else {
          output += chunk;
        }

        // Look for initialize response with THIS process's specific ID
        const lines = output.split("\n");
        for (const line of lines) {
          if (line.trim().startsWith("{")) {
            try {
              const response = JSON.parse(line.trim());
              // Match the specific initId for this initialization
              if (response.id === initId && response.result) {
                // Received initialize response, now send initialized
                const initializedMessage =
                  JSON.stringify({
                    jsonrpc: "2.0",
                    method: "notifications/initialized",
                  }) + "\n";

                proc.stdin.write(initializedMessage);
                initialized = true;
                cleanup();

                console.log(`[MCP] Server ${uniqueKey} successfully initialized with ID ${initId}`);
                this.emit("initialized", uniqueKey);
                setTimeout(() => resolve(true), 100);
                return;
              }
            } catch (e) {
              // Ignore parse error
            }
          }
        }
      };

      const errorListener = (data) => {
        const message = data.toString().trim();

        // Smithery connection logs are informational, not errors
        if (
          message.includes("[Runner]") &&
          (message.includes("Connecting to") ||
            message.includes("connection initiated") ||
            message.includes("connection established"))
        ) {
          console.log(`[MCP] ${message}`);
        } else if (message.length > 0) {
          // Only log as error if it's actually an error message
          console.error(
            `[MCP] Error during initialization ${uniqueKey}: ${message}`
          );
        }
      };

      proc.stdout.on("data", dataListener);
      proc.stderr.on("data", errorListener);

      // Send initialize command with unique ID
      const initializeMessage =
        JSON.stringify({
          jsonrpc: "2.0",
          id: initId,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {
              roots: {
                listChanged: true,
              },
              sampling: {},
            },
            clientInfo: {
              name: "mcp-api-client",
              version: "2.3.0",
            },
          },
        }) + "\n";

      console.log(`[MCP] Sending initialize command to ${uniqueKey} with ID ${initId}`);
      proc.stdin.write(initializeMessage);

      // Timeout for initialization
      const timeoutHandle = setTimeout(() => {
        if (!initialized) {
          console.error(`[MCP] Initialization timeout for ${uniqueKey} (ID: ${initId})`);
          cleanup();
          this.emit("initTimeout", uniqueKey);
          resolve(false);
        }
      }, INIT_TIMEOUT_MS);
    });
  }

  /**
   * Ensures an MCP process exists for clientId + MCPServerName
   * @param {string} clientId - Unique client ID
   * @param {string} MCPServerName - MCP server name/identifier
   * @param {Object} config - MCP configuration {command, args}
   * @param {number} ttlMs - TTL in milliseconds
   * @returns {Object} { proc, wasAlreadyRunning, uniqueKey, initialized }
   */
  async ensureProcess(clientId, MCPServerName, config, ttlMs = DEFAULT_TTL_MS) {
    const uniqueKey = this._generateKey(clientId, MCPServerName);
    const configHash = JSON.stringify(config);
    const existing = this.registry.get(uniqueKey);

    console.log(`[MCP] ensureProcess called for ${uniqueKey} (concurrent processes: ${this.initializingProcesses.size})`);

    // Check if there's an in-flight initialization for this key
    const inFlightPromise = this.initializingProcesses.get(uniqueKey);
    if (inFlightPromise) {
      console.log(`[MCP] Waiting for in-flight initialization: ${uniqueKey}`);
      const result = await inFlightPromise;
      console.log(`[MCP] In-flight initialization completed for ${uniqueKey}`);
      return { ...result, wasAlreadyRunning: true };
    }

    // If process already exists with same config and is alive and initialized
    if (
      existing &&
      existing.configHash === configHash &&
      !existing.proc.killed &&
      existing.isInitialized
    ) {
      console.log(`[MCP] Reusing existing initialized process for ${uniqueKey}`);
      existing.lastHit = Date.now();
      return {
        proc: existing.proc,
        wasAlreadyRunning: true,
        uniqueKey,
        initialized: Promise.resolve(true),
      };
    }

    // If exists but with different config or not initialized, kill previous process
    if (existing && !existing.proc.killed) {
      console.log(
        `[MCP] Killing previous process for ${uniqueKey} (config changed: ${existing.configHash !== configHash}, initialized: ${existing.isInitialized})`
      );
      this._terminateProcess(existing.proc, uniqueKey);
      this.registry.delete(uniqueKey);
    }

    console.log(`[MCP] Starting new initialization for ${uniqueKey}`);

    // Create initialization promise to prevent race conditions
    const initializationPromise = this._doEnsureProcess(
      uniqueKey,
      config,
      ttlMs,
      clientId,
      MCPServerName,
      configHash
    );
    this.initializingProcesses.set(uniqueKey, initializationPromise);

    try {
      const result = await initializationPromise;
      console.log(`[MCP] Initialization completed for ${uniqueKey}, success: ${result.initialized}`);
      return result;
    } finally {
      this.initializingProcesses.delete(uniqueKey);
      console.log(`[MCP] Removed ${uniqueKey} from in-flight list (remaining: ${this.initializingProcesses.size})`);
    }
  }

  /**
   * Internal method to actually create and initialize the process
   * @private
   */
  async _doEnsureProcess(
    uniqueKey,
    config,
    ttlMs,
    clientId,
    MCPServerName,
    configHash
  ) {
    // Create new process
    const redactedConfig = this._redactSensitiveConfig(config);
    console.log(
      `[MCP] Starting new process for ${uniqueKey}:`,
      `${redactedConfig.command} ${redactedConfig.args.join(" ")}`
    );

    // Use shell: false for better security, build command properly
    const spawnOptions = {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false, // More secure
    };

    // Add environment variables if provided
    if (config.env) {
      spawnOptions.env = this._sanitizedEnv(config.env);
    } else {
      spawnOptions.env = this._sanitizedEnv();
    }

    // Handle Windows NPX properly without shell injection
    let command = config.command;
    let args = config.args || [];
    
    if (process.platform === "win32") {
      if (command === "npx") {
        // Convert npx to cmd /c npx for Windows
        command = "cmd";
        args = ["/c", "npx", ...args];
      } else if (command === "cmd" && args.length > 0 && !args[0].startsWith("/")) {
        // If using cmd directly but missing /c flag, add it
        args = ["/c", ...args];
      }
    }

    console.log(`[MCP] Spawning process: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, spawnOptions);

    if (!proc.pid) {
      console.error(`[MCP] Failed to spawn process for ${uniqueKey} - no PID assigned`);
      throw new Error(`Failed to spawn process for ${uniqueKey}`);
    }

    console.log(`[MCP] Process spawned successfully for ${uniqueKey} (PID: ${proc.pid})`);

    // Register process handlers
    proc.on("exit", (code, signal) => {
      console.log(
        `[MCP] Process ${uniqueKey} terminated (PID: ${proc.pid}, code: ${code}, signal: ${signal})`
      );
      this.registry.delete(uniqueKey);
      this.emit(
        "processExit",
        uniqueKey,
        clientId,
        MCPServerName,
        code,
        signal
      );
    });

    proc.on("error", (error) => {
      console.error(`[MCP] Error in process ${uniqueKey} (PID: ${proc.pid}):`, error);
      this.registry.delete(uniqueKey);
      this.emit("processError", uniqueKey, clientId, MCPServerName, error);
    });

    // Register in registry (not yet initialized)
    const entry = {
      proc,
      config,
      configHash,
      lastHit: Date.now(),
      ttlMs,
      clientId,
      MCPServerName,
      isInitialized: false,
    };

    this.registry.set(uniqueKey, entry);
    console.log(`[MCP] Process registered in registry: ${uniqueKey}`);

    // Initialize the process
    console.log(`[MCP] Initializing MCP server ${uniqueKey}`);

    const initializePromise = this._initializeMCPServer(proc, uniqueKey);
    const initialized = await initializePromise;

    if (initialized) {
      const currentEntry = this.registry.get(uniqueKey);
      if (currentEntry) {
        currentEntry.isInitialized = true;
        console.log(`[MCP] Server ${uniqueKey} successfully initialized and marked as ready`);
        this.emit("configChanged", uniqueKey, "initialized");
      } else {
        console.warn(`[MCP] Entry not found in registry after initialization: ${uniqueKey}`);
      }
    } else {
      console.error(`[MCP] Failed to initialize server ${uniqueKey}`);
      this.emit("initializationFailed", uniqueKey);
      // Don't kill process, let user decide
    }

    return {
      proc,
      wasAlreadyRunning: false,
      uniqueKey,
      initialized: Promise.resolve(initialized),
    };
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
          lastPing: entry.lastPing || null,
          ttlMs: entry.ttlMs,
          config: this._redactSensitiveConfig(entry.config),
          isInitialized: entry.isInitialized,
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
        this._terminateProcess(entry.proc, uniqueKey);
        this.emit("timeout", uniqueKey, entry.clientId, entry.MCPServerName);
      }
    }

    // Remove from registry
    expiredKeys.forEach((uniqueKey) => this.registry.delete(uniqueKey));
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
          lastPing: entry.lastPing || null,
          ttlMs: entry.ttlMs,
          config: this._redactSensitiveConfig(entry.config),
          isInitialized: entry.isInitialized,
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

    this._terminateProcess(entry.proc, uniqueKey);
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
      this.emit("initialized", uniqueKey);
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
      return { healthy: false, reason: "Process not found" };
    }

    if (entry.proc.killed) {
      return { healthy: false, reason: "Process killed" };
    }

    if (!entry.isInitialized) {
      return { healthy: false, reason: "Not initialized" };
    }

    // Check if process didn't become zombie (still has valid PID)
    try {
      process.kill(entry.proc.pid, 0); // Signal 0 = check if exists
      return { healthy: true };
    } catch (error) {
      return { healthy: false, reason: "Process not responding (zombie)" };
    }
  }

  /**
   * Manually pings a specific MCP connection to keep it alive
   * @param {string} clientId
   * @param {string} MCPServerName
   * @returns {Promise<Object>} { success: boolean, error?: string }
   */
  async pingConnection(clientId, MCPServerName) {
    const uniqueKey = this._generateKey(clientId, MCPServerName);
    const entry = this.registry.get(uniqueKey);

    if (!entry) {
      return { success: false, error: "Process not found" };
    }

    if (entry.proc.killed) {
      return { success: false, error: "Process is killed" };
    }

    if (!entry.isInitialized) {
      return { success: false, error: "Process not initialized" };
    }

    try {
      const pingSuccess = await this._sendPing(entry.proc, uniqueKey);
      if (pingSuccess) {
        entry.lastPing = Date.now();
        return { success: true };
      } else {
        return { success: false, error: "Failed to send ping message" };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Returns a deep copy of the current state for debugging
   * @returns {Object}
   */
  dumpState() {
    const state = {
      activeProcesses: this.registry.size,
      initializingProcesses: this.initializingProcesses.size,
      processes: {},
      inFlightKeys: Array.from(this.initializingProcesses.keys()),
    };

    for (const [uniqueKey, entry] of this.registry) {
      state.processes[uniqueKey] = {
        clientId: entry.clientId,
        MCPServerName: entry.MCPServerName,
        pid: entry.proc.pid,
        isInitialized: entry.isInitialized,
        killed: entry.proc.killed,
        lastHit: new Date(entry.lastHit).toISOString(),
        lastPing: entry.lastPing ? new Date(entry.lastPing).toISOString() : null,
        ttlMs: entry.ttlMs,
        config: this._redactSensitiveConfig(entry.config),
      };
    }

    return state;
  }

  /**
   * Gracefully shutdown all processes
   */
  shutdown() {
    console.log("[MCP] Shutting down MCPManager...");

    for (const [uniqueKey, entry] of this.registry) {
      this._terminateProcess(entry.proc, uniqueKey);
    }

    this.registry.clear();
    this.initializingProcesses.clear();

    console.log("[MCP] MCPManager shutdown complete");
  }

  /**
   * Sends a ping to an individual MCP server to keep connection alive
   * @param {ChildProcess} proc - MCP server process
   * @param {string} uniqueKey - Unique key for logging
   * @returns {Promise<boolean>} - True if ping was sent successfully
   */
  async _sendPing(proc, uniqueKey) {
    if (!proc || proc.killed) {
      return false;
    }

    try {
      const pingId = this.jsonRpcIdCounter++;
      const pingMessage = JSON.stringify({
        jsonrpc: "2.0",
        id: pingId,
        method: "ping",
        params: {}
      }) + "\n";

      // Try to write ping message
      const writeResult = proc.stdin.write(pingMessage);
      
      if (writeResult) {
        console.log(`[MCP] Ping sent to ${uniqueKey} (ID: ${pingId})`);
        return true;
      } else {
        console.warn(`[MCP] Failed to send ping to ${uniqueKey} - stdin buffer full (ID: ${pingId})`);
        return false;
      }
    } catch (error) {
      console.error(`[MCP] Error sending ping to ${uniqueKey}:`, error.message);
      return false;
    }
  }

  /**
   * Pings all active and initialized MCP connections to keep them alive
   * This prevents idle timeouts from servers like Smithery
   */
  async pingActiveConnections() {
    const now = Date.now();
    let pingedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    console.log(`[MCP] Starting heartbeat cycle (active connections: ${this.registry.size})`);

    // Create a snapshot of registry to avoid modification during iteration
    const registrySnapshot = Array.from(this.registry.entries());

    for (const [uniqueKey, entry] of registrySnapshot) {
      try {
        // Only ping processes that are:
        // 1. Not killed
        // 2. Properly initialized 
        // 3. Haven't been pinged too recently (avoid spam)
        if (
          !entry.proc.killed && 
          entry.isInitialized && 
          (!entry.lastPing || (now - entry.lastPing) > (PING_INTERVAL_MS * 0.8))
        ) {
          const pingSuccess = await this._sendPing(entry.proc, uniqueKey);
          if (pingSuccess) {
            // Update lastPing only if still in registry (process might have been killed)
            const currentEntry = this.registry.get(uniqueKey);
            if (currentEntry) {
              currentEntry.lastPing = now;
              pingedCount++;
            }
          } else {
            errorCount++;
          }
        } else {
          skippedCount++;
          
          // Log why it was skipped for debugging
          const reasons = [];
          if (entry.proc.killed) reasons.push("killed");
          if (!entry.isInitialized) reasons.push("not-initialized");
          if (entry.lastPing && (now - entry.lastPing) <= (PING_INTERVAL_MS * 0.8)) {
            reasons.push(`recently-pinged-${Math.round((now - entry.lastPing) / 1000)}s-ago`);
          }
          
          if (reasons.length > 0) {
            console.log(`[MCP] Skipped ping for ${uniqueKey}: ${reasons.join(', ')}`);
          }
        }
      } catch (error) {
        console.error(`[MCP] Error during ping for ${uniqueKey}:`, error);
        errorCount++;
      }
    }

    if (pingedCount > 0 || skippedCount > 0 || errorCount > 0) {
      console.log(`[MCP] Heartbeat completed: pinged ${pingedCount}, skipped ${skippedCount}, errors ${errorCount}`);
    }
  }
}

export const mcpManager = new MCPManager();
