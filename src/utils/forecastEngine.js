// ─── Forecast Engine ──────────────────────────────────────────────────────────
// Pure ES module — no React imports.

// ─── Period helpers ───────────────────────────────────────────────────────────

function buildPeriodKeys(model) {
  const isMonthly = (model.granularity ?? "Yearly") === "Monthly";
  const periodMonths = isMonthly ? 1 : 12;
  const { startYear, timelineYears } = model;
  const periods = [];
  const years = [];

  if (isMonthly) {
    for (let y = startYear; y < startYear + timelineYears; y++) {
      if (!years.includes(y)) years.push(y);
      for (let m = 1; m <= 12; m++) {
        periods.push(`${y}-${String(m).padStart(2, "0")}`);
      }
    }
  } else {
    for (let y = startYear; y < startYear + timelineYears; y++) {
      periods.push(String(y));
      years.push(y);
    }
  }

  return { periods, years, isMonthly, periodMonths };
}

function buildProductList(model) {
  return [
    model.assetName || "Asset",
    ...Array.from({ length: model.competitors ?? 0 }, (_, i) =>
      model.competitorNames?.[i] || `Competitor ${i + 1}`
    ),
  ];
}

function buildGeoList(model) {
  const g = model.geographies ?? [];
  return g.length > 0 ? g : ["Global"];
}

// ─── Value accessors ──────────────────────────────────────────────────────────

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
    // Has real period keys at top level — strip any stale "input"/"computed" sub-objects
    if (topPeriodKeys.length === Object.keys(d).length) return d; // already clean — fast path
    const out = {};
    for (const k of topPeriodKeys) out[k] = d[k];
    return out;
  }
  // No period keys at top level — try nested .input (pattern A)
  if (typeof d.input === "object" && d.input !== null && !Array.isArray(d.input)) return d.input;
  return d;
}

function getPeriodVal(assumption, comboKey, period) {
  if (!assumption) return null;
  const combos = assumption.combos ?? {};
  const comboData = combos[comboKey];
  if (!comboData) return null;
  // prefer computed (already at model granularity); unwrap any accidental nesting
  const computed = unwrapPeriodDict(comboData.computed ?? {});
  const input    = unwrapPeriodDict(comboData.input    ?? {});
  const raw = computed[period] ?? input[period];
  if (raw === null || raw === undefined || raw === "") return null;
  const v = parseFloat(String(raw).replace(/,/g, ""));
  return isNaN(v) ? null : v;
}

function getScalarVal(assumption, comboKey) {
  if (!assumption) return null;
  const combos = assumption.combos ?? {};
  const comboData = combos[comboKey];
  if (!comboData) return null;
  // scalar assumptions store a string value directly
  const raw = typeof comboData === "object" && "input" in comboData
    ? comboData.input
    : comboData;
  if (raw === null || raw === undefined || raw === "") return null;
  const v = parseFloat(String(raw).replace(/,/g, ""));
  return isNaN(v) ? null : v;
}

// ─── Funnel operator ──────────────────────────────────────────────────────────

function applyFunnelOp(pool, operator, value) {
  switch (operator) {
    case "complement": return pool * (1 - value / 100);
    case "multiply":   return pool * (value / 100);
    case "divide":     return value !== 0 ? pool / (value / 100) : pool;
    case "add":        return pool + value;
    case "subtract":   return pool - value;
    default:           return pool;
  }
}

// ─── Segment index lookup ─────────────────────────────────────────────────────

function findSegIdx(model, segName, defaultIdx) {
  if (!segName) return defaultIdx;
  const names = model.segmentNames ?? [];
  const idx = names.findIndex(n => n === segName);
  return idx >= 0 ? idx : defaultIdx;
}

// ─── Main forecast function ───────────────────────────────────────────────────

