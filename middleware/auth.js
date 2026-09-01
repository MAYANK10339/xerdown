const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'xerdown_super_secure_jwt_fallback_secret_key_2026_x89q2';

function authMiddleware(req, res, next) {
  // Support both Cookie and Authorization header (Dual-Layer Auth)
  let token = req.cookies ? req.cookies.xerdown_token : null;

  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      email: decoded.email
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
  }
}

module.exports = authMiddleware;
