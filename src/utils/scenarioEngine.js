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
    const targetYears = applyToYears === "all" || !applyToYears
      ? years
      : years.filter(y => applyToYears.includes(parseInt(y)));

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

    if (assumptionType === "epi") {
      const base = model.epiAssumptions?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));
      for (const ck of targetKeys) {
        if (!modified[ck]) continue;
        for (const yr of targetYears) {
          const v = parseFloat(modified[ck].input?.[yr]);
          if (!isNaN(v)) modified[ck].input[yr] = adjustVal(v, true);
          const cv = parseFloat(modified[ck].computed?.[yr]);
          if (!isNaN(cv)) modified[ck].computed[yr] = adjustVal(cv, true);
        }
      }
      snap.epiAssumptions = { ...model.epiAssumptions, combos: modified };
    }

    if (assumptionType === "funnelCut" && funnelCutId) {
      const base = model.funnelCutValues?.[funnelCutId]?.combos ?? {};
      const modified = JSON.parse(JSON.stringify(base));
      for (const ck of targetKeys) {
        if (!modified[ck]) continue;
        for (const yr of targetYears) {
          const v = parseFloat(modified[ck].input?.[yr]);
          if (!isNaN(v)) modified[ck].input[yr] = adjustVal(v);
          const cv = parseFloat(modified[ck].computed?.[yr]);
          if (!isNaN(cv)) modified[ck].computed[yr] = adjustVal(cv);
        }
      }
      snap.funnelCutValues = {
        ...(snap.funnelCutValues ?? model.funnelCutValues ?? {}),
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
          if (!isNaN(v)) modified[ck].input[yr] = adjustVal(v);
        }
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
