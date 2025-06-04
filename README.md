# MCP API Client v2.3

A robust Node.js service for managing multiple MCP (Model Context Protocol) servers with multi-session support, automatic timeout control, connection reuse, advanced health monitoring, **simple token authentication**, and **comprehensive rate limiting**.

## Features

- 🔄 **Multi-session**: Each `clientId` maintains its own MCP server instance
- ⏱️ **Automatic timeout**: Inactive processes are terminated automatically  
- 🔁 **Connection reuse**: Same configuration reuses existing process
- 📊 **Health monitoring**: Comprehensive health checks and process monitoring
- 🛡️ **Security validations**: Protection against disconnections and zombie processes
- 🎯 **MCP protocol compliance**: Proper initialize → initialized → tools flow
- 🔧 **Cross-platform**: Windows (cmd) and Unix support
- 📡 **RESTful API**: Simple HTTP interface for MCP interactions
- 🔐 **Authentication**: Simple static token authentication
- 🚦 **Rate Limiting**: Configurable rate limits with DDoS protection
- ⚡ **Smart throttling**: Progressive slow-down for burst protection
- 🔒 **Security headers**: CORS, CSP, HSTS, and other security measures

## Installation

```bash
npm install
```

## Configuration

### Environment Variables

Create a `.env` file based on `env.example`:

```bash
cp env.example .env
```

**Essential configuration:**
```env
# Change this in production!
AUTH_TOKEN=your-secure-32-character-token-here

# Optional rate limiting configuration
RATE_LIMIT_MAX=100              # 100 requests per 15 minutes
SLOW_DOWN_DELAY_AFTER=50        # Start slowing down after 50 requests/minute
```

### Generate Secure Token

Generate a random 32-character token:

```bash
node -e "console.log(Array.from({length:32}, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random()*62)]).join(''))"
```

Example output: `L3Fv2grFnC1jxmznbPxIGmnDVwRCy6Vs`

## Usage

### Start the server

```bash
npm start
# or for development
npm run dev
```

Server will be available at `http://localhost:4000`

## Authentication

All API endpoints (except `/health` and `/`) require authentication using a static token. The token can be provided in **3 different ways**:

### Method 1: Authorization Header (Recommended)

```bash
curl -H "Authorization: Bearer your-token-here" http://localhost:4000/api/status
```

### Method 2: Custom Header

```bash
curl -H "X-Auth-Token: your-token-here" http://localhost:4000/api/status
```

### Method 3: Query Parameter

```bash
curl "http://localhost:4000/api/status?token=your-token-here"
```

## Rate Limiting

The API implements multiple layers of protection:

- **Standard rate limit**: 100 requests per 15 minutes per IP/user
- **Slow down**: Adds delay after 50 requests per minute
- **Strict limiting**: 20 requests per 5 minutes for `/api/run` endpoint
- **Auth rate limit**: 10 authentication attempts per minute

Rate limit headers are included in responses:
```
RateLimit-Limit: 100
RateLimit-Remaining: 95  
RateLimit-Reset: 1640995200
```

## API Endpoints

### 1. POST /api/start
Starts or checks the status of an MCP server with automatic initialization.

