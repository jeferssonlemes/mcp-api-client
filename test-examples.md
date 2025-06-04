# Test Examples - MCP API Client v2.2

## Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm run dev
```

## 1. Basic Test - Check if server is running

```bash
curl http://localhost:4000/health
```

Expected response:
```json
{
  "ok": true,
  "service": "mcp-api-client",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 2. GitHub MCP Server Tests

### 2.1 Start GitHub server

```bash
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-github",
    "MCPServerName": "github",
    "ttlMinutes": 20,
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
  }'
```

Expected response:
```json
{
  "ok": true,
  "clientId": "test-github",
  "MCPServerName": "github",
  "uniqueKey": "test-github:github",
  "status": "started",
  "pid": 12345,
  "message": "MCP Server 'github' started successfully. MCP initialization in progress..."
}
```

### 2.2 Check health status

```bash
curl "http://localhost:4000/api/health?clientId=test-github&MCPServerName=github"
```

Expected response (when healthy):
```json
{
  "ok": true,
  "clientId": "test-github",
  "MCPServerName": "github",
  "uniqueKey": "test-github:github",
  "status": "healthy",
  "message": "MCP server is operational"
}
```

### 2.3 Check if already running (same call)

Execute the same command from 2.1. Should now return `"status": "already-running"`.

### 2.4 Query available tools

```bash
curl "http://localhost:4000/api/details?clientId=test-github&MCPServerName=github"
```

Expected response:
```json
{
  "ok": true,
  "clientId": "test-github",
  "MCPServerName": "github",
  "uniqueKey": "test-github:github",
  "details": {
    "parsedResponse": {
      "jsonrpc": "2.0",
      "id": 2,
      "result": {
        "tools": [
          {
            "name": "github_search_repositories",
            "description": "Search GitHub repositories"
          },
          {
            "name": "github_get_repository",
            "description": "Get details of a specific repository"
          }
        ]
      }
    }
  }
}
```

### 2.5 Execute GitHub search

```bash
curl -X POST http://localhost:4000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-github",
    "MCPServerName": "github",
    "tool": "github_search_repositories",
    "arguments": {
      "query": "language:javascript stars:>1000"
    }
  }'
```

## 3. MySQL MCP Server Tests

### 3.1 Start MySQL server (Windows example)

```bash
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-mysql",
    "MCPServerName": "mysql",
    "config": {
      "command": "cmd",
      "args": [
        "/c", "npx", "-y", "@smithery/cli@latest", "run", "@michael7736/mysql-mcp-server",
        "--key", "YOUR_API_KEY_HERE",
        "--profile", "YOUR_PROFILE_HERE"
      ],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "your_username",
        "MYSQL_PASS": "your_password",
        "MYSQL_DB": "your_database"
      }
    }
  }'
```

### 3.2 Query MySQL tools

```bash
curl "http://localhost:4000/api/details?clientId=test-mysql&MCPServerName=mysql"
```

### 3.3 Execute SQL query

```bash
curl -X POST http://localhost:4000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-mysql",
    "MCPServerName": "mysql",
    "tool": "run_sql_query",
    "arguments": {
      "query": "SELECT NOW() as current_time, 1 as test_value"
    }
  }'
```

### 3.4 Create table

```bash
curl -X POST http://localhost:4000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-mysql",
    "MCPServerName": "mysql",
    "tool": "create_table",
    "arguments": {
      "query": "CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100), email VARCHAR(100))"
    }
  }'
```

### 3.5 Insert data

```bash
curl -X POST http://localhost:4000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-mysql",
    "MCPServerName": "mysql",
    "tool": "insert_data",
    "arguments": {
      "query": "INSERT INTO users (name, email) VALUES ('John Doe', 'john@example.com')"
    }
  }'
```

## 4. Multi-Session Tests

### 4.1 Create multiple servers for the same client

```bash
# Client A - GitHub
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-A",
    "MCPServerName": "github",
    "config": {
      "command": "npx",
      "args": ["-y", "@smithery/cli@latest", "run", "@smithery-ai/github", "--key", "YOUR_API_KEY", "--profile", "YOUR_PROFILE"]
    }
  }'

# Client A - MySQL (same client, different server)
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-A", 
    "MCPServerName": "mysql",
    "config": {
      "command": "npx",
      "args": ["-y", "@smithery/cli@latest", "run", "@michael7736/mysql-mcp-server", "--key", "YOUR_API_KEY", "--profile", "YOUR_PROFILE"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "username",
        "MYSQL_PASS": "password",
        "MYSQL_DB": "database"
      }
    }
  }'

# Client B - GitHub (different client)
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-B",
    "MCPServerName": "github",
    "config": {
      "command": "npx", 
      "args": ["-y", "@smithery/cli@latest", "run", "@smithery-ai/github", "--key", "YOUR_API_KEY", "--profile", "YOUR_PROFILE"]
    }
  }'
```

### 4.2 List servers for a specific client

```bash
curl "http://localhost:4000/api/list?clientId=client-A"
```

Expected response:
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
    },
    {
      "MCPServerName": "mysql",
      "uniqueKey": "client-A:mysql",
      "pid": 12346,
      "lastHit": "2023-12-04T10:16:00.000Z",
      "ttlMinutes": 15,
      "command": "npx -y @smithery/cli@latest run @michael7736/mysql-mcp-server"
    }
  ]
}
```

### 4.3 Check status of all processes

```bash
curl http://localhost:4000/api/status
```

## 5. Error Handling Tests

### 5.1 Try to execute tool without starting server

```bash
curl -X POST http://localhost:4000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "non-existent-client",
    "MCPServerName": "github",
    "tool": "any_tool"
  }'
