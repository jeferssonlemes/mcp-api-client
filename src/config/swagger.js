import swaggerJSDoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'MCP API Client',
    version: '2.3.0',
    description: 'A robust Node.js service for managing multiple MCP (Model Context Protocol) servers with multi-session support, simple token authentication, and comprehensive rate limiting.',
    contact: {
      name: 'API Support',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Development server',
    },
    {
      url: 'https://your-production-domain.com',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Static token authentication using Authorization header',
      },
      TokenHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Auth-Token',
        description: 'Static token authentication using custom header',
      },
      TokenQuery: {
        type: 'apiKey',
        in: 'query',
        name: 'token',
        description: 'Static token authentication using query parameter',
      },
    },
    schemas: {
      MCPServer: {
        type: 'object',
        properties: {
          clientId: {
            type: 'string',
            description: 'Unique client identifier',
            example: 'client-github',
          },
          MCPServerName: {
            type: 'string',
            description: 'MCP server name/identifier',
            example: 'github',
          },
          uniqueKey: {
            type: 'string',
            description: 'Unique key combining clientId and MCPServerName',
            example: 'client-github:github',
          },
          pid: {
            type: 'integer',
            description: 'Process ID',
            example: 12345,
          },
          lastHit: {
            type: 'string',
            format: 'date-time',
            description: 'Last access timestamp',
          },
          ttlMinutes: {
            type: 'integer',
            description: 'Time to live in minutes',
            example: 15,
          },
          command: {
            type: 'string',
            description: 'Command used to start the server',
            example: 'npx -y @smithery/cli@latest run @smithery-ai/github',
          },
        },
      },
      MCPConfig: {
        type: 'object',
        required: ['command', 'args'],
        properties: {
          command: {
            type: 'string',
            description: 'Command to execute',
            example: 'npx',
          },
          args: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Command arguments',
            example: ['-y', '@smithery/cli@latest', 'run', '@smithery-ai/github', '--key', 'YOUR_API_KEY'],
          },
          env: {
            type: 'object',
            description: 'Environment variables',
            additionalProperties: {
              type: 'string',
            },
            example: {
              'GITHUB_TOKEN': 'your-token-here',
              'NODE_ENV': 'development',
            },
          },
        },
      },
      StartRequest: {
        type: 'object',
        required: ['clientId', 'MCPServerName', 'config'],
        properties: {
          clientId: {
            type: 'string',
            description: 'Unique client identifier',
            example: 'client-github',
          },
          MCPServerName: {
            type: 'string',
            description: 'MCP server name/identifier',
            example: 'github',
          },
          config: {
            $ref: '#/components/schemas/MCPConfig',
          },
          ttlMinutes: {
            type: 'integer',
            description: 'Time to live in minutes (optional, defaults to 15)',
            example: 20,
            default: 15,
          },
        },
      },
      RunRequest: {
        type: 'object',
        required: ['clientId', 'MCPServerName'],
        properties: {
          clientId: {
            type: 'string',
            description: 'Unique client identifier',
            example: 'client-github',
          },
          MCPServerName: {
            type: 'string',
            description: 'MCP server name/identifier',
            example: 'github',
          },
          tool: {
            type: 'string',
            description: 'Tool name to execute',
            example: 'search_repositories',
          },
          arguments: {
            type: 'object',
            description: 'Tool arguments',
            additionalProperties: true,
            example: {
              query: 'typescript stars:>1000',
            },
          },
          input: {
            type: 'string',
            description: 'Raw input to send to MCP server (alternative to tool)',
            example: '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}',
          },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          ok: {
            type: 'boolean',
            example: true,
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error message',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          details: {
            type: 'string',
            description: 'Additional error details',
          },
        },
      },
      AuthErrorResponse: {
        allOf: [
          { $ref: '#/components/schemas/ErrorResponse' },
          {
            type: 'object',
            properties: {
              methods: {
                type: 'object',
                properties: {
                  header1: {
                    type: 'string',
                    example: 'Authorization: Bearer <your-token>',
                  },
                  header2: {
                    type: 'string',
                    example: 'X-Auth-Token: <your-token>',
                  },
                  query: {
                    type: 'string',
                    example: '?token=<your-token>',
                  },
                },
              },
            },
          },
        ],
      },
      RateLimitResponse: {
        allOf: [
          { $ref: '#/components/schemas/ErrorResponse' },
          {
            type: 'object',
            properties: {
              limit: {
                type: 'integer',
                description: 'Rate limit maximum',
                example: 100,
              },
              windowMs: {
                type: 'integer',
                description: 'Rate limit window in milliseconds',
                example: 900000,
              },
              retryAfter: {
                type: 'integer',
                description: 'Seconds to wait before retry',
                example: 123,
              },
            },
          },
        ],
      },
    },
  },
  security: [
    {
      BearerAuth: [],
    },
    {
      TokenHeader: [],
    },
    {
      TokenQuery: [],
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: ['./src/api.js', './src/config/routes.js'], // paths to files containing OpenAPI definitions
};

export const swaggerSpec = swaggerJSDoc(options); 