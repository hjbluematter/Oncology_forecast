require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");
const bcrypt  = require("bcryptjs");

const { connect, getStatus, getDb } = require("./db/mongodb");
const authRoutes   = require("./routes/auth");
const modelRoutes  = require("./routes/models");
const adminRoutes  = require("./routes/admin");
const { readUsers, writeUsers, readPermissions, writePermissions, migrateLocalToMongo } = require("./data/store");
const { SALT_ROUNDS } = require("./config");

const app  = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, "data", "models.json");

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".onrender.com")) {
      cb(null, true);
    } else {
      cb(new Error("CORS: origin not allowed: " + origin));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// ─── Auth-protected routes ────────────────────────────────────────────────────
app.use("/api/auth",   authRoutes);
app.use("/api/models", modelRoutes);
app.use("/api/admin",  adminRoutes);

// ─── Local storage helpers (kept for cloud / portfolio endpoints) ─────────────

function readModels() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeModels(models) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(models, null, 2), "utf-8");
}

// ─── Cloud status ─────────────────────────────────────────────────────────────

app.get("/api/cloud/status", (req, res) => {
  res.json(getStatus());
});

// ─── Save one model to cloud ──────────────────────────────────────────────────

app.post("/api/cloud/save/:id", async (req, res) => {
  const db = getDb();
  if (!db) {
    await connect();
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
      _localId:     model.id,
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

// ─── Migrate all local models to cloud ───────────────────────────────────────

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
        filter:      { _localId: model.id },
        replacement: { ...model, _localId: model.id, cloudSavedAt: new Date().toISOString() },
        upsert:      true,
      },
    }));
    const result = await db.collection("models").bulkWrite(ops);
    res.json({ uploaded: models.length, upserted: result.upsertedCount, modified: result.modifiedCount });
  } catch (err) {
    console.error("Migration error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── List cloud-saved models ──────────────────────────────────────────────────

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
    id:        `pf${Date.now()}`,
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
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        contents:         [{ parts: [{ text: prompt }] }],
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

// ─── Seed default users if none exist ────────────────────────────────────────

async function seedIfEmpty() {
  await migrateLocalToMongo();
  const users = await readUsers();
  if (users.length > 0) return;

  const defaultUsers = [
    { id: "u1", email: "admin@oncocast.com", name: "Admin",  globalRole: "admin", password: "Admin@123"   },
    { id: "u2", email: "p1@oncocast.com",    name: "P1",     globalRole: "user",  password: "P1@oncocast" },
    { id: "u3", email: "p2@oncocast.com",    name: "P2",     globalRole: "user",  password: "P2@oncocast" },
    { id: "u4", email: "p3@oncocast.com",    name: "P3",     globalRole: "user",  password: "P3@oncocast" },
  ];

  const hashed = await Promise.all(defaultUsers.map(async u => ({
    id: u.id, email: u.email, name: u.name, globalRole: u.globalRole,
    passwordHash: await bcrypt.hash(u.password, SALT_ROUNDS),
    createdAt:    new Date().toISOString().split("T")[0],
  })));

  await writeUsers(hashed);

  // Give all non-admin users WRITE access to every existing model
  const models    = readModels();
  const nonAdmins = hashed.filter(u => u.globalRole !== "admin");
  const perms     = [];
  for (const model of models)
    for (const u of nonAdmins)
      perms.push({ id: `perm-${model.id}-${u.id}`, modelId: model.id, userId: u.id, role: "WRITE" });
  await writePermissions(perms);

  console.log("✓ Seeded 4 default users (admin@oncocast.com / Admin@123)");
}

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`OncoCast API running at http://localhost:${PORT}`);
  console.log(`Models stored at: ${DATA_FILE}`);
  await connect();
  seedIfEmpty().catch(console.error);
});
