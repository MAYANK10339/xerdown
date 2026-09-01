const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'xerdown_super_secure_jwt_fallback_secret_key_2026_x89q2';

function authMiddleware(req, res, next) {
  const token = req.cookies.xerdown_token;

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
