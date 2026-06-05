const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');
const logger = require('../config/logger');

/**
 * Verifies the JWT Bearer token in the Authorization header.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const db = await getDb();
    const user = await db.get('SELECT id, email, name, plan FROM users WHERE id = ?', decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.warn(`JWT error: ${err.message}`);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function requirePro(req, res, next) {
  if (!req.user || req.user.plan === 'free') {
    return res.status(403).json({ success: false, message: 'This feature requires a Pro plan' });
  }
  next();
}

function generateTokens(userId) {
  const access = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
  const refresh = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
  return { access, refresh };
}

module.exports = { authenticate, requirePro, generateTokens };