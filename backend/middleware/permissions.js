'use strict';
const { readPermissions } = require('../data/store');

const ROLE_RANK = { READ: 1, WRITE: 2, ADMIN: 3 };

function hasMinRole(userRole, minRole) {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
}

function requireModelAccess(minRole) {
  return async function checkAccess(req, res, next) {
    // Global admins always have full access
    if (req.user.globalRole === 'admin') {
      req.modelRole = 'ADMIN';
      return next();
    }
    try {
      const modelId = req.params.id;
      const perms = await readPermissions();
      const perm = perms.find(
        (p) => p.modelId === modelId && p.userId === req.user.id
      );
      if (!perm) {
        return res.status(403).json({ error: 'You do not have access to this model' });
      }
      if (!hasMinRole(perm.role, minRole)) {
        return res.status(403).json({
          error: `This action requires ${minRole} access or higher`,
        });
      }
      req.modelRole = perm.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireModelAccess, hasMinRole, ROLE_RANK };
