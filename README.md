# MCP API Client v2.3

A robust Node.js service for managing multiple MCP (Model Context Protocol) servers with multi-session support, automatic timeout control, connection reuse, advanced health monitoring, **simple token authentication**, and **comprehensive rate limiting**.

## Features

- 🔄 **Multi-session**: Each `clientId` maintains its own MCP server instance
- ⏱️ **Automatic timeout**: Inactive processes are terminated automatically  
- 🔁 **Connection reuse**: Same configuration reuses existing process
- 📊 **Health monitoring**: Comprehensive health checks and process monitoring
- 🔄 **Keep-alive pings**: Automatic heartbeat to prevent idle timeouts (Smithery compatible)
- 🛡️ **Security validations**: Protection against disconnections and zombie processes
- 🎯 **MCP protocol compliance**: Proper initialize → initialized → tools flow
- 🔧 **Cross-platform**: Windows (cmd) and Unix support
- 📡 **RESTful API**: Simple HTTP interface for MCP interactions
- 🔐 **Authentication**: Simple static token authentication
- 🚦 **Rate Limiting**: Configurable rate limits with DDoS protection
- ⚡ **Smart throttling**: Progressive slow-down for burst protection
- 🔒 **Security headers**: CORS, CSP, HSTS, and other security measures

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Authentication
```bash
# Copy environment template
cp env.example .env

# Generate a secure token (32 characters)
node -e "console.log(Array.from({length:32}, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random()*62)]).join(''))"

# Add the token to your .env file
# AUTH_TOKEN=your-generated-token-here
```

### 3. Start the Server
```bash
npm start
```

### 4. Access Documentation
- **Interactive API Documentation**: http://localhost:4000/docs
- **API Information**: http://localhost:4000/
- **Health Check**: http://localhost:4000/health
- **OpenAPI Specification**: http://localhost:4000/docs.json

## 📚 Interactive Documentation

The API now includes **Swagger UI** for interactive documentation and testing:

### Features
- **Try It Out**: Test all endpoints directly from the browser
- **Authentication Support**: Built-in support for all three auth methods
- **Request/Response Examples**: Comprehensive examples for all endpoints
- **Schema Documentation**: Detailed request and response schemas
- **Rate Limiting Info**: Clear documentation of all rate limits

### Authentication in Swagger UI
1. Click the **"Authorize"** button in Swagger UI
2. Choose one of three methods:
   - **Bearer Token**: Enter your token in the "BearerAuth" field
   - **Header Token**: Enter your token in the "TokenHeader" field  
   - **Query Parameter**: Use the "TokenQuery" field

### Available Endpoints

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| GET | `/docs` | Interactive API documentation | None |
| GET | `/` | API information and quick start | None |
| GET | `/health` | Service health check | None |
| POST | `/api/start` | Start or check MCP server | Standard |
| GET | `/api/list` | List client's MCP servers | Standard |
| GET | `/api/details` | Get MCP server details | Standard |
| POST | `/api/run` | Execute tool on MCP server | **Strict** |
| GET | `/api/health` | Check specific MCP server health | Standard |
| GET | `/api/status` | List all active processes | Standard |
| DELETE | `/api/kill` | Terminate specific process | Standard |

## 🔐 Authentication

All `/api/*` endpoints require authentication using a static token. Three methods supported:

### Method 1: Authorization Header (Recommended)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4000/api/status
```

### Method 2: Custom Header
```bash
curl -H "X-Auth-Token: YOUR_TOKEN" http://localhost:4000/api/status
```

### Method 3: Query Parameter
```bash
curl "http://localhost:4000/api/status?token=YOUR_TOKEN"
```

## 🚦 Rate Limiting

### Standard Endpoints
- **Limit**: 100 requests per 15 minutes
- **Slow Down**: After 50 requests per minute
- **Applies to**: Most API endpoints

### Strict Endpoints (`/api/run`)
- **Limit**: 20 requests per 5 minutes
- **Purpose**: Prevent abuse of tool execution
- **Recommendation**: Use sparingly for actual tool execution

### Authentication Endpoints
- **Limit**: 10 requests per minute
- **Purpose**: Prevent brute force attacks

## 📖 API Examples

### Start a GitHub MCP Server
```bash
curl -X POST http://localhost:4000/api/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-github",
    "MCPServerName": "github",
    "ttlMinutes": 20,
    "config": {
      "command": "npx",
      "args": ["-y", "@smithery/cli@latest", "run", "@smithery-ai/github", "--key", "YOUR_GITHUB_TOKEN"]
    }
  }'
