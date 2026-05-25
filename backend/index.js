require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { fetchEpiData, parseScenarioIntent, classifyIntent, answerGeneral } = require("./gemini");

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, "data", "models.json");

app.use(cors());
app.use(express.json());

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

// ─── AI chat endpoint ─────────────────────────────────────────────────────────

app.post("/api/ai/chat", async (req, res) => {
  const { message, model } = req.body;
  if (!message || !model) return res.status(400).json({ error: "message and model are required" });

  const intent = await classifyIntent(message);

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

// ─── Scenario persistence ─────────────────────────────────────────────────────

app.post("/api/models/:id/scenarios", (req, res) => {
  const models = readModels();
  const idx = models.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Model not found" });

  const scenario = { ...req.body, savedAt: new Date().toISOString() };
  const existing = models[idx].scenarios ?? {};
  models[idx] = { ...models[idx], scenarios: { ...existing, [scenario.name]: scenario } };
  writeModels(models);
  res.status(201).json(models[idx]);
});

app.delete("/api/models/:id/scenarios/:name", (req, res) => {
  const models = readModels();
  const idx = models.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Model not found" });

  const scenarios = { ...(models[idx].scenarios ?? {}) };
  delete scenarios[req.params.name];
  models[idx] = { ...models[idx], scenarios };
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

app.listen(PORT, () => {
  console.log(`OncoCast API running at http://localhost:${PORT}`);
  console.log(`Models stored at: ${DATA_FILE}`);
});
