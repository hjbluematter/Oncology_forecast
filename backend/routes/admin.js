'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');

const requireAuth = require('../middleware/auth');
const {
  readUsers, writeUsers,
  readPermissions, writePermissions,
} = require('../data/store');
const { SALT_ROUNDS } = require('../config');

const router = express.Router();
router.use(requireAuth);

function safeUser(u) {
  return { id: u.id, email: u.email, name: u.name, globalRole: u.globalRole };
}

function mustBeGlobalAdmin(req, res) {
  if (req.user.globalRole !== 'admin') {
    res.status(403).json({ error: 'Global admin access required' });
    return false;
  }
  return true;
}

async function canManageModel(req, res, modelId) {
  if (req.user.globalRole === 'admin') return true;
  const perms = await readPermissions();
  const perm = perms.find(
    (p) => p.modelId === modelId && p.userId === req.user.id && p.role === 'ADMIN'
  );
  if (!perm) {
    res.status(403).json({ error: 'Model admin access required' });
    return false;
  }
  return true;
}

// ── User Management (global admin only) ───────────────────────────────────────

// GET /api/admin/users
router.get('/users', async (req, res) => {
  if (!mustBeGlobalAdmin(req, res)) return;
  const users = await readUsers();
  res.json(users.map(safeUser));
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  if (!mustBeGlobalAdmin(req, res)) return;
  const { email, name, password, globalRole } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name and password are required' });
  }
  const users = await readUsers();
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase().trim())) {
    return res.status(409).json({ error: 'Email already in use' });
  }
  const newUser = {
    id:           `u${Date.now()}`,
    email:        email.toLowerCase().trim(),
    name:         name.trim(),
    globalRole:   globalRole === 'admin' ? 'admin' : 'user',
    passwordHash: await bcrypt.hash(String(password), SALT_ROUNDS),
    createdAt:    new Date().toISOString().split('T')[0],
  };
  users.push(newUser);
  await writeUsers(users);
  res.status(201).json(safeUser(newUser));
});

// PATCH /api/admin/users/:userId
router.patch('/users/:userId', async (req, res) => {
  if (!mustBeGlobalAdmin(req, res)) return;
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === req.params.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  const { name, globalRole, password } = req.body || {};
  if (name)       users[idx].name = name.trim();
  if (globalRole && ['admin', 'user'].includes(globalRole)) {
    users[idx].globalRole = globalRole;
  }
  if (password)   users[idx].passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);
  await writeUsers(users);
  res.json(safeUser(users[idx]));
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', async (req, res) => {
  if (!mustBeGlobalAdmin(req, res)) return;
  if (req.params.userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const users = await readUsers();
  await writeUsers(users.filter((u) => u.id !== req.params.userId));
  const perms = await readPermissions();
  await writePermissions(perms.filter((p) => p.userId !== req.params.userId));
  res.json({ success: true });
});

// ── Permission Management ──────────────────────────────────────────────────────

// GET /api/admin/permissions — ALL permissions across all models (global admin only)
router.get('/permissions', async (req, res) => {
  if (!mustBeGlobalAdmin(req, res)) return;
  const users = await readUsers();
  const permissions = (await readPermissions()).map((p) => {
    const u = users.find((x) => x.id === p.userId);
    return { ...p, user: u ? safeUser(u) : { id: p.userId, email: '?', name: '?', globalRole: 'user' } };
  });
  res.json(permissions);
});

// GET /api/admin/permissions/:modelId — enriched list with user info
router.get('/permissions/:modelId', async (req, res) => {
  if (!await canManageModel(req, res, req.params.modelId)) return;
  const users = await readUsers();
  const permissions = (await readPermissions())
    .filter((p) => p.modelId === req.params.modelId)
    .map((p) => {
      const u = users.find((x) => x.id === p.userId);
      return {
        ...p,
        user: u ? safeUser(u) : { id: p.userId, email: '?', name: '?', globalRole: 'user' },
      };
    });
  res.json(permissions);
});

// PUT /api/admin/permissions/:modelId — upsert a user's role on a model
router.put('/permissions/:modelId', async (req, res) => {
  if (!await canManageModel(req, res, req.params.modelId)) return;
  const { userId, role } = req.body || {};
  if (!userId || !['READ', 'WRITE', 'ADMIN'].includes(role)) {
    return res.status(400).json({ error: 'userId and role (READ|WRITE|ADMIN) are required' });
  }
  const permissions = await readPermissions();
  const idx = permissions.findIndex(
    (p) => p.modelId === req.params.modelId && p.userId === userId
  );
  if (idx >= 0) {
    permissions[idx].role = role;
  } else {
    permissions.push({ id: `perm${Date.now()}`, modelId: req.params.modelId, userId, role });
  }
  await writePermissions(permissions);
  res.json({ success: true });
});

// DELETE /api/admin/permissions/:modelId/users/:userId
router.delete('/permissions/:modelId/users/:userId', async (req, res) => {
  if (!await canManageModel(req, res, req.params.modelId)) return;
  const perms = await readPermissions();
  await writePermissions(
    perms.filter(
      (p) => !(p.modelId === req.params.modelId && p.userId === req.params.userId)
    )
  );
  res.json({ success: true });
});

module.exports = router;