```

### Execute a Tool
```bash
curl -X POST http://localhost:4000/api/run \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-github",
    "MCPServerName": "github",
    "tool": "search_repositories",
    "arguments": {
      "query": "typescript stars:>1000"
    }
  }'
```

### List Active Servers
```bash
curl "http://localhost:4000/api/list?clientId=client-github" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🛠️ Configuration

Key environment variables (see `env.example` for complete list):

```bash
# Authentication (Required)
AUTH_TOKEN=your-32-character-token

# Server
PORT=4000
NODE_ENV=development

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000
STRICT_RATE_LIMIT_MAX=20
STRICT_RATE_LIMIT_WINDOW_MS=300000

# Process Management
DEFAULT_TTL_MINUTES=15           # Default TTL for MCP processes
SWEEP_INTERVAL_MINUTES=1         # How often to check for expired processes
PING_INTERVAL_MINUTES=1          # How often to ping MCP servers to keep connections alive

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:4000
```

### 🔄 Connection Keep-Alive (Ping/Heartbeat)

The service includes an automatic **ping/heartbeat mechanism** to prevent idle timeouts from MCP servers (especially important for services like Smithery):

- **Automatic Pinging**: Every 1 minute (configurable via `PING_INTERVAL_MINUTES`)
- **Smart Targeting**: Only pings initialized and active connections
- **Prevents Spam**: Avoids pinging too frequently (80% of interval minimum)
- **Logging**: All ping activities are logged for monitoring

This feature is **especially important** for:
- Smithery MCP servers (have idle timeouts)
- Long-running connections
- Production environments with infrequent API calls