**Authentication**: Required

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
  "user": "authenticated-user",
  "authMethod": "static-token",
  "message": "MCP Server 'github' started successfully. MCP initialization in progress..."
}
```

### 2. GET /api/health?clientId=xxx&MCPServerName=yyy
Performs comprehensive health check of an MCP server.

**Authentication**: Required

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

### 3. GET /api/details?clientId=xxx&MCPServerName=yyy
Returns MCP server information (available tools, etc.).

**Authentication**: Required

### 4. POST /api/run
Executes a tool on the MCP server.

**Authentication**: Required  
**Rate Limit**: Strict (20 requests per 5 minutes)

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

### 5. GET /api/list?clientId=xxx
Lists all MCP servers for a specific client.

**Authentication**: Required

### 6. GET /api/status
Lists all active MCP processes (for monitoring).

**Authentication**: Required

### 7. DELETE /api/kill?clientId=xxx&MCPServerName=yyy
Forces termination of a specific process (for debugging).

**Authentication**: Required

### 8. GET /health (Public)
Health check endpoint - no authentication required.

### 9. GET / (Public)
API documentation endpoint - no authentication required.

## Error Handling

### HTTP Status Codes

- **400 Bad Request**: Missing parameters or invalid input
- **401 Unauthorized**: Authentication required or invalid token
- **404 Not Found**: MCP server not found
- **410 Gone**: Process was killed
- **413 Payload Too Large**: Request body too large (>10MB)
- **429 Too Many Requests**: Rate limit exceeded
- **503 Service Unavailable**: Server unhealthy
- **500 Internal Server Error**: Execution errors

### Authentication Errors

**No authentication provided**:
```json
{
  "error": "Authentication required",
  "message": "Provide a valid authentication token",
  "methods": {
    "header1": "Authorization: Bearer <your-token>",
    "header2": "X-Auth-Token: <your-token>",
    "query": "?token=<your-token>"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Invalid token**:
```json
{
  "error": "Invalid authentication token",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Rate limit exceeded**:
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later.",
  "limit": 100,
  "windowMs": 900000,
  "retryAfter": 123,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Usage Examples with Authentication

### 1. Start GitHub MCP Server

```bash
curl -X POST http://localhost:4000/api/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer L3Fv2grFnC1jxmznbPxIGmnDVwRCy6Vs" \
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
curl -H "Authorization: Bearer L3Fv2grFnC1jxmznbPxIGmnDVwRCy6Vs" \
  "http://localhost:4000/api/health?clientId=client-github&MCPServerName=github"
```

### 3. Execute SQL query

```bash
curl -X POST http://localhost:4000/api/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer L3Fv2grFnC1jxmznbPxIGmnDVwRCy6Vs" \
  -d '{
    "clientId": "client-mysql",
    "MCPServerName": "mysql",
    "tool": "run_sql_query",
    "arguments": {
      "query": "SELECT NOW() as current_time, 1 as test_value"
    }
  }'
```

### 4. Using different authentication methods

```bash
# Method 1: Authorization header
curl -H "Authorization: Bearer L3Fv2grFnC1jxmznbPxIGmnDVwRCy6Vs" \
  http://localhost:4000/api/status

# Method 2: Custom header
curl -H "X-Auth-Token: L3Fv2grFnC1jxmznbPxIGmnDVwRCy6Vs" \
  http://localhost:4000/api/status

# Method 3: Query parameter
curl "http://localhost:4000/api/status?token=L3Fv2grFnC1jxmznbPxIGmnDVwRCy6Vs"
```

## Security Features

### Authentication
- ✅ **Static token authentication**: Simple and effective for POCs
- ✅ **Multiple methods**: Header and query parameter support
- ✅ **32-character tokens**: Strong enough for most use cases
- ✅ **Flexible usage**: 3 different ways to provide the token

### Rate Limiting
- ✅ **IP-based limiting**: Prevents abuse from single sources
- ✅ **User-based limiting**: Granular control for authenticated users
- ✅ **Progressive throttling**: Gradual slowdown before hard limits
- ✅ **Endpoint-specific limits**: Stricter limits for sensitive operations

### Security Headers
- ✅ **CORS configuration**: Configurable cross-origin policies
- ✅ **Content Security Policy**: Prevents XSS attacks
- ✅ **HSTS headers**: Forces HTTPS in production
- ✅ **Frame protection**: Prevents clickjacking
- ✅ **Content type validation**: Prevents MIME sniffing attacks

### Process Security
- ✅ **Environment isolation**: Secure environment variable handling
- ✅ **Process monitoring**: Zombie process detection
- ✅ **Resource limits**: Request size and timeout controls
- ✅ **Input validation**: Comprehensive parameter validation

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Client A      │────│  Auth Layer  │────│ Rate Limiter    │
│   (Token Auth)  │    │ (Static Token│    │ (IP+User based) │
└─────────────────┘    └──────────────┘    └─────────────────┘
                                                    │
                       ┌──────────────┐    ┌─────────────────┐
                       │  MCP Manager │────│ MCP Server A    │
                       │              │    │ (GitHub)        │
┌─────────────────┐    │              │    └─────────────────┘
│   Client B      │────│              │    
│   (Token Auth)  │    │              │    ┌─────────────────┐
└─────────────────┘    │              │────│ MCP Server B    │
                       └──────────────┘    │ (MySQL)         │
                                           └─────────────────┘
```

### Components

- **Authentication Layer**: Static token validation
- **Rate Limiting Layer**: Multi-tier protection against abuse
- **MCP Manager**: Manages MCP process lifecycle and protocol compliance
- **API Router**: Exposes RESTful endpoints with proper middleware
- **Process Registry**: Maintains clientId:MCPServerName → process mapping
- **Health Monitor**: Continuous process health verification

## Development

### Project Structure

```
src/
├── index.js                 # Server bootstrap with auth/rate limiting
├── api.js                   # REST API routes
├── mcpManager.js            # MCP process manager
├── config/
│   ├── routes.js           # Centralized routing configuration
│   └── middleware.js       # Middleware configuration
└── middleware/
    ├── auth.js             # Static token authentication
    └── rateLimit.js        # Rate limiting and security
```

### Security Configuration

**Development**:
- Demo token enabled
- Detailed error messages
- CORS enabled for localhost

**Production**:
- Change `AUTH_TOKEN` to secure value
- Configure `ALLOWED_ORIGINS`
- Enable security headers
- Set `NODE_ENV=production`

## Changelog

### v2.3 - Simplified Authentication & Rate Limiting
- ✅ **Simplified authentication**: Removed JWT complexity, now uses static tokens
- ✅ **Multiple auth methods**: Authorization header, custom header, query parameter
- ✅ **Comprehensive rate limiting**: Multi-tier protection
- ✅ **Progressive request throttling**: Gradual slowdown
- ✅ **Centralized routing**: Better middleware configuration
- ✅ **Enhanced security headers**: CORS, CSP, HSTS
- ✅ **Environment-based configuration**: All settings configurable via env vars
- ✅ **POC-ready**: Perfect for prototypes and demos

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

## Production Deployment

### Environment Variables Checklist

```env
# ✅ Required for production
AUTH_TOKEN=your-secure-32-character-token-here
NODE_ENV=production

# ✅ Recommended for production
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
TRUSTED_IPS=10.0.0.1,192.168.1.100
RATE_LIMIT_MAX=50                # Lower for production
```

### Security Checklist

- [ ] Generate secure `AUTH_TOKEN` (32 characters)
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Set up `TRUSTED_IPS` if using IP whitelist
- [ ] Enable HTTPS with reverse proxy
- [ ] Configure proper security headers
- [ ] Set up monitoring and alerting
- [ ] Regular security updates

### Quick Setup for Production

1. **Generate secure token**:
   ```bash
   node -e "console.log(Array.from({length:32}, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random()*62)]).join(''))"
   ```

2. **Create .env file**:
   ```env
   AUTH_TOKEN=YourGeneratedTokenHere123456789
   NODE_ENV=production
   ALLOWED_ORIGINS=https://yourdomain.com
   ```

3. **Start server**:
   ```bash
   npm start
   ```

## Roadmap

- [ ] ~~Simple authentication~~ ✅ **Completed in v2.3**
- [ ] ~~Rate limiting per client~~ ✅ **Completed in v2.3**
- [ ] Redis persistence for clusters
- [ ] Prometheus metrics
- [ ] WebSocket streaming for long responses
- [ ] Web monitoring interface
- [ ] Docker containerization
- [ ] Kubernetes deployment manifests
- [ ] OAuth2/OIDC integration (if needed)
- [ ] API usage analytics 