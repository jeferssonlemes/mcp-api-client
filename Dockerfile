# Multi-stage Docker build for MCP API Client
FROM node:20-alpine AS base

# Install necessary packages for NPX and MCP servers
RUN apk add --no-cache \
    curl \
    git \
    python3 \
    make \
    g++ \
    && npm install -g npm@latest

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci && npm cache clean --force
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# Production stage  
FROM base AS production
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 -G nodejs

# Change ownership to nodejs user
RUN chown -R mcp:nodejs /app
USER mcp

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4000/health || exit 1

CMD ["npm", "start"] 