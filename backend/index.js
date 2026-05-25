require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { fetchEpiData, parseScenarioIntent, classifyIntent, answerGeneral } = require("./gemini");
const { connect, getStatus, getDb } = require("./db/mongodb");

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, "data", "models.json");

app.use(cors());
app.use(express.json({ limit: "10mb" }));

function readModels() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeModels(models) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(models, null, 2), "utf-8");
}

// GET all models
app.get("/api/models", (req, res) => {
  res.json(readModels());
});

// GET single model
app.get("/api/models/:id", (req, res) => {
  const models = readModels();
  const model = models.find((m) => m.id === req.params.id);
  if (!model) return res.status(404).json({ error: "Model not found" });
  res.json(model);
});

// POST create model
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

// PATCH update model
app.patch("/api/models/:id", (req, res) => {
  const models = readModels();
  const idx = models.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Model not found" });
  models[idx] = { ...models[idx], ...req.body };
  writeModels(models);
  res.json(models[idx]);
});

// DELETE model
app.delete("/api/models/:id", (req, res) => {
  const models = readModels();
  const filtered = models.filter((m) => m.id !== req.params.id);
  if (filtered.length === models.length)
    return res.status(404).json({ error: "Model not found" });
  writeModels(filtered);
  res.json({ success: true });
});

// ─── Cloud routes ─────────────────────────────────────────────────────────────

app.get("/api/cloud/status", (req, res) => {
  res.json(getStatus());
});

// ─── Import one model from cloud into local storage ───────────────────────────