```

Expected response (404):
```json
{
  "error": "MCP Server 'github' not found for client 'non-existent-client'. Start first with /start",
  "clientId": "non-existent-client",
  "MCPServerName": "github"
}
```

### 5.2 Query details of non-existent client

```bash
curl "http://localhost:4000/api/details?clientId=non-existent-client&MCPServerName=github"
```

Should return 404 error.

### 5.3 Invalid parameters

```bash
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test"
  }'
```

Expected response (400):
```json
{
  "error": "MCPServerName is required"
}
```

### 5.4 Test server not initialized yet

Wait immediately after starting a server and try to use it:

```bash
curl -X POST http://localhost:4000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-github",
    "MCPServerName": "github",
    "tool": "github_search_repositories"
  }'
```

Expected response (400) if called too quickly:
```json
{
  "error": "MCP Server 'github' not yet initialized. Wait a few seconds after /start",
  "suggestion": "Try again in a few seconds or check logs"
}
```

### 5.5 Test health check of unhealthy server

After killing a process manually, check health:

```bash
curl "http://localhost:4000/api/health?clientId=test-github&MCPServerName=github"
```

Expected response (503):
```json
{
  "ok": false,
  "clientId": "test-github",
  "MCPServerName": "github",
  "status": "unhealthy",
  "reason": "Process killed",
  "suggestion": "Execute /start again"
}
```

## 6. Cleanup Tests

### 6.1 Kill specific process

```bash
curl -X DELETE "http://localhost:4000/api/kill?clientId=test-github&MCPServerName=github"
```

Expected response:
```json
{
  "ok": true,
  "message": "Process test-github:github terminated",
  "clientId": "test-github",
  "MCPServerName": "github"
}
```

### 6.2 Test timeout (wait 15+ minutes for inactive server)

Start a server, wait for TTL timeout, then check status.

## 7. Cross-Platform Tests

### 7.1 Windows command format

```bash
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "windows-test",
    "MCPServerName": "test",
    "config": {
      "command": "cmd",
      "args": ["/c", "echo", "Hello World"]
    }
  }'
```

### 7.2 Unix/Linux command format

```bash
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "unix-test",
    "MCPServerName": "test",
    "config": {
      "command": "echo",
      "args": ["Hello World"]
    }
  }'
```

## Expected Behaviors

- ✅ Processes should start and initialize automatically
- ✅ Health checks should detect process status correctly
- ✅ Multiple clients can run simultaneously
- ✅ Multiple servers per client are supported
- ✅ Proper error handling for all failure scenarios
- ✅ Cross-platform compatibility (Windows/Unix)
- ✅ Environment variable preservation and isolation
- ✅ Automatic timeout and cleanup of inactive processes 
- Verifique os logs do servidor para mensagens de erro detalhadas 