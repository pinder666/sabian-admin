// api_server.cjs
// Sabian Military-Grade Backend API Server (Auth-Protected Status Endpoint)
// Author: Jason Wallace

const express = require('express');
const app = express();
const port = 3000;

// CONFIG: Secure Bearer Token Authentication
const AUTH_TOKEN = process.env.SABIAN_API_KEY || 'REPLACE_WITH_SUPER_SECRET_TOKEN';

// Middleware to validate Bearer Token
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${AUTH_TOKEN}`) {
    console.warn(`[UNAUTHORIZED] Attempt from ${req.ip} at ${new Date().toISOString()}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// /status route (protected)
app.get('/status', authenticate, (req, res) => {
  res.json({ online: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
  console.log(`[Sabian API Server] Listening on port ${port}`);
});

// Graceful shutdown handler
process.on('SIGINT', () => {
  console.log('[Sabian API Server] Shutting down gracefully...');
  process.exit(0);
});

// === Military-Grade Compliance ===
// ✅ Auth enforced
// ✅ Logs unauthorized access attempts
// ✅ Returns structured JSON (auditable)
// ✅ Modular, standalone, deployable
// ✅ Inline docs for future engineers