app.post("/api/cloud/import/:id", async (req, res) => {
  try {
    const db = await connect();
    if (!db) return res.status(503).json({ error: getStatus().error || "Cloud not connected" });

    const collection = db.collection("models");
    // Try finding by local id field first, then MongoDB _id
    const doc = await collection.findOne({ id: req.params.id })
      || await collection.findOne({ _localId: req.params.id });

    if (!doc) return res.status(404).json({ error: "Model not found in cloud" });

    // Strip MongoDB-internal fields
    const { _id, _localId, cloudSavedAt, ...modelData } = doc;

    const models = readModels();
    const existingIdx = models.findIndex(m => m.id === modelData.id);

    if (existingIdx !== -1) {
      // Already exists locally — overwrite with cloud version
      models[existingIdx] = { ...modelData, cloudSavedAt };
      writeModels(models);
      return res.json({ action: "updated", model: models[existingIdx] });
    } else {
      // New to this machine — prepend
      const newModel = { ...modelData, cloudSavedAt };
      models.unshift(newModel);
      writeModels(models);
      return res.json({ action: "imported", model: newModel });
    }
  } catch (err) {
    console.error("Cloud import error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/cloud/save/:id", async (req, res) => {
  try {
    const models = readModels();
    const model = models.find((m) => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: "Model not found" });
    // Save to cloud (MongoDB) — use the connect helper
    const db = await connect();
    const collection = db.collection("models");
    await collection.replaceOne({ id: model.id }, model, { upsert: true });
    res.json({ success: true, savedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/cloud/migrate", async (req, res) => {
  try {
    const models = readModels();
    const db = await connect();
    const collection = db.collection("models");
    for (const model of models) {
      await collection.replaceOne({ id: model.id }, model, { upsert: true });
    }
    res.json({ success: true, count: models.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cloud/models", async (req, res) => {
  try {
    const db = await connect();
    const collection = db.collection("models");
    const models = await collection.find({}).toArray();
    res.json(models);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI chat endpoint ─────────────────────────────────────────────────────────

app.post("/api/ai/chat", async (req, res) => {
  const { message, model, activeTab } = req.body;
  if (!message || !model) return res.status(400).json({ error: "message and model are required" });

  const intent = await classifyIntent(message, activeTab);

  if (intent === "blocked_scenario") {
    return res.json({ intent: "general", text: "Scenario runner is available on the **Scenarios** tab — switch there to run it." });
  }
  if (intent === "blocked_epi") {
    return res.json({ intent: "general", text: "Epi & funnel data search is available on the **Assumptions** tab — switch there to pull data." });
  }

  if (intent === "epi_search") {
    const result = await fetchEpiData(model);
    if (!result.ok) return res.status(500).json({ error: result.error });
    return res.json({ intent: "epi_search", payload: result.data });
  }

  if (intent === "scenario") {
    const result = await parseScenarioIntent(message, model);
    if (!result.ok) return res.status(500).json({ error: result.error });

    // Apply delta to model assumptions and build scenario snapshot
    const scenarioData = applyScenarioDelta(model, result.data);
    return res.json({ intent: "scenario", parsed: result.data, scenarioData });
  }

  // General question
  const result = await answerGeneral(message, model);
  if (!result.ok) return res.status(500).json({ error: result.error });
  return res.json({ intent: "general", text: result.text });
});

// ─── Scenario persistence (array-based — ScenarioManager uses model.scenarios[]) ──

// POST /api/models/:id/scenarios — append a new scenario to the array
app.post("/api/models/:id/scenarios", (req, res) => {
  const models = readModels();
  const idx = models.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Model not found" });

  const scenario = {
    id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toLocaleDateString(),
    savedAt: new Date().toISOString(),
    ...req.body,
  };

  // Support both legacy object shape and new array shape
  const existing = models[idx].scenarios;
  const existingArr = Array.isArray(existing)
    ? existing
    : (existing ? Object.values(existing) : []);

  models[idx] = { ...models[idx], scenarios: [...existingArr, scenario] };
  writeModels(models);
  res.status(201).json(models[idx]);
});

// DELETE /api/models/:id/scenarios/:scenarioId — remove by id
app.delete("/api/models/:id/scenarios/:scenarioId", (req, res) => {
  const models = readModels();
  const idx = models.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Model not found" });

  const existing = models[idx].scenarios;
  const existingArr = Array.isArray(existing)
    ? existing
    : (existing ? Object.values(existing) : []);

  models[idx] = {
    ...models[idx],
    scenarios: existingArr.filter(s => s.id !== req.params.scenarioId && s.name !== req.params.scenarioId),
  };
  writeModels(models);
  res.json(models[idx]);
});

// ─── Delta application logic (no revenue calc — just modified assumption snapshot) ───

function applyScenarioDelta(model, parsed) {
  const startYear = model.startYear || 2025;
  const n = model.timelineYears || 5;
  const years = Array.from({ length: n }, (_, i) => String(startYear + i));

  function getAllComboKeys() {
    const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
    const lots = model.linesOfTherapy || 1;
    const segs = model.segments || 1;
    const keys = [];
    for (let g = 0; g < geos.length; g++)
      for (let l = 0; l < lots; l++)
        for (let s = 0; s < segs; s++)
          keys.push(`${g}-${l}-${s}-0`);
    return keys;
  }

  const snapshotAssumptions = {};

  for (const change of parsed.changes || []) {
    const { assumptionType, funnelCutId, comboKeys, deltaPercent, direction, applyToYears } = change;
    const factor = direction === "down" ? 1 - deltaPercent / 100 : 1 + deltaPercent / 100;
    const targetKeys = comboKeys === "all" ? getAllComboKeys() : (Array.isArray(comboKeys) ? comboKeys : [comboKeys]);
    const targetYears = applyToYears === "all" || !applyToYears ? years : years.filter((y) => applyToYears.includes(parseInt(y)));

    if (assumptionType === "epi") {
      const base = model.epiAssumptions?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));
      for (const ck of targetKeys) {
        if (!modified[ck]) continue;
        for (const yr of targetYears) {
          const v = parseFloat(modified[ck].input?.[yr]);
          if (!isNaN(v)) modified[ck].input[yr] = Math.round(v * factor);
          const cv = parseFloat(modified[ck].computed?.[yr]);
          if (!isNaN(cv)) modified[ck].computed[yr] = Math.round(cv * factor);
        }
      }
      snapshotAssumptions.epiAssumptions = { ...model.epiAssumptions, combos: modified };
    }

    if (assumptionType === "funnelCut" && funnelCutId) {
      const base = model.funnelCutValues?.[funnelCutId]?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));
      for (const ck of targetKeys) {
        if (!modified[ck]) continue;
        for (const yr of targetYears) {
          const v = parseFloat(modified[ck].input?.[yr]);
          if (!isNaN(v)) modified[ck].input[yr] = Math.min(100, Math.round(v * factor * 100) / 100);
          const cv = parseFloat(modified[ck].computed?.[yr]);
          if (!isNaN(cv)) modified[ck].computed[yr] = Math.min(100, Math.round(cv * factor * 100) / 100);
        }
      }
      snapshotAssumptions.funnelCutValues = {
        ...(snapshotAssumptions.funnelCutValues ?? model.funnelCutValues ?? {}),
        [funnelCutId]: { ...(model.funnelCutValues?.[funnelCutId] ?? {}), combos: modified },
      };
    }

    if (assumptionType === "marketShare") {
      const base = model.marketShareAssumptions?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));
      for (const ck of targetKeys) {
        if (!modified[ck]) continue;
        for (const yr of targetYears) {
          const v = parseFloat(modified[ck].input?.[yr]);
          if (!isNaN(v)) modified[ck].input[yr] = Math.min(100, Math.round(v * factor * 100) / 100);
        }
      }
      snapshotAssumptions.marketShareAssumptions = { ...model.marketShareAssumptions, combos: modified };
    }

    if (assumptionType === "persistency") {
      const base = model.persistencyAssumptions?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));
      for (const ck of targetKeys) {
        if (!modified[ck]) continue;
        for (const yr of targetYears) {
          const v = parseFloat(modified[ck].input?.[yr]);
          if (!isNaN(v)) modified[ck].input[yr] = Math.round(v * factor * 10) / 10;
        }
      }
      snapshotAssumptions.persistencyAssumptions = { ...model.persistencyAssumptions, combos: modified };
    }
  }

  return {
    name: parsed.scenarioName,
    description: parsed.description,
    changes: parsed.changes,
    assumptions: snapshotAssumptions,
    baseModelId: model.id,
  };
}

connect().then(() => {
  app.listen(PORT, () => {
    console.log(`OncoCast API running at http://localhost:${PORT}`);
    console.log(`Models stored at: ${DATA_FILE}`);
  });
}).catch(err => {
  console.warn("MongoDB connection failed, starting without cloud sync:", err.message);
  app.listen(PORT, () => {
    console.log(`OncoCast API running at http://localhost:${PORT}`);
    console.log(`Models stored at: ${DATA_FILE}`);
  });
});