The ping system is **enabled by default** and requires no configuration for basic use.

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                                    API Layer                                       │
├─────────────────┬──────────────────┬─────────────────┬─────────────────────────────┤
│   Swagger UI    │   Rate Limiting  │  Authentication │       API Routes            │
│  Documentation  │   Middleware     │   Middleware    │      (/api/*)               │
└─────────────────┴──────────────────┴─────────────────┴─────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                 MCP Manager                                         │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────────────┐ │
│  │   Process       │    │   Heartbeat      │    │      Registry                   │ │
│  │   Registry      │    │   System         │    │   (clientId:serverName)         │ │
│  │                 │    │   (1min ping)    │    │                                 │ │
│  └─────────────────┘    └──────────────────┘    └─────────────────────────────────┘ │
│                                                                                     │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────────────┐ │
│  │   Race Condition│    │   TTL Management │    │    Init Tracking                │ │
│  │   Protection    │    │   (15min default)│    │   (Parallel Safe)               │ │
│  └─────────────────┘    └──────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                              Active MCP Processes                                  │
│                                                                                    │
│  Client A                    Client B                    Client C                  │
│  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐       │
│  │ GitHub Server   │         │ MySQL Server    │         │ File Server     │       │
│  │ PID: 12345      │         │ PID: 12346      │         │ PID: 12348      │       │
│  │ Status: ✅Ready │         │ Status: ✅Ready│         │ Status: ✅Ready │       │
│  │ Last Ping: 30s  │         │ Last Ping: 45s  │         │ Last Ping: 20s  │       │
│  └─────────────────┘         └─────────────────┘         └─────────────────┘       │
│                                                                                    │
│  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐       │
│  │ Slack Server    │         │ Weather Server  │         │ Calendar Server │       │
│  │ PID: 12347      │         │ PID: 12349      │         │ PID: 12350      │       │
│  │ Status: 🔄Init  │        │ Status: ✅ Ready│         │ Status: ✅Ready │       │
│  │ Last Ping: -    │         │ Last Ping: 15s  │         │ Last Ping: 55s  │       │
│  └─────────────────┘         └─────────────────┘         └─────────────────┘       │
│                                                                                    │
│  Key: client-a:github        Key: client-b:mysql        Key: client-c:files        │
│       client-a:slack              client-b:weather           client-c:calendar     │
└────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Process Management                                     │
│                                                                                     │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────────────┐ │
│  │  Auto Cleanup   │    │   Health Checks  │    │      Graceful Shutdown          │ │
│  │  (TTL Based)    │    │   (PID Monitor)  │    │    (SIGTERM → SIGKILL)          │ │
│  └─────────────────┘    └──────────────────┘    └─────────────────────────────────┘ │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐│
│  │                           Cross-Platform Support                                |│
│  │                                                                                 ││
│  │  Windows: cmd /c npx ...           Unix/Linux: npx ...                          ││
│  │  Environment: Sanitized            Shell: Disabled (Security)                   ││
│  └─────────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────────┘

Features:
🔄 Concurrent Safe: Multiple clients can start different servers simultaneously
⚡ Auto-Recovery: Failed processes are detected and can be restarted  
🔍 Health Monitoring: Real-time status tracking with PID validation
💓 Keep-Alive: Automatic heartbeat prevents idle disconnections (Smithery compatible)
🛡️ Race Protection: Unique IDs prevent initialization conflicts
📊 Smart Registry: Efficient process reuse with configuration hashing
```

## 🔧 Development

### Testing with Swagger UI
1. Start the server: `npm start`
2. Open http://localhost:4000/docs
3. Click "Authorize" and enter your token
4. Test any endpoint using the "Try it out" button

### Testing with curl
```bash
# Test authentication
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4000/api/status

# Test rate limiting (run multiple times quickly)
for i in {1..10}; do curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4000/api/status; done
```

## 📋 Production Checklist

- [ ] Set `AUTH_TOKEN` to a secure 32-character random string
- [ ] Configure `ALLOWED_ORIGINS` for your domain
- [ ] Set `NODE_ENV=production`
- [ ] Review rate limiting settings
- [ ] Set up HTTPS/TLS termination
- [ ] Configure monitoring and logging
- [ ] Test all endpoints in Swagger UI

## 🆘 Troubleshooting

### Common Issues
<!-- @import "[TOC]" {cmd="toc" depthFrom=1 depthTo=6 orderedList=false} -->

<!-- code_chunk_output -->

- [MCP API Client v2.3](#mcp-api-client-v23)
  - [Features](#features)
  - [🚀 Quick Start](#-quick-start)
    - [1. Install Dependencies](#1-install-dependencies)
    - [2. Configure Authentication](#2-configure-authentication)
    - [3. Start the Server](#3-start-the-server)
    - [4. Access Documentation](#4-access-documentation)
  - [📚 Interactive Documentation](#-interactive-documentation)
    - [Features](#features-1)
    - [Authentication in Swagger UI](#authentication-in-swagger-ui)
    - [Available Endpoints](#available-endpoints)
  - [🔐 Authentication](#-authentication)
    - [Method 1: Authorization Header (Recommended)](#method-1-authorization-header-recommended)
    - [Method 2: Custom Header](#method-2-custom-header)
    - [Method 3: Query Parameter](#method-3-query-parameter)
  - [🚦 Rate Limiting](#-rate-limiting)
    - [Standard Endpoints](#standard-endpoints)
    - [Strict Endpoints (`/api/run`)](#strict-endpoints-apirun)
    - [Authentication Endpoints](#authentication-endpoints)
  - [📖 API Examples](#-api-examples)
    - [Start a GitHub MCP Server](#start-a-github-mcp-server)
    - [Execute a Tool](#execute-a-tool)
    - [List Active Servers](#list-active-servers)
  - [🛠️ Configuration](#️-configuration)
    - [🔄 Connection Keep-Alive (Ping/Heartbeat)](#-connection-keep-alive-pingheartbeat)
  - [🏗️ Architecture](#️-architecture)
  - [🔧 Development](#-development)
    - [Testing with Swagger UI](#testing-with-swagger-ui)
    - [Testing with curl](#testing-with-curl)
  - [📋 Production Checklist](#-production-checklist)
  - [🆘 Troubleshooting](#-troubleshooting)
    - [Common Issues](#common-issues)
  - [📄 License](#-license)

<!-- /code_chunk_output -->



**Server won't start**
- Check if `AUTH_TOKEN` is set in `.env`
- Verify all dependencies are installed: `npm install`
- Check port 4000 is available

**Authentication errors**
- Verify token format (32 characters recommended)
- Check token is correctly set in headers/query
- Test with Swagger UI authorize button

**Rate limiting issues**
- Check current limits in environment variables
- Use `/health` endpoint to test (no rate limit)
- Wait for rate limit window to reset

**Swagger UI not loading**
- Verify server is running on correct port
- Check browser console for errors
- Try accessing `/docs.json` directly

## 📄 License

MIT License - see LICENSE file for details.

---

**Need help?** Check the interactive documentation at http://localhost:4000/docs or review the examples above. 