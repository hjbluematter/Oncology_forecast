'use strict';
const fs   = require('fs');
const path = require('path');
const { getDb } = require('../db/mongodb');

const DIR = __dirname;

// ─── Local JSON helpers ────────────────────────────────────────────────────────

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf-8'));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(path.join(DIR, file), JSON.stringify(data, null, 2), 'utf-8');
}

// Models keep local JSON storage (they have their own /api/cloud/ sync)
const readModels  = () => readJSON('models.json');
const writeModels = (d) => writeJSON('models.json', d);

// ─── Users — MongoDB-backed, JSON fallback ────────────────────────────────────

async function readUsers() {
  const db = getDb();
  if (!db) return readJSON('users.json');
  return db.collection('users').find({}, { projection: { _id: 0 } }).toArray();
}

async function writeUsers(users) {
  const db = getDb();
  if (!db) { writeJSON('users.json', users); return; }
  const col = db.collection('users');
  if (users.length === 0) { await col.deleteMany({}); return; }
  const ops = users.map(u => ({
    replaceOne: { filter: { id: u.id }, replacement: u, upsert: true },
  }));
  await col.bulkWrite(ops);
  await col.deleteMany({ id: { $nin: users.map(u => u.id) } });
}

// ─── Permissions — MongoDB-backed, JSON fallback ───────────────────────────────

async function readPermissions() {
  const db = getDb();
  if (!db) return readJSON('permissions.json');
  return db.collection('permissions').find({}, { projection: { _id: 0 } }).toArray();
}

async function writePermissions(permissions) {
  const db = getDb();
  if (!db) { writeJSON('permissions.json', permissions); return; }
  const col = db.collection('permissions');
  await col.deleteMany({});
  if (permissions.length > 0) await col.insertMany(permissions);
}

// ─── One-time migration: copy local JSON → MongoDB if collections empty ────────

async function migrateLocalToMongo() {
  const db = getDb();
  if (!db) return;

  const mongoUserCount = await db.collection('users').countDocuments();
  if (mongoUserCount === 0) {
    const localUsers = readJSON('users.json');
    if (localUsers.length > 0) {
      await db.collection('users').insertMany(localUsers);
      console.log(`✓ Migrated ${localUsers.length} users to MongoDB`);
    }
  }

  const mongoPermCount = await db.collection('permissions').countDocuments();
  if (mongoPermCount === 0) {
    const localPerms = readJSON('permissions.json');
    if (localPerms.length > 0) {
      await db.collection('permissions').insertMany(localPerms);
      console.log(`✓ Migrated ${localPerms.length} permissions to MongoDB`);
    }
  }
}

module.exports = {
  readModels, writeModels,
  readUsers, writeUsers,
  readPermissions, writePermissions,
  migrateLocalToMongo,
};
