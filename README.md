# MCP API Client v2.2

A robust Node.js service for managing multiple MCP (Model Context Protocol) servers with multi-session support, automatic timeout control, connection reuse, and advanced health monitoring.

## Features

- 🔄 **Multi-session**: Each `clientId` maintains its own MCP server instance
- ⏱️ **Automatic timeout**: Inactive processes are terminated automatically  
- 🔁 **Connection reuse**: Same configuration reuses existing process
- 📊 **Health monitoring**: Comprehensive health checks and process monitoring
- 🛡️ **Security validations**: Protection against disconnections and zombie processes
- 🎯 **MCP protocol compliance**: Proper initialize → initialized → tools flow
- 🔧 **Cross-platform**: Windows (cmd) and Unix support
- 📡 **RESTful API**: Simple HTTP interface for MCP interactions

## Installation

```bash
npm install
```

## Usage

### Start the server

```bash
npm start
# or for development
npm run dev
```

Server will be available at `http://localhost:4000`

## API Endpoints

### 1. POST /api/start
Starts or checks the status of an MCP server with automatic initialization.

**Body**:
```json
{
  "clientId": "client-github",
  "MCPServerName": "github", 
  "ttlMinutes": 15,
  "config": {
    "command": "npx",
    "args": [
      "-y",
      "@smithery/cli@latest", 
      "run",
      "@smithery-ai/github",
      "--key", "YOUR_API_KEY_HERE",
      "--profile", "YOUR_PROFILE_HERE"
    ]
  }
}
```

**Response**:
```json
{
  "ok": true,
  "clientId": "client-github",
  "MCPServerName": "github",
  "uniqueKey": "client-github:github",
  "status": "started",
  "pid": 12345,
  "message": "MCP Server 'github' started successfully. MCP initialization in progress..."
}
```

### 2. GET /api/health?clientId=xxx&MCPServerName=yyy
Performs comprehensive health check of an MCP server.

**Response (Healthy)**:
```json
{
  "ok": true,
  "clientId": "client-github",
  "MCPServerName": "github",
  "uniqueKey": "client-github:github",
  "status": "healthy",
  "message": "MCP server is operational"
}
```

**Response (Unhealthy)**:
```json
{
  "ok": false,
  "clientId": "client-github", 
  "MCPServerName": "github",
  "status": "unhealthy",
  "reason": "Process killed",
  "suggestion": "Execute /start again"
}
```

### 3. GET /api/details?clientId=xxx&MCPServerName=yyy
Returns MCP server information (available tools, etc.).

**Response**:
```json
{
  "ok": true,
  "clientId": "client-github",
  "MCPServerName": "github",
  "uniqueKey": "client-github:github",
  "details": {
    "rawOutput": "...",
    "errorOutput": "...",
    "parsedResponse": {
      "jsonrpc": "2.0",
      "id": 2,
      "result": {
        "tools": [
          {
            "name": "github_search_repositories",
            "description": "Search GitHub repositories"
          }
        ]
      }
    }
  }
}
```

### 4. POST /api/run
Executes a tool on the MCP server.

**Body (option 1 - specific tool)**:
```json
{
  "clientId": "client-github",
  "MCPServerName": "github",
  "tool": "search_repositories",
  "arguments": {
    "query": "typescript stars:>1000"
  }
}
```

**Body (option 2 - direct input)**:
```json
{
  "clientId": "client-github",
  "MCPServerName": "github", 
  "input": "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"search_repositories\",\"arguments\":{\"query\":\"typescript\"}}}\n"
}
```

**Response**:
```json
{
  "ok": true,
  "clientId": "client-github",
  "MCPServerName": "github",
  "uniqueKey": "client-github:github",
  "tool": "github_search_repositories",
  "result": {
    "rawOutput": "...",
    "errorOutput": "...",
    "parsedResponse": {
      "jsonrpc": "2.0",
      "id": 1733270145234,
      "result": {
        "content": [
          {
            "type": "text", 
            "text": "[{\"name\":\"typescript\",\"stars\":45000}]"
          }
        ]
      }
    }
  }
}
```

### 5. GET /api/list?clientId=xxx
Lists all MCP servers for a specific client.

**Response**:
```json
{
  "ok": true,
  "clientId": "client-A",
  "totalServers": 2,
  "servers": [
    {
      "MCPServerName": "github",
      "uniqueKey": "client-A:github",
      "pid": 12345,
      "lastHit": "2023-12-04T10:15:45.000Z",
      "ttlMinutes": 15,
      "command": "npx -y @smithery/cli@latest run @smithery-ai/github"
    }
  ]
}
```

### 6. GET /api/status
Lists all active MCP processes (for monitoring).

### 7. DELETE /api/kill?clientId=xxx&MCPServerName=yyy
Forces termination of a specific process (for debugging).

## Error Handling

### HTTP Status Codes

- **400 Bad Request**: Missing parameters or server not initialized
- **404 Not Found**: MCP server not found
- **410 Gone**: Process was killed
- **503 Service Unavailable**: Server unhealthy
- **500 Internal Server Error**: Execution errors

### Common Error Responses

**Server not initialized**:
```json
{
  "error": "MCP Server 'github' not yet initialized. Wait a few seconds after /start",
  "suggestion": "Try again in a few seconds or check logs"
}
```

