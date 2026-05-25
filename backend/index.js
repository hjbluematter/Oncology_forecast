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

// ─── Portfolio CRUD ───────────────────────────────────────────────────────────

const PORTFOLIO_FILE = path.join(__dirname, "data", "portfolios.json");

function readPortfolios() {
  if (!fs.existsSync(PORTFOLIO_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, "utf-8")); }
  catch { return []; }
}

function writePortfolios(list) {
  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(list, null, 2), "utf-8");
}

app.get("/api/portfolios", async (req, res) => {
  const db = getDb();
  if (db) {
    try {
      const docs = await db.collection("portfolios").find({}).sort({ updatedAt: -1 }).toArray();
      return res.json(docs.map((d) => ({ ...d, id: d._localId ?? String(d._id) })));
    } catch (err) { console.error("Portfolio list cloud error:", err.message); }
  }
  res.json(readPortfolios());
});

app.post("/api/portfolios", async (req, res) => {
  const portfolio = {
    ...req.body,
    id: `pf${Date.now()}`,
    createdAt: new Date().toISOString().split("T")[0],
    updatedAt: new Date().toISOString(),
  };
  const db = getDb();
  if (db) {
    try { await db.collection("portfolios").insertOne({ ...portfolio, _localId: portfolio.id }); }
    catch (err) { console.error("Portfolio cloud save error:", err.message); }
  }
  const list = readPortfolios();
  list.unshift(portfolio);
  writePortfolios(list);
  res.status(201).json(portfolio);
});

app.patch("/api/portfolios/:id", async (req, res) => {
  const list = readPortfolios();
  const idx  = list.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Portfolio not found" });
  list[idx] = { ...list[idx], ...req.body, updatedAt: new Date().toISOString() };
  writePortfolios(list);
  const db = getDb();
  if (db) {
    try {
      await db.collection("portfolios").updateOne(
        { _localId: req.params.id },
        { $set: { name: req.body.name, updatedAt: list[idx].updatedAt } }
      );
    } catch (err) { console.error("Portfolio cloud rename error:", err.message); }
  }
  res.json(list[idx]);
});

app.delete("/api/portfolios/:id", async (req, res) => {
  const list     = readPortfolios();
  const filtered = list.filter((p) => p.id !== req.params.id);
  if (filtered.length === list.length)
    return res.status(404).json({ error: "Portfolio not found" });
  writePortfolios(filtered);
  const db = getDb();
  if (db) {
    try { await db.collection("portfolios").deleteOne({ _localId: req.params.id }); }
    catch (err) { console.error("Portfolio cloud delete error:", err.message); }
  }
  res.json({ success: true });
});

// ─── AI Narrative generation (Gemini) ────────────────────────────────────────

app.post("/api/narrative", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return res.status(503).json({ error: "GEMINI_API_KEY not configured in backend/.env — get a free key at aistudio.google.com" });
  }

  const { summary } = req.body;
  if (!summary) return res.status(400).json({ error: "summary is required" });

  const prompt = `You are a senior pharmaceutical forecasting analyst at a top-tier life sciences consultancy. A client has asked you to write a detailed, insightful narrative commentary on their oncology asset forecast.

Write 5–7 substantive paragraphs of plain prose (no bullet points, no section headers, no markdown). Each paragraph should cover a distinct analytical theme. Be specific with every number — cite revenues, patient counts, percentages, years explicitly. Do not be vague. This commentary will be read by the asset team and senior leadership, so it must be analytically sharp and decision-relevant.

Each paragraph must be at least 100 words. Cover ALL of the following themes, one full paragraph each:
1. Overall revenue trajectory — describe the full shape of the curve year by year using the revenueByYear data; cite total cumulative revenue, peak year and peak value, ramp speed, plateau length, and whether the trajectory looks aggressive or conservative given the indication and competitive landscape.
2. Line of therapy breakdown — use the revenueByLot and revenueByLotByYear data; cite each LOT's cumulative contribution and percentage share of total; explain which LOT dominates and why; describe how revenue builds across LOTs over time and what this implies about the asset's competitive positioning across the treatment continuum.
3. Geographic breakdown — use revenueByGeo and lotGeoMatrix; cite each geography's cumulative revenue and share; identify the top market and explain what geographic concentration implies for commercial risk; if RoE or RoW aggregates are present cite their contributions and comment on ex-named-market opportunity.
4. Patient volume analysis — use newPatientsByYear and totalNewPatients; describe the new patient starts trend year by year; comment on what the NPS ramp implies about market share capture speed and funnel efficiency; relate patient volume to revenue to infer revenue per patient.
5. Operational assumptions and revenue build quality — use operationalAssumptions_firstCombo; comment analytically on what the compliance, access, abandonment, vials/PM, gross price, GTN, and net price imply about commercial execution quality, pricing power, and net revenue realization; flag any assumptions that look stretched or conservative.
6. Risk adjustments — if iraApplied is not null, explain the IRA impact: from which year it applies, the discount rate, and quantify the estimated revenue reduction; if ptrsApplied is not null, explain that the revenue figures are already probability-weighted, state the PTRS and the implied haircut, and describe what the unadjusted (pre-PTRS) peak would look like; if neither applies, state that the forecast carries full commercial risk.
7. Key uncertainties and strategic implications — identify the 2–3 biggest swing factors specific to this asset and indication; explain what assumption changes would most materially shift the forecast; state what strategic or investment decisions this forecast is most relevant to inform.

Forecast data:
${JSON.stringify(summary, null, 2)}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: `Gemini API error: ${err}` });
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    res.json({ narrative: text });
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
