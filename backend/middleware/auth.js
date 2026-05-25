'use strict';
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Session expired — please log in again'
      : 'Invalid token';
    return res.status(401).json({ error: msg });
  }
};