**Process killed**:
```json
{
  "error": "MCP Server 'github' was terminated. Execute /start again",
  "suggestion": "The process was terminated. Start again with /start"
}
```

**Process died during execution**:
```json
{
  "error": "MCP Server 'github' terminated during execution",
  "processExitCode": 1,
  "suggestion": "Execute /start again"
}
```

## Usage Examples

### 1. Start GitHub MCP Server

```bash
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-github",
    "MCPServerName": "github",
    "ttlMinutes": 20,
    "config": {
      "command": "npx",
      "args": [
        "-y", "@smithery/cli@latest", "run", "@smithery-ai/github",
        "--key", "YOUR_API_KEY",
        "--profile", "YOUR_PROFILE"
      ]
    }
  }'
```

### 2. Check server health

```bash
curl "http://localhost:4000/api/health?clientId=client-github&MCPServerName=github"
```

### 3. List available tools

```bash
curl "http://localhost:4000/api/details?clientId=client-github&MCPServerName=github"
```

### 4. Search repositories

```bash
curl -X POST http://localhost:4000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-github",
    "MCPServerName": "github",
    "tool": "github_search_repositories",
    "arguments": {
      "query": "language:typescript stars:>1000"
    }
  }'
```

### 5. Start MySQL MCP Server (Windows)

```bash
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-mysql",
    "MCPServerName": "mysql",
    "config": {
      "command": "cmd",
      "args": [
        "/c", "npx", "-y", "@smithery/cli@latest", "run", "@michael7736/mysql-mcp-server",
        "--key", "YOUR_API_KEY",
        "--profile", "YOUR_PROFILE"
      ],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "username",
        "MYSQL_PASS": "password",
        "MYSQL_DB": "database_name"
      }
    }
  }'
```

### 6. Execute SQL query

```bash
curl -X POST http://localhost:4000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-mysql",
    "MCPServerName": "mysql",
    "tool": "run_sql_query",
    "arguments": {
      "query": "SELECT NOW() as current_time, 1 as test_value"
    }
  }'
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 4000)

### Timeout Settings

- Default: 15 minutes of inactivity
- Configurable per client via `ttlMinutes`
- Automatic sweep every 1 minute

### Platform Support

**Windows**: Use `cmd /c` for better compatibility
```json
{
  "command": "cmd",
  "args": ["/c", "npx", "..."]
}
```

**Unix/Linux/macOS**: Direct command execution
```json
{
  "command": "npx",
  "args": ["..."]
}
```

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Client A      │────│  MCP Manager │────│ MCP Server A    │
│   (GitHub)      │    │              │    │ (GitHub)        │
└─────────────────┘    │              │    └─────────────────┘
                       │              │    
┌─────────────────┐    │              │    ┌─────────────────┐
│   Client B      │────│              │────│ MCP Server B    │
│   (MySQL)       │    └──────────────┘    │ (MySQL)         │
└─────────────────┘                        └─────────────────┘
```

### Components

- **MCP Manager**: Manages MCP process lifecycle and protocol compliance
- **API Router**: Exposes RESTful endpoints
- **Process Registry**: Maintains clientId:MCPServerName → process mapping
- **Health Monitor**: Continuous process health verification

### MCP Protocol Flow

1. **POST /start** → Create process → Initialize MCP protocol automatically
2. **GET /health** → Verify complete server health (optional)
3. **GET /details** → Check initialized → List available tools
4. **POST /run** → Check initialized → Execute tools

## Security Features

- ✅ **Process validation**: Checks if process is alive before use
- ✅ **Stdin protection**: Try/catch when writing commands
- ✅ **Zombie detection**: Verifies PID still responds
- ✅ **Runtime monitoring**: Detects process death during execution
- ✅ **Comprehensive health checks**: Multiple validation layers
- ✅ **Environment isolation**: Preserves system PATH while adding custom env vars

## Development

### Project Structure

```
src/
├── index.js        # Server bootstrap
├── api.js          # REST API routes
└── mcpManager.js   # MCP process manager
```

### Logging

The service produces detailed logs:
- Process start/stop events
- MCP initialization status
- Inactivity timeouts
- Process errors
- API requests and responses

### Error Handling

- Failed processes are automatically removed from registry
- Configurable response timeouts (3-5s)
- Graceful shutdown with SIGTERM/SIGINT
- Comprehensive error codes and messages

## Changelog

### v2.2 - Security & Robustness
- Added comprehensive health checks
- Process death detection during execution
- Stdin write protection
- Zombie process detection
- New `/health` endpoint
- Enhanced error handling with specific HTTP codes

### v2.1 - MCP Protocol Compliance
- Automatic MCP initialization in `/start`
- Proper initialize → initialized → tools flow
- Environment variable preservation (Windows PATH fix)
- Separation of concerns (MCPManager vs API)

### v2.0 - Multi-Session Support
- Multiple MCP servers per client
- Unique identification with clientId:MCPServerName
- Enhanced process management
- Cross-platform support

## Roadmap

- [ ] JWT/API-Key authentication
- [ ] Redis persistence for clusters
- [ ] Prometheus metrics
- [ ] Rate limiting per client
- [ ] WebSocket streaming for long responses
- [ ] Web monitoring interface
- [ ] Docker containerization
- [ ] Kubernetes deployment manifests 