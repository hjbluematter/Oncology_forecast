'use strict';
const express = require('express');

const requireAuth            = require('../middleware/auth');
const { requireModelAccess } = require('../middleware/permissions');
const { readModels, writeModels, readPermissions, writePermissions } = require('../data/store');

const router = express.Router();
router.use(requireAuth);

// GET /api/models — return only models the caller can access; embed _access field
router.get('/', async (req, res) => {
  const models = readModels();
  if (req.user.globalRole === 'admin') {
    return res.json(models.map((m) => ({ ...m, _access: 'ADMIN' })));
  }
  const allPerms  = await readPermissions();
  const userPerms = allPerms.filter((p) => p.userId === req.user.id);
  const result = models
    .filter((m) => userPerms.some((p) => p.modelId === m.id))
    .map((m) => ({
      ...m,
      _access: userPerms.find((p) => p.modelId === m.id).role,
    }));
  res.json(result);
});

// GET /api/models/:id
router.get('/:id', requireModelAccess('READ'), (req, res) => {
  const model = readModels().find((m) => m.id === req.params.id);
  if (!model) return res.status(404).json({ error: 'Model not found' });
  res.json({ ...model, _access: req.modelRole });
});

// POST /api/models — global admin only
router.post('/', (req, res) => {
  if (req.user.globalRole !== 'admin') {
    return res.status(403).json({ error: 'Only admins can create models' });
  }
  const models = readModels();
  const { _access, ...body } = req.body;
  const newModel = {
    ...body,
    id:        `m${Date.now()}`,
    createdAt: new Date().toISOString().split('T')[0],
    status:    'Active',
  };
  models.unshift(newModel);
  writeModels(models);
  res.status(201).json({ ...newModel, _access: 'ADMIN' });
});

// PATCH /api/models/:id — requires WRITE or higher
router.patch('/:id', requireModelAccess('WRITE'), (req, res) => {
  const models = readModels();
  const idx = models.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Model not found' });
  const { _access, ...patch } = req.body;
  models[idx] = { ...models[idx], ...patch };
  writeModels(models);
  res.json({ ...models[idx], _access: req.modelRole });
});

// DELETE /api/models/:id — requires model-level ADMIN (or global admin)
router.delete('/:id', requireModelAccess('ADMIN'), (req, res) => {
  const models   = readModels();
  const filtered = models.filter((m) => m.id !== req.params.id);
  if (filtered.length === models.length) {
    return res.status(404).json({ error: 'Model not found' });
  }
  writeModels(filtered);
  res.json({ success: true });
});

module.exports = router;
