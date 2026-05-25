let GoogleGenerativeAI;
try {
  ({ GoogleGenerativeAI } = require("@google/generative-ai"));
} catch {
  console.warn("WARNING: @google/generative-ai not installed. Run: cd backend && npm install");
}

function getClient() {
  if (!GoogleGenerativeAI) throw new Error("@google/generative-ai is not installed. Run `npm install` in the backend folder.");
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set in backend/.env");
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// Retry up to 3 times on 503 / 429 with exponential backoff
async function withRetry(fn, retries = 3, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err.message || "";
      const isRetryable = msg.includes("503") || msg.includes("Service Unavailable") || msg.includes("429") || msg.includes("Too Many Requests");
      if (isRetryable && i < retries - 1) {
        const wait = delayMs * (i + 1);
        console.log(`Gemini ${isRetryable ? "503/429" : "error"} — retrying in ${wait}ms (attempt ${i + 2}/${retries})...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

// ─── Epi data search ──────────────────────────────────────────────────────────

async function fetchEpiData(model) {
  const genai = getClient();
  const indication = model.indication || "Unknown Indication";
  const geographies = (model.geographies || ["Global"]).join(", ");
  const epiType = model.epiType || "Incidence";
  const startYear = model.startYear || 2025;
  const endYear = startYear + (model.timelineYears || 5) - 1;
  const lots = model.linesOfTherapy || 1;
  const segs = model.segments || 1;

  const systemPrompt = `You are an oncology market research expert. Your job is to find real epidemiology data and return it as structured JSON.
Return ONLY valid JSON, no markdown, no explanation.`;

  const comboKeyMap = buildComboKeyMap(model);
  const lotNote = lots > 1 ? `For lines of therapy beyond 1L, apply typical waterfall rates (e.g., ~60-70% of 1L patients reach 2L).` : "";
  const epiNote = epiType === "Incidence" ? "Incidence = new patients per year." : "Prevalence = total patient pool (point-in-time).";

  const userPrompt = `Find ${epiType.toLowerCase()} data for "${indication}" in these geographies: ${geographies}.
Forecast period: ${startYear} to ${endYear} (${endYear - startYear + 1} years).
Model has ${lots} line(s) of therapy and ${segs} segment(s).

Return a JSON object in this exact format:
{
  "source": "brief description of data sources found",
  "methodology": "1-2 sentences on how you derived/projected the numbers",
  "combos": {
    "<comboKey>": {
      "<year>": <number>
    }
  }
}

The model has these combinations (comboKey = "geoIdx-lotIdx-segIdx-0" for the asset):
${comboKeyMap}

For each comboKey, provide patient counts for each year from ${startYear} to ${endYear}.
${epiNote}
${lotNote}
Use realistic estimates based on published literature, clinical studies, or epidemiology databases.`;

  try {
    const model_ai = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
      tools: [{ googleSearch: {} }],
    });

    const result = await withRetry(() => model_ai.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.1 },
    }));

    const raw = result.response.text().trim();
    const jsonStr = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(jsonStr);

    return { ok: true, data: parsed };
  } catch (err) {
    console.error("Gemini epi fetch error:", err.message);
    return { ok: false, error: err.message };
  }
}

function buildComboKeyMap(model) {
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const lots = model.linesOfTherapy || 1;
  const segs = model.segments || 1;
  const lines = [];
  for (let g = 0; g < geos.length; g++) {
    for (let l = 0; l < lots; l++) {
      for (let s = 0; s < segs; s++) {
        const segLabel = model.segmentNames?.[s] || (segs > 1 ? `Seg ${s + 1}` : "All");
        lines.push(`  "${g}-${l}-${s}-0": "${geos[g]} / ${l + 1}L / ${segLabel}"`);
      }
    }
  }
  return lines.join("\n");
}

// ─── Scenario intent parser ───────────────────────────────────────────────────

async function parseScenarioIntent(message, model) {
  const genai = getClient();
  const indication = model.indication || "Unknown";
  const geos = (model.geographies || ["Global"]).join(", ");
  const lots = model.linesOfTherapy || 1;
  const segs = model.segments || 1;
  const startYear = model.startYear || 2025;
  const endYear = startYear + (model.timelineYears || 5) - 1;

  const comboMap = buildComboKeyMap(model);
  const funnelCuts = (model.epiFunnel || [])
    .filter((f) => !f.locked)
    .map((f) => `  "${f.id}": "${f.label}"`)
    .join("\n");

  const systemPrompt = `You are an oncology forecasting assistant. Parse scenario requests and return structured JSON.
Return ONLY valid JSON, no markdown, no explanation.`;

  const userPrompt = `Parse this scenario request for an oncology forecast model.

Model: "${model.assetName || "Asset"}" in "${indication}"
Geographies: ${geos}
Lines of therapy: ${lots}L
Segments: ${segs}
Years: ${startYear}–${endYear}

Available combo keys (format "geoIdx-lotIdx-segIdx-productIdx"):
${comboMap}

Available funnel cuts:
${funnelCuts || "  (none configured)"}

Available assumption types: "epi", "funnelCut", "marketShare", "persistency"

User request: "${message}"

Return JSON in this format:
{
  "scenarioName": "short descriptive name (max 40 chars)",
  "description": "1-sentence description of what changes",
  "changes": [
    {
      "assumptionType": "epi",
      "funnelCutId": null,
      "comboKeys": "all",
      "deltaPercent": 5,
      "direction": "down",
      "applyToYears": "all"
    }
  ]
}`;

  try {
    const model_ai = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
    });

    const result = await withRetry(() => model_ai.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.1 },
    }));

    const raw = result.response.text().trim();
    const jsonStr = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(jsonStr);

    return { ok: true, data: parsed };
  } catch (err) {
    console.error("Gemini scenario parse error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ─── Intent classifier ────────────────────────────────────────────────────────

async function classifyIntent(message) {
  const lower = message.toLowerCase();

  if (
    lower.includes("epi cut") ||
    lower.includes("epidemiology") ||
    (lower.includes("patient") && (lower.includes("pull") || lower.includes("find") || lower.includes("search") || lower.includes("fetch") || lower.includes("get"))) ||
    lower.includes("incidence") || lower.includes("prevalence") ||
    lower.includes("populate epi") || lower.includes("fill epi")
  ) {
    return "epi_search";
  }

  if (
    lower.includes("scenario") ||
    lower.includes("downside") || lower.includes("upside") ||
    lower.includes("sensitivity") ||
    lower.includes("% down") || lower.includes("% up") ||
    lower.includes("percent down") || lower.includes("percent up") ||
    (lower.includes("run") && (lower.includes("forecast") || lower.includes("model")))
  ) {
    return "scenario";
  }

  return "general";
}

// ─── General Q&A ─────────────────────────────────────────────────────────────

async function answerGeneral(message, model) {
  const genai = getClient();
  const systemPrompt = `You are an AI assistant embedded in an oncology forecasting platform called OncoCast.
Be concise and helpful. Max 3 sentences unless asked for more.`;

  const context = `Current model: "${model.assetName || "Untitled"}" for "${model.indication || "Unknown"}", ${model.epiType || "Incidence"}-based, ${model.linesOfTherapy || 1}L, geographies: ${(model.geographies || ["Global"]).join(", ")}.`;

  try {
    const model_ai = genai.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: systemPrompt });
    const result = await withRetry(() => model_ai.generateContent({
      contents: [{ role: "user", parts: [{ text: `${context}\n\n${message}` }] }],
      generationConfig: { temperature: 0.4 },
    }));
    return { ok: true, text: result.response.text().trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { fetchEpiData, parseScenarioIntent, classifyIntent, answerGeneral };
