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
      // RECITATION is a content policy block — not retryable
      if (msg.includes("RECITATION")) throw err;
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

// Extract text safely — handles RECITATION blocks where .text() throws
function safeText(result) {
  try {
    return result.response.text().trim();
  } catch (err) {
    const msg = err.message || "";
    if (msg.includes("RECITATION")) {
      throw new Error("RECITATION: Gemini blocked the response to avoid reproducing copyrighted text. Try rephrasing the request or running it again.");
    }
    throw err;
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

  const systemPrompt = `You are an expert oncology epidemiology researcher with access to current literature.
Your job is to find real-world epidemiology and funnel-cut rates from trusted sources and return them as structured JSON.
Always show your derivation: raw reported value, base population used, and the calculated rate.
Return ONLY valid JSON — no markdown fences, no commentary.`;

  const comboKeyMap = buildEpiComboKeyMap(model);
  const epiNote = epiType === "Incidence"
    ? "Incidence = newly diagnosed patients per year (flow)."
    : "Prevalence = total living patients at a point in time (stock).";
  const lotNote = lots > 1
    ? `LOT waterfall: for lines beyond 1L apply published flow rates (e.g. ~60-70% of 1L patients reach 2L, ~50-60% of 2L reach 3L).`
    : "";

  // Build the list of model-specific funnel cuts to search for
  const funnelCuts = (model.epiFunnel || []).filter(f => !f.locked);
  const funnelBlock = funnelCuts.length > 0
    ? `\n═══ FUNNEL CUTS CONFIGURED IN THIS MODEL ═══\nSearch for a real-world rate for EACH of these cuts (use cut label and description to determine what to search for):\n${
        funnelCuts.map((f, i) =>
          `  ${i + 1}. "${f.label}"${f.description ? ` — ${f.description}` : ""}`
        ).join("\n")
      }\n`
    : `\n═══ STANDARD FUNNEL CUTS TO SEARCH ═══\nSearch for: Diagnosis Rate, Biomarker Testing Rate, Biomarker Positivity Rate, Treatment Eligibility at 1L\n`;

  // Source guidance per cut type
  const sourceGuide = `
═══ TRUSTED SOURCES BY DATA TYPE ═══
• ${epiType} rate        → SEER (seer.cancer.gov), GLOBOCAN (gco.iarc.fr), WHO ICD-O,
                            national cancer registries, Lancet Oncology, NEJM, JCO, EJC,
                            ASCO/ESMO annual meeting abstracts
• Diagnosis rate         → Cancer registry completeness studies, NCCN/ESMO clinical guidelines,
                            stage-at-diagnosis papers on PubMed (pubmed.ncbi.nlm.nih.gov)
• Biomarker testing rate → RWE claims (IQVIA, Symphony Health), companion Dx label supplements,
                            ASCO/ESMO platform presentations, FDA CDx approval press releases
• Biomarker positivity   → Molecular epidemiology studies, TCGA Pan-Cancer Atlas (cancer.gov/tcga),
                            clinical trial enrollment data, FDA label epidemiology sections,
                            PubMed meta-analyses
• Treatment eligibility  → ECOG PS distribution studies, real-world patient-selection papers,
                            ASCO/ESMO systemic therapy eligibility guidelines
• LOT flow rates         → Published RWE studies, IQVIA treatment patterns, SEER-Medicare linked data`;

  const geoList = (model.geographies || ["Global"]);
  const yearList = Array.from({ length: model.timelineYears || 5 }, (_, i) => startYear + i).join(", ");

  const userPrompt = `Search for epidemiology and funnel-cut data for "${indication}" in these geographies: ${geographies}.
Forecast period: ${startYear}–${endYear}. Model: ${lots}L, ${segs} segment(s). Epi type: ${epiType}. ${epiNote}
${funnelBlock}${sourceGuide}

═══ FOUR-STEP CALCULATION METHODOLOGY ═══

STEP 1 — Find the epidemiology RATE from trusted sources
  • Find the age-standardized or crude ${epiType.toLowerCase()} RATE (per 100,000/yr) for each geography.
  • Do NOT use the absolute count as the final number — derive the per-100K rate so it can be multiplied by population each year.
  • Source: SEER, GLOBOCAN, national cancer registries, WHO.

STEP 2 — Document indication-specific adjustments
  • If the source reports a BROADER disease category than the model indication, document each filter applied to get to the specific population. For example:
      - If source = total lung cancer but model = NSCLC: apply NSCLC fraction (~85%), cite source
      - If model = metastatic only: apply stage IV fraction, cite source
  • Show the derived FINAL rate per 100K for the model-specific indication.
  • This derivation must appear in the "derivation" object below.

STEP 3 — Find UN World Population Prospects data for EACH year
  • Source: UN World Population Prospects 2024 (https://population.un.org/wpp/)
  • For EACH geography, find the projected total population (medium scenario) for each year: ${yearList}
  • Return these in "population_by_year".

STEP 4 — Compute patients per year
  • For EACH geography and EACH year: patients = (final_rate_per_100K / 100,000) × projected_population
  • Round to nearest integer. This is what goes into "combos".
  • Do NOT use a flat CAGR — use actual UN population projections for year-by-year variation.

For EACH sourcing row:
1. Record the raw value found in the source (e.g. "226,033 new cases in 2022")
2. Record the BASE POPULATION used as denominator (e.g. "335,000,000 US population 2024")
3. Compute RATE: incidence → (raw ÷ base) × 100,000; percentages → value as 0–100
4. Record the FULL source URL (https://…)
5. Paraphrase (in your own words, do NOT reproduce verbatim) the key finding from the source

Return ONLY this JSON (no markdown fences):
{
  "rows": [
    {
      "rate_type": "<use exact funnel cut label from model if applicable, else standard name>",
      "geography": "<exact geography name matching model>",
      "retrieved_value": "<exact raw value as stated in source>",
      "base_population": "<denominator used>",
      "calculated_rate": <number — incidence: per 100K/yr; percentages: 0–100>,
      "unit": "<per 100K/yr | % | ratio>",
      "source_url": "<full https URL or null>",
      "source_context": "<1–2 sentence paraphrase of the key finding (do not reproduce verbatim)>"
    }
  ],
  "combos": {
    "<geoIdx-lotIdx>": { "<year>": <integer — patients = final_rate/100K × UN_population_that_year> }
  },
  "population_by_year": {
    "<exact geography name>": { "<year>": <integer UN projected population> }
  },
  "derivation": {
    "<exact geography name>": {
      "steps": [
        {
          "step": <integer>,
          "label": "<descriptive label, e.g. 'Raw Lung Cancer Incidence'>",
          "role": "<'anchor' | 'filter' | 'epi_base'>",
          "retrieved_value": "<exact value from source, e.g. '226,033 new cases in 2022'>",
          "operator": "<'multiply' | 'divide' | null — null for anchor and epi_base>",
          "rate": <number — adjustment percentage for filters (0–100), or per-100K rate for anchor>,
          "rate_unit": "<'per 100K/yr' | '%'>",
          "output_absolute": <integer — running patient count after this step, using base year population>,
          "source_url": "<full https URL or null>",
          "source_context": "<1–2 sentence paraphrase of the key finding, or null>"
        }
      ],
      "final_rate_per_100k": <number — the rate applied to UN populations each year>,
      "population_source": "UN World Population Prospects 2024 (population.un.org/wpp)",
      "patients_by_year": { "<year>": <integer> }
    }
  },
  "funnelCuts": {
    "<exact funnel cut label from model>": <rate_value — percentage cuts: 0–100>
  },
  "source": "<1-sentence summary of main sources used>",
  "methodology": "<2–3 sentences: rate derivation, UN population source, and how patients were computed per year>"
}

Combo keys (geoIdx-lotIdx):
${comboKeyMap}

${lotNote}
Provide at least one sourcing row per geography and one row per funnel cut in the rows array.
For funnelCuts: return a single best-estimate value per cut (weighted average across geographies if geo-specific values differ).
The derivation object must have one entry per geography in: ${geoList.join(", ")}.`;

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

    const raw = safeText(result);
    const jsonStr = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(jsonStr);

    return { ok: true, data: parsed };
  } catch (err) {
    console.error("Gemini epi fetch error:", err.message);
    const isRecitation = (err.message || "").includes("RECITATION");
    return {
      ok: false,
      error: isRecitation
        ? "The AI response was blocked to avoid reproducing copyrighted text. Please try again — the retry usually succeeds."
        : err.message,
    };
  }
}

