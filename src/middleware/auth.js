// Simple static token authentication for POC
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'demo-token-32-chars-1234567890ab';

/**
 * Simple authentication middleware using static token
 */
export function authMiddleware(req, res, next) {
  try {
    // Check for token in Authorization header (Bearer format)
    const authHeader = req.headers.authorization;
    let token = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // Also check X-Auth-Token header and query parameter
    if (!token) {
      token = req.headers['x-auth-token'] || req.query.token;
    }

    if (!token) {
      console.warn(`[Auth] No token provided for ${req.method} ${req.path}`);
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Provide a valid authentication token',
        methods: {
          header1: 'Authorization: Bearer <your-token>',
          header2: 'X-Auth-Token: <your-token>',
          query: '?token=<your-token>'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (token !== AUTH_TOKEN) {
      console.warn(`[Auth] Invalid token attempted: ${token.substring(0, 8)}...`);
      return res.status(401).json({
        error: 'Invalid authentication token',
        timestamp: new Date().toISOString()
      });
    }

    // Token is valid
    req.user = { 
      id: 'authenticated-user',
      authenticated: true 
    };
    req.authMethod = 'static-token';
    console.log(`[Auth] Token authentication successful`);
    return next();

  } catch (error) {
    console.error('[Auth] Authentication middleware error:', error);
    return res.status(500).json({
      error: 'Authentication system error',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Generate a random 32-character token for setup
 */
export function generateRandomToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get current configured token info (for debugging)
 */
export function getTokenInfo() {
  return {
    configured: !!process.env.AUTH_TOKEN,
    tokenPrefix: AUTH_TOKEN.substring(0, 8) + '...',
    length: AUTH_TOKEN.length
  };
} 