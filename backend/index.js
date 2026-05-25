require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { connect, getStatus, getDb } = require("./db/mongodb");

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, "data", "models.json");

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ─── Local storage helpers ────────────────────────────────────────────────────

function readModels() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeModels(models) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(models, null, 2), "utf-8");
}

// ─── Local CRUD endpoints (unchanged) ────────────────────────────────────────

app.get("/api/models", (req, res) => {
  res.json(readModels());
});

app.get("/api/models/:id", (req, res) => {
  const models = readModels();
  const model = models.find((m) => m.id === req.params.id);
  if (!model) return res.status(404).json({ error: "Model not found" });
  res.json(model);
});

app.post("/api/models", (req, res) => {
  const models = readModels();
  const newModel = {
    ...req.body,
    id: `m${Date.now()}`,
    createdAt: new Date().toISOString().split("T")[0],
    status: "Active",
  };
  models.unshift(newModel);
  writeModels(models);
  res.status(201).json(newModel);
});

app.patch("/api/models/:id", (req, res) => {
  const models = readModels();
  const idx = models.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Model not found" });
  models[idx] = { ...models[idx], ...req.body };
  writeModels(models);
  res.json(models[idx]);
});

app.delete("/api/models/:id", (req, res) => {
  const models = readModels();
  const filtered = models.filter((m) => m.id !== req.params.id);
  if (filtered.length === models.length)
    return res.status(404).json({ error: "Model not found" });
  writeModels(filtered);
  res.json({ success: true });
});

// ─── Cloud status ─────────────────────────────────────────────────────────────

app.get("/api/cloud/status", (req, res) => {
  res.json(getStatus());
});

// ─── Save one model to cloud ──────────────────────────────────────────────────
// Called when user clicks "Save to Cloud" for the active model.
// Payload: { model, forecastResults? }
// Uses upsert on model.id so re-saves overwrite rather than duplicate.

app.post("/api/cloud/save/:id", async (req, res) => {
  const db = getDb();
  if (!db) {
    const { state, error } = getStatus();
    if (state !== "connected") {
      // Try connecting once more in case it wasn't attempted yet
      await connect();
    }
    const db2 = getDb();
    if (!db2) {
      return res.status(503).json({ error: getStatus().error || "Cloud not connected" });
    }
  }

  try {
    const activeDb = getDb();
    const { model, forecastResults } = req.body;
    if (!model) return res.status(400).json({ error: "model is required" });

    const doc = {
      ...model,
      _localId: model.id,
      cloudSavedAt: new Date().toISOString(),
      ...(forecastResults ? { forecastResults } : {}),
    };

    await activeDb.collection("models").replaceOne(
      { _localId: model.id },
      doc,
      { upsert: true }
    );

    res.json({ success: true, cloudSavedAt: doc.cloudSavedAt });
  } catch (err) {
    console.error("Cloud save error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Migrate all local models to cloud (one-time or re-sync) ─────────────────

app.post("/api/cloud/migrate", async (req, res) => {
  await connect();
  const db = getDb();
  if (!db) {
    return res.status(503).json({ error: getStatus().error || "Cloud not connected" });
  }

  try {
    const models = readModels();
    if (models.length === 0) return res.json({ uploaded: 0 });

    const ops = models.map(model => ({
      replaceOne: {
        filter: { _localId: model.id },
        replacement: {
          ...model,
          _localId: model.id,
          cloudSavedAt: new Date().toISOString(),
        },
        upsert: true,
      },
    }));

    const result = await db.collection("models").bulkWrite(ops);
    res.json({
      uploaded: models.length,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
    });
  } catch (err) {
    console.error("Migration error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── List all cloud-saved models (metadata only) ──────────────────────────────

app.get("/api/cloud/models", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: getStatus().error || "Cloud not connected" });

  try {
    const docs = await db
      .collection("models")
      .find({}, { projection: { _id: 1, _localId: 1, assetName: 1, indication: 1, cloudSavedAt: 1, status: 1 } })
      .toArray();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`OncoCast API running at http://localhost:${PORT}`);
  console.log(`Models stored at: ${DATA_FILE}`);
  // Attempt cloud connection on startup (non-blocking — local still works if it fails)
  connect().catch(() => {});
});
