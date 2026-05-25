const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

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

app.listen(PORT, () => {
  console.log(`OncoCast API running at http://localhost:${PORT}`);
  console.log(`Models stored at: ${DATA_FILE}`);
});
