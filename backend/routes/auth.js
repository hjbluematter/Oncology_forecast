'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const requireAuth               = require('../middleware/auth');
const { readUsers }             = require('../data/store');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');

const router = express.Router();

function safeUser(u) {
  return { id: u.id, email: u.email, name: u.name, globalRole: u.globalRole };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const users = await readUsers();
  const user  = users.find(
    (u) => u.email.toLowerCase() === String(email).toLowerCase().trim()
  );
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(String(password), user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const payload = safeUser(user);
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: payload });
});

// GET /api/auth/me — validate stored token and refresh user data
router.get('/me', requireAuth, async (req, res) => {
  const users = await readUsers();
  const user  = users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(safeUser(user));
});

module.exports = router;