export function runForecast(model) {
  const { periods, years, isMonthly, periodMonths } = buildPeriodKeys(model);
  const geos = buildGeoList(model);
  const products = buildProductList(model);
  const lots = model.linesOfTherapy ?? 1;
  const segs = model.segments ?? 1;
  const isIncidence = (model.epiType ?? "Incidence") === "Incidence";
  const isPatientFlow = model.modelType === "Patient Flow";

  // Build all combos
  const combos = [];
  for (let g = 0; g < geos.length; g++) {
    for (let l = 0; l < lots; l++) {
      for (let s = 0; s < segs; s++) {
        for (let p = 0; p < products.length; p++) {
          const segLabel = model.segmentNames?.[s] || `Seg ${s + 1}`;
          combos.push({
            key: `${g}-${l}-${s}-${p}`,
            geoIdx: g, lotIdx: l, segIdx: s, productIdx: p,
            geoLabel: geos[g],
            lotLabel: `${l + 1}L`,
            segLabel,
            productLabel: products[p],
            isAsset: p === 0,
          });
        }
      }
    }
  }

  // Result containers
  const eligible = {};
  const nps = {};
  const pm = {};
  const vials = {};
  const revenue = {};
  const progressing = {};
  // Trace data: key3 (g-l-s) → period → detailed step breakdown (asset combo only)
  const traceData = {};

  for (const c of combos) {
    eligible[c.key] = {};
    nps[c.key] = {};
    pm[c.key] = {};
    vials[c.key] = {};
    revenue[c.key] = {};
  }

  // Active patient state: accumulated over periods (Incidence models only)
  // key4 -> current active count
  const active = {};
  for (const c of combos) active[c.key] = 0;

  // Progression injection: { key3: { period: number } }
  // Built during lot-l processing, consumed during lot-(l+1) processing
  const progressionInjection = {};

  for (let g = 0; g < geos.length; g++) {
    for (let l = 0; l < lots; l++) {
      for (let s = 0; s < segs; s++) {
        const k3 = `${g}-${l}-${s}`;
        progressing[k3] = {};
        progressionInjection[k3] = {};
        for (const period of periods) {
          progressionInjection[k3][period] = 0;
          progressing[k3][period] = 0;
        }
      }
    }
  }

  // ─── Per-period computation ────────────────────────────────────────────────
  for (const period of periods) {
    const periodYear = parseInt(period.split("-")[0]);

    // Process lots in ascending order (critical for Patient Flow injection)
    for (let l = 0; l < lots; l++) {
      for (let g = 0; g < geos.length; g++) {
        for (let s = 0; s < segs; s++) {
          const k3 = `${g}-${l}-${s}`;

          // ── EPI Base ────────────────────────────────────────────────────────
          let epiBase = 0;

          if (isPatientFlow && isIncidence) {
            if (l === 0) {
              // 1L: read from epiAssumptions with key g-0-s-0
              const epiKey = `${g}-0-${s}-0`;
              const v = getPeriodVal(model.epiAssumptions, epiKey, period);
              epiBase = v !== null ? v : 0;
            } else {
              // Higher lines: sum injected progression from previous line
              epiBase = progressionInjection[k3]?.[period] ?? 0;
            }
          } else {
            // Patient Segmentation or Prevalence Patient Flow: epi per LOT
            const epiKey = `${g}-${l}-${s}-0`;
            const v = getPeriodVal(model.epiAssumptions, epiKey, period);
            epiBase = v !== null ? v : 0;
          }

          epiBase = Math.max(0, epiBase);

          // ── Funnel Cuts ─────────────────────────────────────────────────────
          let pool = epiBase;
          const funnel = model.epiFunnel ?? [];
          const traceFunnelSteps = [];
          for (const cut of funnel) {
            if (cut.locked) continue; // anchor
            const cutKey = `${g}-${l}-${s}-0`;
            const cutAssumption = model.funnelCutValues?.[cut.id];
            let cutVal = getPeriodVal(cutAssumption, cutKey, period);
            if (cutVal === null) {
              cutVal = cut.value !== null && cut.value !== undefined ? parseFloat(cut.value) : null;
            }
            // Normalize: values stored as 0–1 decimals (e.g. 0.9) are auto-converted
            // to 0–100 scale so applyFunnelOp can divide by 100 consistently.
            const isAbsoluteOp = cut.operator === "add" || cut.operator === "subtract";
            if (!isAbsoluteOp && cutVal !== null && !isNaN(cutVal) && cutVal > 0 && cutVal < 1) {
              cutVal = cutVal * 100;
            }
            const poolBefore = pool;
            if (cutVal !== null && !isNaN(cutVal) && cut.operator) {
              pool = applyFunnelOp(pool, cut.operator, cutVal);
              pool = Math.max(0, pool);
            }
            traceFunnelSteps.push({ id: cut.id, label: cut.label || `Cut ${traceFunnelSteps.length + 1}`, operator: cut.operator, appliedValue: cutVal, inputPool: poolBefore, outputPool: pool });
          }

          const eligiblePool = Math.max(0, pool);

          // Store eligible for all products (same pool)
          for (let p = 0; p < products.length; p++) {
            eligible[`${g}-${l}-${s}-${p}`][period] = eligiblePool;
          }

          // ── Market Share → NPS ──────────────────────────────────────────────
          for (let p = 0; p < products.length; p++) {
            const k4 = `${g}-${l}-${s}-${p}`;
            const shareKey = k4;
            const shareVal = getPeriodVal(model.marketShareAssumptions, shareKey, period);
            const share = shareVal !== null ? shareVal / 100 : 0;
            const npsVal = Math.max(0, eligiblePool * share);
            nps[k4][period] = npsVal;
          }

          // ── DoT / Persistency + Patient Months ──────────────────────────────
          // Capture asset-combo trace values before the loop mutates active[]
          let traceActiveStart = 0, traceMedianMonths = 0, tracePmVal = 0, traceActiveEnd = 0;

          for (let p = 0; p < products.length; p++) {
            const k4 = `${g}-${l}-${s}-${p}`;
            const npsVal = nps[k4][period];

            if (isIncidence) {
              const persKey = `${g}-${l}-${s}-${p}`;
              const medianStr = model.persistencyAssumptions?.combos?.[persKey];
              const medianMonths = medianStr !== null && medianStr !== undefined && medianStr !== ""
                ? parseFloat(String(medianStr).replace(/,/g, ""))
                : 0;

              let pmVal = 0;
              let activeEnd = 0;
              const activeStart = active[k4] ?? 0;

              if (!medianMonths || medianMonths <= 0) {
                pmVal = npsVal * periodMonths;
                activeEnd = 0;
              } else {
                const lambda = Math.log(2) / medianMonths;
                const expFactor = Math.exp(-lambda * periodMonths);
                const totalEntry = activeStart + npsVal;
                pmVal = totalEntry * (1 / lambda) * (1 - expFactor);
                activeEnd = totalEntry * expFactor;
              }

              pm[k4][period] = Math.max(0, pmVal);
              active[k4] = Math.max(0, activeEnd);

              if (p === 0) { traceActiveStart = activeStart; traceMedianMonths = medianMonths; tracePmVal = pmVal; traceActiveEnd = activeEnd; }
            } else {
              pm[k4][period] = Math.max(0, npsVal * periodMonths);
              if (p === 0) { traceActiveStart = 0; traceMedianMonths = 0; tracePmVal = pm[k4][period]; traceActiveEnd = 0; }
            }
          }

          // ── Progression (Patient Flow Incidence, lots 0..N-2) ───────────────
          let traceProgRatePct = 0, traceProgressingOut = 0;

          if (isPatientFlow && isIncidence && l < lots - 1) {
            const progVal = getPeriodVal(model.progressionAssumptions, k3, period);
            const progRate = progVal !== null ? progVal / 100 : 0;
            traceProgRatePct = progRate * 100;

            if (progRate > 0) {
              let totalProgressing = 0;
              for (let p = 0; p < products.length; p++) {
                const k4 = `${g}-${l}-${s}-${p}`;
                const activeEnd = active[k4] ?? 0;
                const progAmt = Math.max(0, activeEnd * progRate);
                active[k4] = Math.max(0, activeEnd - progAmt);
                totalProgressing += progAmt;
              }
              progressing[k3][period] = totalProgressing;
              traceProgressingOut = totalProgressing;

              const patientFlowRules = model.patientFlowRules ?? {};
              const nextLotLabel = `${l + 2}L`;
              const lotRules = patientFlowRules[nextLotLabel] ?? {};
              const segName = model.segmentNames?.[s] || null;
              let targetSegIdx = s;
              if (segName && lotRules[segName]) {
                const targetSegName = lotRules[segName][products[0]];
                if (targetSegName) targetSegIdx = findSegIdx(model, targetSegName, s);
              }
              const nextK3 = `${g}-${l + 1}-${targetSegIdx}`;
              if (!progressionInjection[nextK3]) {
                progressionInjection[nextK3] = {};
                for (const p2 of periods) progressionInjection[nextK3][p2] = 0;
              }
              progressionInjection[nextK3][period] = (progressionInjection[nextK3][period] ?? 0) + totalProgressing;
            }
          }

          // ── Revenue (asset only, p=0) + trace capture ───────────────────────
          {
            const assetKey3 = k3;
            const assetKey4 = `${g}-${l}-${s}-0`;
            const pmVal = pm[assetKey4][period] ?? 0;

            const ops = model.operationalAssumptions ?? {};
            const compliance  = getPeriodVal(ops.compliance,  assetKey3, period) ?? 100;
            const access      = getPeriodVal(ops.access,      assetKey3, period) ?? 100;
            const abandonment = getPeriodVal(ops.abandonment, assetKey3, period) ?? 0;
            const vialsPerPM  = getPeriodVal(ops.vials,       assetKey3, period) ?? 1;
            const grossPrice  = getPeriodVal(ops.grossPrice,  assetKey3, period) ?? 0;
            const gtn         = getPeriodVal(ops.gtn,         assetKey3, period) ?? 0;

            let netPrice = grossPrice * (1 - gtn / 100);
            let iraApplied = false;
            let iraDiscountApplied = 0;
            if (model.applyIRA && model.iraYear && periodYear >= model.iraYear) {
              iraDiscountApplied = model.iraDiscountRate ?? 0;
              netPrice = netPrice * (1 - iraDiscountApplied / 100);
              iraApplied = true;
            }

            let ptrs = 1.0;
            const ptrsCombo = model.operationalAssumptions?.ptrs?.combos?.[assetKey3];
            if (ptrsCombo !== null && ptrsCombo !== undefined && ptrsCombo !== "") {
              const v = parseFloat(String(ptrsCombo).replace(/,/g, "")) / 100;
              if (!isNaN(v)) ptrs = v;
            }
            if (model.applyPTRS && model.ptrsValue) ptrs *= model.ptrsValue / 100;

            const vialsDispensed = pmVal * (compliance / 100) * (access / 100) * (1 - abandonment / 100) * vialsPerPM;
            const rev = vialsDispensed * netPrice * ptrs;
            vials[assetKey4][period] = Math.max(0, vialsDispensed);
            revenue[assetKey4][period] = Math.max(0, rev);

            for (let pp = 1; pp < products.length; pp++) {
              revenue[`${g}-${l}-${s}-${pp}`][period] = 0;
            }

            // ── Store trace for this asset combo / period ──────────────────────
            if (!traceData[assetKey3]) traceData[assetKey3] = {};
            const assetShareVal = getPeriodVal(model.marketShareAssumptions, assetKey4, period);
            traceData[assetKey3][period] = {
              epiBase,
              funnelSteps: traceFunnelSteps,
              eligible: eligiblePool,
              shareRaw: assetShareVal !== null ? assetShareVal : 0,
              nps: nps[assetKey4][period] ?? 0,
              activeStart: traceActiveStart,
              medianMonths: traceMedianMonths,
              pm: Math.max(0, tracePmVal),
              activeEnd: Math.max(0, traceActiveEnd),
              progRatePct: traceProgRatePct,
              progressingOut: traceProgressingOut,
              compliance, access, abandonment, vialsPerPM, vialsDispensed: Math.max(0, vialsDispensed), grossPrice, gtn, netPrice,
              iraApplied, iraDiscountApplied,
              ptrs: ptrs * 100,
              revenue: Math.max(0, rev),
            };
          }
        }
      }
    }
  }

  // ─── Derived geographies: RoE (from EU5) and RoW (from US) ──────────────────
  const eu5GeoIdx = geos.findIndex(g => g.toLowerCase() === "eu5");
  const usGeoIdx  = geos.findIndex(g => g.toLowerCase() === "us");

  // roeByLot / rowByLot: { [lotLabel]: { [period]: { nps, revenue } } }
  const roeByLot = {};
  const rowByLot = {};

  if (model.showRestOfEurope && eu5GeoIdx >= 0) {
    for (let l = 0; l < lots; l++) {
      const lotLabel = `${l + 1}L`;
      roeByLot[lotLabel] = {};
      for (const period of periods) {
        let srcNPS = 0, srcRev = 0;
        for (let s = 0; s < segs; s++) {
          srcNPS += nps[`${eu5GeoIdx}-${l}-${s}-0`]?.[period] ?? 0;
          srcRev += revenue[`${eu5GeoIdx}-${l}-${s}-0`]?.[period] ?? 0;
        }
        const npsF = parseFloat(String(model.roeAssumptions?.[period]?.nps ?? 0).replace(/,/g, "")) / 100;
        const revF = parseFloat(String(model.roeAssumptions?.[period]?.revenue ?? 0).replace(/,/g, "")) / 100;
        roeByLot[lotLabel][period] = { nps: srcNPS * (isNaN(npsF) ? 0 : npsF), revenue: srcRev * (isNaN(revF) ? 0 : revF) };
      }
    }
  }

  if (model.showRestOfWorld && usGeoIdx >= 0) {
    for (let l = 0; l < lots; l++) {
      const lotLabel = `${l + 1}L`;
      rowByLot[lotLabel] = {};
      for (const period of periods) {
        let srcNPS = 0, srcRev = 0;
        for (let s = 0; s < segs; s++) {
          srcNPS += nps[`${usGeoIdx}-${l}-${s}-0`]?.[period] ?? 0;
          srcRev += revenue[`${usGeoIdx}-${l}-${s}-0`]?.[period] ?? 0;
        }
        const npsF = parseFloat(String(model.rowAssumptions?.[period]?.nps ?? 0).replace(/,/g, "")) / 100;
        const revF = parseFloat(String(model.rowAssumptions?.[period]?.revenue ?? 0).replace(/,/g, "")) / 100;
        rowByLot[lotLabel][period] = { nps: srcNPS * (isNaN(npsF) ? 0 : npsF), revenue: srcRev * (isNaN(revF) ? 0 : revF) };
      }
    }
  }

  // ─── Aggregates ────────────────────────────────────────────────────────────
  const totalRevenue = {};
  const totalNPS = {};
  const totalPM = {};
  const totalVials = {};
  const revenueByLot = {};
  const revenueByGeo = {};

  for (const period of periods) {
    totalRevenue[period] = 0;
    totalNPS[period] = 0;
    totalPM[period] = 0;
    totalVials[period] = 0;
  }

  for (let l = 0; l < lots; l++) {
    const lotLabel = `${l + 1}L`;
    revenueByLot[lotLabel] = {};
    for (const period of periods) revenueByLot[lotLabel][period] = 0;
  }

  for (let g = 0; g < geos.length; g++) {
    const geoLabel = geos[g];
    revenueByGeo[geoLabel] = {};
    for (const period of periods) revenueByGeo[geoLabel][period] = 0;
  }

  for (const c of combos) {
    if (!c.isAsset) continue; // only asset combos for aggregates
    for (const period of periods) {
      const rev = revenue[c.key][period] ?? 0;
      const npsVal = nps[c.key][period] ?? 0;
      const pmVal = pm[c.key][period] ?? 0;
      totalRevenue[period] += rev;
      totalNPS[period] += npsVal;
      totalPM[period] += pmVal;
      totalVials[period] += vials[c.key]?.[period] ?? 0;
      revenueByLot[c.lotLabel][period] += rev;
      revenueByGeo[c.geoLabel][period] += rev;
    }
  }

  return {
    periods,
    years,
    combos,
    eligible,
    nps,
    pm,
    vials,
    revenue,
    progressing,
    totalRevenue,
    totalNPS,
    totalPM,
    totalVials,
    revenueByLot,
    revenueByGeo,
    traceData,
    roeByLot,
    rowByLot,
  };
}