// Epi uses geo+LOT only — segments/products share the same base patient pool
function buildEpiComboKeyMap(model) {
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const lots = model.linesOfTherapy || 1;
  const lines = [];
  for (let g = 0; g < geos.length; g++) {
    for (let l = 0; l < lots; l++) {
      lines.push(`  "${g}-${l}": "${geos[g]} / ${l + 1}L"`);
    }
  }
  return lines.join("\n");
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

Available assumption types — choose the MOST SPECIFIC match:

  "epi"
      Patient pool / epidemiology counts only.
      Use when: "incidence", "prevalence", "number of patients", "patient pool"
      NEVER use for rates, prices, or commercial metrics.

  "funnelCut"
      Percentage rates in the funnel (testing, positivity, diagnosis, eligibility).
      Use when: "testing rate", "positivity rate", "diagnosis rate", "biomarker rate",
                "treatment eligibility", any cut listed in the funnel above.
      → also set funnelCutId to the matching funnel cut id or label listed above.

  "marketShare"
      Market share % per product/brand.
      Use when: "market share", "share", "uptake", "penetration"

  "persistency"
      Median months on therapy / duration of treatment.
      Use when: "persistency", "duration of therapy", "DoT", "months on treatment",
                "time on drug", "therapy duration"

  "progression"
      % of patients flowing from one line of therapy to the next (Patient Flow models only).
      Use when: "progression rate", "1L to 2L", "line progression", "flow rate between lines",
                "patients progressing", "transition rate"

  "operationalAssumption"
      Commercial / operational metrics for the key product.
      Use when any of these are mentioned — set fieldName accordingly:
        "grossPrice"  → "price", "WAC", "launch price", "list price", "gross price per vial"
        "gtn"         → "GTN", "gross-to-net", "net price adjustment", "rebate", "discount"
        "compliance"  → "compliance", "adherence", "treatment compliance"
        "access"      → "access", "access rate", "payer access", "formulary access"
        "abandonment" → "abandonment", "discontinuation", "drop-off", "early stop"
        "vials"       → "vials", "vials per patient-month", "dose intensity", "units dispensed"

CRITICAL RULES — never break these:
  • "testing rate", "positivity rate", "diagnosis rate" → "funnelCut" (NOT "epi")
  • "price", "GTN", "WAC", "compliance", "access", "abandonment", "vials" → "operationalAssumption" (NOT "epi")
  • "progression", "flow from 1L to 2L" → "progression" (NOT "epi")
  • "market share", "share", "uptake" → "marketShare" (NOT "epi")
  • Only use "epi" for absolute patient counts / incidence / prevalence numbers.

User request: "${message}"

Return JSON. Each change object must include all fields (use null for inapplicable ones):
{
  "scenarioName": "short descriptive name (max 40 chars)",
  "description": "1-sentence description of what changes",
  "changes": [
    {
      "assumptionType": "epi",
      "funnelCutId": null,
      "fieldName": null,
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

    const raw = safeText(result);
    const jsonStr = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(jsonStr);

    return { ok: true, data: parsed };
  } catch (err) {
    console.error("Gemini scenario parse error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ─── Intent classifier ────────────────────────────────────────────────────────

async function classifyIntent(message, activeTab) {
  const lower = message.toLowerCase();

  const isScenario =
    lower.includes("scenario") ||
    lower.includes("downside") || lower.includes("upside") ||
    lower.includes("sensitivity") ||
    lower.includes("% down") || lower.includes("% up") ||
    lower.includes("reduced") || lower.includes("increase") ||
    lower.includes("percent down") || lower.includes("percent up") ||
    (lower.includes("run") && (lower.includes("forecast") || lower.includes("model") || lower.includes("scenario")));

  // Only classify as epi search when there is no explicit scenario signal.
  // e.g. "5% reduced testing rate" has "testing rate" (epi keyword) but also
  // "reduced" (scenario keyword) — scenario wins.
  const isEpi = !isScenario && (
    lower.includes("epi cut") ||
    lower.includes("epidemiology") ||
    (lower.includes("patient") && (lower.includes("pull") || lower.includes("find") || lower.includes("search") || lower.includes("fetch") || lower.includes("get"))) ||
    lower.includes("incidence") || lower.includes("prevalence") ||
    lower.includes("populate epi") || lower.includes("fill epi") ||
    lower.includes("biomarker") || lower.includes("funnel") ||
    lower.includes("her2") || lower.includes("testing rate") || lower.includes("positivity")
  );

  // Scenario check first — it's more specific (user explicitly requested a scenario run)
  if (isScenario) {
    if (activeTab === "assumptions") return "blocked_scenario";
    return "scenario";
  }
  if (isEpi) {
    if (activeTab === "scenarios") return "blocked_epi";
    return "epi_search";
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
    return { ok: true, text: safeText(result) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { fetchEpiData, parseScenarioIntent, classifyIntent, answerGeneral };
