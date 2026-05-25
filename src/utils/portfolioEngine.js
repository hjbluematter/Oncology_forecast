// ─── Portfolio Aggregation Engine ────────────────────────────────────────────
import { runForecast } from "./forecastEngine.js";

// ─── Period helpers ───────────────────────────────────────────────────────────

function aggregateToYears(periodData) {
  const result = {};
  for (const [period, val] of Object.entries(periodData)) {
    const year = period.split("-")[0];
    result[year] = (result[year] ?? 0) + (val ?? 0);
  }
  return result;
}

function expandToMonthly(periodData) {
  const result = {};
  for (const [period, val] of Object.entries(periodData)) {
    if (period.includes("-")) {
      result[period] = val;
    } else {
      const year = parseInt(period);
      for (let m = 1; m <= 12; m++) {
        const key = `${year}-${String(m).padStart(2, "0")}`;
        result[key] = (val ?? 0) / 12;
      }
    }
  }
  return result;
}

function filterByYearRange(periodData, startYear, endYear) {
  const result = {};
  for (const [period, val] of Object.entries(periodData)) {
    const year = parseInt(period.split("-")[0]);
    if (year >= startYear && year <= endYear) result[period] = val;
  }
  return result;
}

// ─── Main portfolio builder ───────────────────────────────────────────────────

export function buildPortfolio(models, selectedModelIds, startYear, endYear) {
  const selectedModels = models.filter((m) => selectedModelIds.includes(m.id));

  const yearList = [];
  for (let y = startYear; y <= endYear; y++) yearList.push(String(y));

  const monthList = [];
  for (let y = startYear; y <= endYear; y++)
    for (let m = 1; m <= 12; m++)
      monthList.push(`${y}-${String(m).padStart(2, "0")}`);

  const allCombos = [];

  for (const model of selectedModels) {
    let result;
    try { result = runForecast(model); }
    catch (e) { console.error(`Portfolio: forecast failed for ${model.id}:`, e); continue; }

    const isMonthly = model.granularity === "Monthly";

    for (const combo of result.combos) {
      if (!combo.isAsset) continue;

      const k4 = combo.key;
      const k3 = `${combo.geoIdx}-${combo.lotIdx}-${combo.segIdx}`;

      const npsRaw   = result.nps[k4]     ?? {};
      const vialsRaw = result.vials[k4]   ?? {};
      const revRaw   = result.revenue[k4] ?? {};

      const revUnadjRaw = {};
      const trace = result.traceData[k3] ?? {};
      for (const [period, t] of Object.entries(trace))
        revUnadjRaw[period] = (t.vialsDispensed ?? 0) * (t.netPrice ?? 0);

      const npsF      = filterByYearRange(npsRaw,      startYear, endYear);
      const vialsF    = filterByYearRange(vialsRaw,    startYear, endYear);
      const revF      = filterByYearRange(revRaw,      startYear, endYear);
      const revUnadjF = filterByYearRange(revUnadjRaw, startYear, endYear);

      allCombos.push({
        modelId:    model.id,
        assetName:  model.assetName,
        indication: model.indication,
        geoLabel:   combo.geoLabel,
        lotLabel:   combo.lotLabel,
        segLabel:   combo.segLabel,

        npsYearly:          aggregateToYears(npsF),
        vialsYearly:        aggregateToYears(vialsF),
        revenueYearly:      aggregateToYears(revF),
        revenueUnadjYearly: aggregateToYears(revUnadjF),

        npsMonthly:          isMonthly ? npsF      : expandToMonthly(npsF),
        vialsMonthly:        isMonthly ? vialsF    : expandToMonthly(vialsF),
        revenueMonthly:      isMonthly ? revF      : expandToMonthly(revF),
        revenueUnadjMonthly: isMonthly ? revUnadjF : expandToMonthly(revUnadjF),
      });
    }
  }

  return { yearList, monthList, allCombos };
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export function filterCombos(combos, activeFilters) {
  return combos.filter((c) => {
    if (activeFilters.assets?.size      > 0 && !activeFilters.assets.has(c.assetName))       return false;
    if (activeFilters.indications?.size > 0 && !activeFilters.indications.has(c.indication)) return false;
    if (activeFilters.lines?.size       > 0 && !activeFilters.lines.has(c.lotLabel))         return false;
    if (activeFilters.geographies?.size > 0 && !activeFilters.geographies.has(c.geoLabel))   return false;
    return true;
  });
}

export function getDependentOptions(allCombos, dimension, activeFilters) {
  const otherFilters = { ...activeFilters, [dimension]: new Set() };
  const eligible = filterCombos(allCombos, otherFilters);
  switch (dimension) {
    case "assets":      return [...new Set(eligible.map((c) => c.assetName))].sort();
    case "indications": return [...new Set(eligible.map((c) => c.indication))].sort();
    case "lines":       return [...new Set(eligible.map((c) => c.lotLabel))].sort((a, b) => parseInt(a) - parseInt(b));
    case "geographies": return [...new Set(eligible.map((c) => c.geoLabel))].sort();
    default:            return [];
  }
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function dimValue(combo, dim) {
  switch (dim) {
    case "asset":      return combo.assetName;
    case "indication": return combo.indication;
    case "line":       return combo.lotLabel;
    case "geography":  return combo.geoLabel;
    default:           return "Total";
  }
}

export function aggregateByDimension(combos, primaryDim, secondaryDim, granularity, metric, periodList) {
  const suffix   = granularity === "monthly" ? "Monthly" : "Yearly";
  const fieldKey = `${metric}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
  const hasSecondary = secondaryDim && secondaryDim !== "none";

  const getKey = (combo) => {
    const primary = dimValue(combo, primaryDim);
    if (!hasSecondary) return primary;
    return `${primary} › ${dimValue(combo, secondaryDim)}`;
  };

  const grouped = {};
  for (const combo of combos) {
    const key = getKey(combo);
    if (!grouped[key]) { grouped[key] = {}; for (const p of periodList) grouped[key][p] = 0; }
    const data = combo[fieldKey] ?? {};
    for (const p of periodList) grouped[key][p] = (grouped[key][p] ?? 0) + (data[p] ?? 0);
  }
  return grouped;
}

export function findPeak(grouped, periodList) {
  let peakVal = 0, peakPeriod = periodList[0] ?? null;
  for (const p of periodList) {
    const total = Object.values(grouped).reduce((s, series) => s + (series[p] ?? 0), 0);
    if (total > peakVal) { peakVal = total; peakPeriod = p; }
  }
  return { value: peakVal, period: peakPeriod };
}

export function sumAcrossPeriods(grouped) {
  let total = 0;
  for (const series of Object.values(grouped))
    for (const val of Object.values(series)) total += val ?? 0;
  return total;
}
