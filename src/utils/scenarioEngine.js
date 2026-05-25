/**
 * scenarioEngine.js — Client-side scenario delta application.
 *
 * applyScenarioDelta(model, parsed, applyMode)
 *   parsed  : { scenarioName, description, changes: [{ assumptionType, funnelCutId,
 *               comboKeys, deltaPercent, direction, applyToYears }] }
 *   applyMode: "relative" | "absolute"
 *     relative — multiply existing value by (1 ± delta/100)  e.g. 30% → 28.5%
 *     absolute — add/subtract delta pp directly               e.g. 30% → 25%
 *
 * Returns: scenarioAssumptions patch object { epiAssumptions?, funnelCutValues?,
 *          marketShareAssumptions?, persistencyAssumptions? }
 */

// 4-part keys (g-l-s-0): used by epi, funnelCut, marketShare
function getAllComboKeys(model) {
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

// 3-part keys (g-l-s): used by operationalAssumptions (asset-only metrics)
function getAllAssetComboKeys(model) {
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const lots = model.linesOfTherapy || 1;
  const segs = model.segments || 1;
  const keys = [];
  for (let g = 0; g < geos.length; g++)
    for (let l = 0; l < lots; l++)
      for (let s = 0; s < segs; s++)
        keys.push(`${g}-${l}-${s}`);
  return keys;
}

// Canonical field-name aliases for operationalAssumption changes.
// Gemini may return "price", "GTN", "gross-to-net", etc. — normalise to engine field names.
const OPERATIONAL_FIELD_ALIASES = {
  price: "grossPrice", "gross price": "grossPrice", grossprice: "grossPrice",
  "launch price": "grossPrice", wac: "grossPrice", "list price": "grossPrice",
  "net price": "grossPrice",
  gtn: "gtn", "gross-to-net": "gtn", "grosstenet": "gtn", "gross to net": "gtn",
  compliance: "compliance",
  access: "access", "access rate": "access",
  abandonment: "abandonment", "abandonment rate": "abandonment",
  vials: "vials", "vials per pm": "vials", "vials per patient month": "vials",
  grossPrice: "grossPrice",
};

// Fields that are dollar amounts or non-percentage quantities (no 100% cap)
const OPERATIONAL_COUNT_FIELDS = new Set(["grossPrice", "vials"]);

/**
 * Defensive unwrap for corrupted combo period-value dicts.
 *
 * Data corruption can produce two patterns:
 *   (A) { input:{period:val}, computed:{...} } stored as the period dict
 *       → No period-looking keys at top level; extract .input
 *   (B) { "2026-01": val, ..., input:{old…}, computed:{old…} }
 *       → Period keys exist alongside stale nested keys; keep only period keys
 *
 * Normal data { "2026": val } or { "2026-01": val } passes through unchanged.
 */
function unwrapPeriodDict(d) {
  if (!d || typeof d !== "object") return {};
  const PERIOD_RE = /^\d{4}(-\d{2})?$/;
  const topPeriodKeys = Object.keys(d).filter(k => PERIOD_RE.test(k));
  if (topPeriodKeys.length > 0) {
    if (topPeriodKeys.length === Object.keys(d).length) return d; // already clean — fast path
    const out = {};
    for (const k of topPeriodKeys) out[k] = d[k];
    return out;
  }
  // No period keys at top level — try nested .input
  if (typeof d.input === "object" && d.input !== null && !Array.isArray(d.input)) return d.input;
  return d;
}

/**
 * Check whether a period key string belongs to any of the target years.
 * Handles both "YYYY" (yearly) and "YYYY-MM" (monthly) formats.
 */
function periodInTargetYears(key, targetYearSet) {
  if (!key || !targetYearSet) return false;
  const yr = key.split("-")[0];
  return targetYearSet.has(yr);
}

export function applyScenarioDelta(model, parsed, applyMode = "relative") {
  const startYear = model.startYear || 2025;
  const n = model.timelineYears || 5;
  const years = Array.from({ length: n }, (_, i) => String(startYear + i));

  const snap = {};

  for (const change of parsed.changes || []) {
    const { assumptionType, funnelCutId, comboKeys, deltaPercent, direction, applyToYears } = change;
    const sign = direction === "down" ? -1 : 1;
    const targetKeys = comboKeys === "all" ? getAllComboKeys(model)
      : (Array.isArray(comboKeys) ? comboKeys : [comboKeys]);

    // Build a Set of target year strings for O(1) lookup
    const targetYearSet = new Set(
      applyToYears === "all" || !applyToYears
        ? years
        : years.filter(y => applyToYears.includes(parseInt(y)))
    );

    function adjustVal(v, isCount = false) {
      if (isNaN(v)) return v;
      if (applyMode === "absolute") {
        return isCount
          ? Math.max(0, Math.round(v + sign * deltaPercent))
          : Math.min(100, Math.max(0, v + sign * deltaPercent));
      }
      // relative
      const factor = 1 + sign * deltaPercent / 100;
      return isCount
        ? Math.max(0, Math.round(v * factor))
        : Math.min(100, Math.max(0, Math.round(v * factor * 100) / 100));
    }

    /**
     * Apply adjustVal to all keys in a period-value dict that belong to targetYears.
     * Handles both yearly ("YYYY") and monthly ("YYYY-MM") keys in the same dict.
     * Returns a new object with modified values.
     */
    function applyToPeriodDict(dict, isCount = false) {
      const out = { ...dict };
      for (const k of Object.keys(out)) {
        if (!periodInTargetYears(k, targetYearSet)) continue;
        const v = parseFloat(out[k]);
        if (!isNaN(v)) out[k] = adjustVal(v, isCount);
      }
      return out;
    }

    if (assumptionType === "epi") {
      const base = model.epiAssumptions?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));
      for (const ck of targetKeys) {
        if (!modified[ck]) continue;
        const inputDict    = unwrapPeriodDict(modified[ck].input    ?? {});
        const computedDict = unwrapPeriodDict(modified[ck].computed ?? {});
        modified[ck].input    = applyToPeriodDict(inputDict,    true);
        modified[ck].computed = applyToPeriodDict(computedDict, true);
      }
      snap.epiAssumptions = { ...model.epiAssumptions, combos: modified };
    }

    if (assumptionType === "funnelCut") {
      // Support matching by funnel cut label if ID lookup fails
      const funnelCuts = model.funnelCutValues ?? {};
      let cutId = funnelCutId;
      if (cutId && !funnelCuts[cutId]) {
        // Try matching by funnel step label (case-insensitive)
        const stepMatch = (model.epiFunnel ?? []).find(
          s => s.label?.toLowerCase() === cutId?.toLowerCase()
        );
        if (stepMatch) cutId = stepMatch.id;
      }
      if (!cutId) continue;

      const base = funnelCuts[cutId]?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));
      for (const ck of targetKeys) {
        if (!modified[ck]) continue;
        const inputDict    = unwrapPeriodDict(modified[ck].input    ?? {});
        const computedDict = unwrapPeriodDict(modified[ck].computed ?? {});
        modified[ck].input    = applyToPeriodDict(inputDict);
        modified[ck].computed = applyToPeriodDict(computedDict);
      }
      snap.funnelCutValues = {
        ...(snap.funnelCutValues ?? funnelCuts),
        [cutId]: { ...(funnelCuts[cutId] ?? {}), combos: modified },
      };
    }

    if (assumptionType === "marketShare") {
      const base = model.marketShareAssumptions?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));
      for (const ck of targetKeys) {
        if (!modified[ck]) continue;
        const inputDict    = unwrapPeriodDict(modified[ck].input    ?? {});
        const computedDict = unwrapPeriodDict(modified[ck].computed ?? {});
        modified[ck].input    = applyToPeriodDict(inputDict);
        modified[ck].computed = applyToPeriodDict(computedDict);
      }
      snap.marketShareAssumptions = { ...model.marketShareAssumptions, combos: modified };
    }

    if (assumptionType === "persistency") {
      const base = model.persistencyAssumptions?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));
      for (const ck of targetKeys) {
        if (!modified[ck]) continue;
        const v = parseFloat(typeof modified[ck] === "object" ? (modified[ck].input ?? modified[ck]) : modified[ck]);
        if (!isNaN(v)) {
          const adj = applyMode === "absolute"
            ? Math.max(0, Math.round((v + sign * deltaPercent) * 10) / 10)
            : Math.max(0, Math.round(v * (1 + sign * deltaPercent / 100) * 10) / 10);
          modified[ck] = typeof modified[ck] === "object" ? { ...modified[ck], input: String(adj) } : String(adj);
        }
      }
      snap.persistencyAssumptions = { ...model.persistencyAssumptions, combos: modified };
    }

    if (assumptionType === "operationalAssumption") {
      // Resolve field name — accept raw Gemini output or common aliases
      const rawField = change.fieldName ?? "";
      const fieldName = OPERATIONAL_FIELD_ALIASES[rawField.toLowerCase()] ?? rawField;
      if (!fieldName) continue;

      // Operational assumptions use 3-part asset keys (g-l-s), not 4-part
      const assetTargetKeys = comboKeys === "all"
        ? getAllAssetComboKeys(model)
        : (Array.isArray(comboKeys) ? comboKeys : [comboKeys]);

      const isCount = OPERATIONAL_COUNT_FIELDS.has(fieldName);
      const base = model.operationalAssumptions?.[fieldName]?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));

      for (const ck of assetTargetKeys) {
        if (!modified[ck]) continue;
        const inputDict    = unwrapPeriodDict(modified[ck].input    ?? {});
        const computedDict = unwrapPeriodDict(modified[ck].computed ?? {});
        modified[ck].input    = applyToPeriodDict(inputDict,    isCount);
        modified[ck].computed = applyToPeriodDict(computedDict, isCount);
      }

      snap.operationalAssumptions = {
        ...(snap.operationalAssumptions ?? model.operationalAssumptions ?? {}),
        [fieldName]: {
          ...(model.operationalAssumptions?.[fieldName] ?? {}),
          combos: modified,
        },
      };
    }
  }

  return snap;
}

/** Clone all assumption fields from base model to initialise a new scenario */
export function cloneBaseAssumptions(model) {
  const keys = [
    "epiAssumptions", "funnelCutValues", "marketShareAssumptions",
    "persistencyAssumptions", "progressionAssumptions", "operationalAssumptions",
  ];
  const out = {};
  for (const k of keys) {
    if (model[k] !== undefined) out[k] = JSON.parse(JSON.stringify(model[k]));
  }
  return out;
}
