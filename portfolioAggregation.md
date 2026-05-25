# Portfolio Aggregation — Full Feature Documentation

> All changes described here are uncommitted as of the time of writing. This document covers every new file, every modified file, the full code used, and the reasoning behind each decision.

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [File Summary](#2-file-summary)
3. [New File: `src/utils/portfolioEngine.js`](#3-new-file-srcutilsportfolioengine)
4. [New File: `src/components/PortfolioAggregation/ModelSelector.jsx`](#4-new-file-srccomponentsportfolioaggregationmodelselectorjsx)
5. [New File: `src/components/PortfolioAggregation/PortfolioPage.jsx`](#5-new-file-srccomponentsportfolioaggregationportfoliopagejsx)
6. [New File: `backend/data/portfolios.json`](#6-new-file-backenddataporfoliosjson)
7. [Modified: `src/store/forecastStore.jsx`](#7-modified-srcstoreforecaststorejsx)
8. [Modified: `src/App.jsx`](#8-modified-srcappjsx)
9. [Modified: `src/components/Dashboard.jsx`](#9-modified-srccomponentsdashboardjsx)
10. [Modified: `backend/index.js`](#10-modified-backendindexjs)
11. [Data Flow & Architecture](#11-data-flow--architecture)
12. [API Endpoints](#12-api-endpoints)
13. [Key Design Decisions](#13-key-design-decisions)

---

## 1. Feature Overview

Portfolio Aggregation is a cross-model analytics view that runs the forecast engine on multiple models simultaneously and aggregates results into a single dashboard. Users can:

- **Select models + time horizon** on a dedicated setup page
- **View aggregated forecasts** for Patients (NPS), Vials Dispensed, and Revenue
- **Toggle Yearly / Monthly** granularity
- **Filter** results by Asset, Indication, Line of Therapy, and Geography using cascading (dependent) filters that automatically narrow options based on active selections
- **Bifurcate charts** with a primary "View by" dimension (Asset / Indication / Line / Geography / Aggregated) and an optional secondary "Split by" dimension (e.g. "Asset split by Geography" → series keys like `"Enhertu › US"`)
- **Toggle Revenue between PTRS-adjusted and unadjusted**
- **Save the full view state** (filters, dimensions, granularity, model selection) to the cloud with a name
- **Load saved views** from a card grid on the setup page; inline rename and delete each card

---

## 2. File Summary

| Status | File | Purpose |
|--------|------|---------|
| 🆕 New | `src/utils/portfolioEngine.js` | Pure JS aggregation engine — no React |
| 🆕 New | `src/components/PortfolioAggregation/ModelSelector.jsx` | Setup page: model selection + saved portfolio cards |
| 🆕 New | `src/components/PortfolioAggregation/PortfolioPage.jsx` | Main portfolio view: charts, filters, save |
| 🆕 New | `backend/data/portfolios.json` | Local JSON fallback store for saved portfolios |
| ✏️ Modified | `src/store/forecastStore.jsx` | Added `portfolioConfig` state + `setPortfolioConfig` |
| ✏️ Modified | `src/App.jsx` | Added `portfolio-select` and `portfolio` view routes |
| ✏️ Modified | `src/components/Dashboard.jsx` | Added "Portfolio Aggregation" button |
| ✏️ Modified | `backend/index.js` | Added 4 portfolio REST endpoints + file helpers |

---

## 3. New File: `src/utils/portfolioEngine.js`

Pure ES module. No React imports. Called from `PortfolioPage.jsx` inside `useMemo`.

### Purpose
Runs `runForecast(model)` for each selected model, normalises results to a flat array of `PortfolioCombo` objects (one per geo × lot × seg combination), and exposes utility functions for filtering, cascading options, and aggregation.

### Full Code

```js
// ─── Portfolio Aggregation Engine ────────────────────────────────────────────
import { runForecast } from "./forecastEngine.js";

// ─── Period helpers ───────────────────────────────────────────────────────────

/** Sum period data into yearly totals. Works for both "YYYY" and "YYYY-MM" keys. */
function aggregateToYears(periodData) {
  const result = {};
  for (const [period, val] of Object.entries(periodData)) {
    const year = period.split("-")[0];
    result[year] = (result[year] ?? 0) + (val ?? 0);
  }
  return result;
}

/** Expand yearly period data to monthly breakdown (value / 12 per month). */
function expandToMonthly(periodData) {
  const result = {};
  for (const [period, val] of Object.entries(periodData)) {
    if (period.includes("-")) {
      result[period] = val; // already monthly — pass through
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

/** Restrict period data to the [startYear, endYear] range. */
function filterByYearRange(periodData, startYear, endYear) {
  const result = {};
  for (const [period, val] of Object.entries(periodData)) {
    const year = parseInt(period.split("-")[0]);
    if (year >= startYear && year <= endYear) result[period] = val;
  }
  return result;
}

// ─── Main portfolio builder ───────────────────────────────────────────────────

/**
 * Run forecasts for selected models and return a flat list of PortfolioCombos.
 * Each PortfolioCombo = one (model × geo × lot × seg) asset combination.
 * Carries both yearly-aggregated and monthly data for every metric.
 *
 * @returns {{ yearList: string[], monthList: string[], allCombos: PortfolioCombo[] }}
 */
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
      if (!combo.isAsset) continue; // only asset product contributes revenue/vials

      const k4 = combo.key;
      const k3 = `${combo.geoIdx}-${combo.lotIdx}-${combo.segIdx}`;

      const npsRaw   = result.nps[k4]     ?? {};
      const vialsRaw = result.vials[k4]   ?? {};
      const revRaw   = result.revenue[k4] ?? {};

      // PTRS-unadjusted revenue: vialsDispensed × netPrice (before PTRS factor)
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

        // Yearly aggregated
        npsYearly:          aggregateToYears(npsF),
        vialsYearly:        aggregateToYears(vialsF),
        revenueYearly:      aggregateToYears(revF),
        revenueUnadjYearly: aggregateToYears(revUnadjF),

        // Monthly (native monthly OR yearly ÷12 expansion)
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

/**
 * Filter combos by active filter Sets.
 * Empty Set = no restriction (all pass).
 */
export function filterCombos(combos, activeFilters) {
  return combos.filter((c) => {
    if (activeFilters.assets?.size      > 0 && !activeFilters.assets.has(c.assetName))       return false;
    if (activeFilters.indications?.size > 0 && !activeFilters.indications.has(c.indication)) return false;
    if (activeFilters.lines?.size       > 0 && !activeFilters.lines.has(c.lotLabel))         return false;
    if (activeFilters.geographies?.size > 0 && !activeFilters.geographies.has(c.geoLabel))   return false;
    return true;
  });
}

/**
 * Cascading filter options: apply all filters EXCEPT the target dimension
 * so each filter's options narrow based on others without self-restricting.
 */
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

/**
 * Group and sum combo data by primary (+ optional secondary) dimension.
 * Secondary produces series keys like "Enhertu › US".
 *
 * @returns {{ [seriesKey: string]: { [period: string]: number } }}
 */
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

/**
 * Find peak period (highest cross-series total) → { value, period }.
 */
export function findPeak(grouped, periodList) {
  let peakVal = 0, peakPeriod = periodList[0] ?? null;
  for (const p of periodList) {
    const total = Object.values(grouped).reduce((s, series) => s + (series[p] ?? 0), 0);
    if (total > peakVal) { peakVal = total; peakPeriod = p; }
  }
  return { value: peakVal, period: peakPeriod };
}

/** Grand total across all series and all periods. */
export function sumAcrossPeriods(grouped) {
  let total = 0;
  for (const series of Object.values(grouped))
    for (const val of Object.values(series)) total += val ?? 0;
  return total;
}

/** @deprecated use findPeak() */
export function peakAcrossPeriods(grouped, periodList) {
  return findPeak(grouped, periodList).value;
}
```

### `PortfolioCombo` object shape

```js
{
  modelId, assetName, indication,
  geoLabel, lotLabel, segLabel,

  // Yearly totals (keys: "2025", "2026", …)
  npsYearly, vialsYearly, revenueYearly, revenueUnadjYearly,

  // Monthly values (keys: "2025-01", "2025-02", …)
  // For yearly-granularity models: each yearly value divided by 12 per month
  npsMonthly, vialsMonthly, revenueMonthly, revenueUnadjMonthly,
}
```

---

## 4. New File: `src/components/PortfolioAggregation/ModelSelector.jsx`

The setup / landing page for portfolio aggregation. Shown when `view === "portfolio-select"`.

### Responsibilities
- Fetch and display all saved portfolio views from `GET /api/portfolios` on mount
- Allow loading a saved view (reconstructs Sets from stored arrays, sets `portfolioConfig.initialViewState`)
- Allow inline renaming and deleting saved view cards
- Let the user select models + time period and start a new portfolio view

### Key sub-components & functions

#### `SavedPortfolioCard`
Renders one saved portfolio. Clicking the portfolio name activates an inline text input for renaming (saves on Enter or blur, cancels on Escape). The trash icon deletes with a spinner. The "Open" button calls `onLoad(portfolio)`.

```jsx
function SavedPortfolioCard({ portfolio, models, onLoad, onDelete, onRename }) {
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(portfolio.name);
  const [deleting, setDeleting] = useState(false);
  // ...
}
```

#### `handleLoadPortfolio`
Converts all stored plain arrays back to JavaScript `Set` objects before writing to context. This is necessary because `JSON.stringify` cannot serialise Sets, so they were stored as arrays.

```js
const handleLoadPortfolio = (portfolio) => {
  setPortfolioConfig({
    modelIds:  portfolio.modelIds,
    startYear: portfolio.startYear,
    endYear:   portfolio.endYear,
    initialViewState: {
      activeFilters: {
        assets:      new Set(portfolio.activeFilters?.assets      ?? []),
        indications: new Set(portfolio.activeFilters?.indications ?? []),
        lines:       new Set(portfolio.activeFilters?.lines       ?? []),
        geographies: new Set(portfolio.activeFilters?.geographies ?? []),
      },
      primaryDim:   portfolio.primaryDim   ?? "total",
      secondaryDim: portfolio.secondaryDim ?? "none",
      granularity:  portfolio.granularity  ?? "yearly",
      revenueType:  portfolio.revenueType  ?? "adjusted",
    },
  });
  setView("portfolio");
};
```

#### `handleDelete`
```js
const handleDelete = async (id) => {
  try {
    await fetch(`${API}/portfolios/${id}`, { method: "DELETE" });
    setSavedPortfolios((prev) => prev.filter((p) => p.id !== id));
  } catch (e) {
    console.error("Delete portfolio failed", e);
  }
};
```

#### `handleRename`
```js
const handleRename = async (id, name) => {
  try {
    const res = await fetch(`${API}/portfolios/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name }),
    });
    const updated = await res.json();
    setSavedPortfolios((prev) => prev.map((p) => (p.id === id ? updated : p)));
  } catch (e) {
    console.error("Rename portfolio failed", e);
  }
};
```

#### `handleProceed` (new portfolio)
```js
const handleProceed = () => {
  setPortfolioConfig({
    modelIds:  Array.from(selectedIds),
    startYear: parseInt(startYear),
    endYear:   parseInt(endYear),
  });
  setView("portfolio");
};
```

### Page layout structure
```
<header>  OncoCast › Portfolio Aggregation  |  [New Portfolio View →]
<main>
  <section>  Saved Portfolio Views  (card grid or empty state)
  <divider>  ── Configure New View ──
  <section>
    <col span-2>  Model checklist with select-all / clear
    <col span-1>  Start/End year dropdowns + selected model summary + CTA button
```

---

## 5. New File: `src/components/PortfolioAggregation/PortfolioPage.jsx`

Main aggregated forecast view. Shown when `view === "portfolio"`. Full `h-screen` sticky layout — sidebar and controls are fixed; only the 3 chart sections scroll.

### Local sub-components

#### `SaveModal`
Modal overlay for naming and saving a portfolio view to the cloud.

```jsx
function SaveModal({ defaultName, onSave, onCancel, saving, error }) {
  const [name, setName] = useState(defaultName ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-slate-100 font-semibold text-base mb-1">Save Portfolio View</h2>
        <p className="text-slate-500 text-xs mb-4">Give this configuration a name so you can reload it later.</p>
        <input
          autoFocus type="text" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }}
          placeholder="e.g. Breast Cancer Pipeline — US"
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm ..."
        />
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2.5">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={() => onSave(name.trim())} disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save Portfolio"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

#### `FilterSection`
Accordion panel for one filter dimension. Shows a count badge when items are selected, an "All" / "Clear" toggle in the header, and a checkbox list.

```jsx
function FilterSection({ title, options, selected, onToggle, onSelectAll }) {
  const [open, setOpen] = useState(true);
  const activeCount = options.filter((o) => selected.has(o)).length;
  const allSelected = options.length > 0 && activeCount === options.length;
  // Renders: header (title + badge + All/Clear button + chevron) + checkbox list
}
```

#### `ForecastSection`
Renders one metric (Patients / Vials / Revenue) with a chart/table toggle. Revenue sections also include the PTRS-adjusted / Unadjusted toggle.

- **Chart mode**: `BarChart` (yearly) or `LineChart` (monthly) via Recharts
- **Table mode**: sticky first column, per-period values, row totals, grand total footer row
- Sub-header shows: `Peak: $X in 2028 · Total: $Y`

```jsx
function ForecastSection({
  title, icon, grouped, periodList, granularity, formatter, colorMap,
  revenueToggle, revenueType, onRevenueTypeChange,
}) {
  const [viewMode, setViewMode] = useState("chart");
  const { value: peakVal, period: peakPeriod } = useMemo(
    () => findPeak(grouped, periodList), [grouped, periodList]
  );
  // Renders: section header (icon + title + peak/total + PTRS toggle + chart/table toggle)
  //          body: ResponsiveContainer chart OR scrollable table
}
```

### State initialisation from a saved portfolio

When `portfolioConfig.initialViewState` is present (set by `handleLoadPortfolio` in ModelSelector), all view controls are pre-seeded from it:

```js
const makeEmpty = () => ({ assets: new Set(), indications: new Set(), lines: new Set(), geographies: new Set() });

const initFilters = () => {
  const iv = portfolioConfig?.initialViewState;
  if (!iv?.activeFilters) return makeEmpty();
  return {
    assets:      iv.activeFilters.assets      instanceof Set ? iv.activeFilters.assets      : new Set(iv.activeFilters.assets      ?? []),
    indications: iv.activeFilters.indications instanceof Set ? iv.activeFilters.indications : new Set(iv.activeFilters.indications ?? []),
    lines:       iv.activeFilters.lines       instanceof Set ? iv.activeFilters.lines       : new Set(iv.activeFilters.lines       ?? []),
    geographies: iv.activeFilters.geographies instanceof Set ? iv.activeFilters.geographies : new Set(iv.activeFilters.geographies ?? []),
  };
};

const [activeFilters, setActiveFilters] = useState(initFilters);

const iv0 = portfolioConfig?.initialViewState;
const [granularity,  setGranularity]  = useState(iv0?.granularity  ?? "yearly");
const [primaryDim,   setPrimaryDim]   = useState(iv0?.primaryDim   ?? "total");
const [secondaryDim, setSecondaryDim] = useState(iv0?.secondaryDim ?? "none");
const [revenueType,  setRevenueType]  = useState(iv0?.revenueType  ?? "adjusted");
```

### `handleSave` — saving to cloud

Serialises `Set` objects to plain arrays, then POSTs to `POST /api/portfolios`. On success, shows a green toast for 3 seconds. Errors are shown inline inside the modal.

```js
const handleSave = useCallback(async (name) => {
  setSaving(true);
  setSaveError(null);
  try {
    const payload = {
      name,
      modelIds:  portfolioConfig.modelIds,
      startYear: portfolioConfig.startYear,
      endYear:   portfolioConfig.endYear,
      granularity,
      primaryDim,
      secondaryDim,
      revenueType,
      // Sets → plain arrays for JSON serialisation
      activeFilters: {
        assets:      [...activeFilters.assets],
        indications: [...activeFilters.indications],
        lines:       [...activeFilters.lines],
        geographies: [...activeFilters.geographies],
      },
      modelNames: models
        .filter((m) => portfolioConfig.modelIds.includes(m.id))
        .map((m) => m.assetName)
        .filter(Boolean),
    };

    const res = await fetch("http://localhost:3001/api/portfolios", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    setSaveSuccess(true);
    setSaveModalOpen(false);
    setTimeout(() => setSaveSuccess(false), 3000);
  } catch (err) {
    setSaveError(err.message);
  } finally {
    setSaving(false);
  }
}, [portfolioConfig, models, granularity, primaryDim, secondaryDim, revenueType, activeFilters]);
```

### Cascading filter logic

Options for each dimension are recomputed by applying all active filters **except** the target dimension, so selections in one filter narrow what's available in others without collapsing the currently viewed filter's own options:

```js
const filterOptions = useMemo(() => ({
  assets:      getDependentOptions(allCombos, "assets",      activeFilters),
  indications: getDependentOptions(allCombos, "indications", activeFilters),
  lines:       getDependentOptions(allCombos, "lines",       activeFilters),
  geographies: getDependentOptions(allCombos, "geographies", activeFilters),
}), [allCombos, activeFilters]);
```

Filters apply instantly on checkbox change — no "Apply" button:

```js
const toggleFilter = useCallback((dim, val) => {
  setActiveFilters((prev) => {
    const next = { ...prev, [dim]: new Set(prev[dim]) };
    next[dim].has(val) ? next[dim].delete(val) : next[dim].add(val);
    return next;
  });
}, []);

const setFilterValues = useCallback((dim, values) => {
  setActiveFilters((prev) => ({ ...prev, [dim]: new Set(values) }));
}, []);
```

### Dual-dimension aggregation + consistent colour map

A single `colorMap` is computed once from `filteredCombos` and shared across all 3 `ForecastSection` instances so colours are always consistent:

```js
const colorMap = useMemo(() => {
  const keys = new Set();
  for (const c of filteredCombos) {
    const primary = { asset: c.assetName, indication: c.indication, line: c.lotLabel, geography: c.geoLabel }[primaryDim];
    const key = (effectiveSecondary && effectiveSecondary !== "none")
      ? `${primary} › ${{ asset: c.assetName, indication: c.indication, line: c.lotLabel, geography: c.geoLabel }[effectiveSecondary]}`
      : (primaryDim === "total" ? "Total" : primary);
    if (key) keys.add(key);
  }
  const map = {};
  [...keys].sort().forEach((k, i) => { map[k] = SERIES_COLORS[i % SERIES_COLORS.length]; });
  return map;
}, [filteredCombos, primaryDim, secondaryDim]);
```

### Summary cards (peak values)

Three cards at the top of the fixed controls panel show peak-period value (not a cumulative total):

```js
const peakRevenue = useMemo(() => findPeak(revenueGrouped, periodList), [revenueGrouped, periodList]);
const peakNPS     = useMemo(() => findPeak(npsGrouped,     periodList), [npsGrouped,     periodList]);
const peakVials   = useMemo(() => findPeak(vialsGrouped,   periodList), [vialsGrouped,   periodList]);
```

Each card shows: large number value + period label (year or month name) + descriptor.

### Layout skeleton

```
<div class="h-screen flex flex-col overflow-hidden">
  {saveModalOpen && <SaveModal />}
  {saveSuccess  && <toast fixed bottom-right />}

  <header class="shrink-0">          ← fixed: breadcrumb + Yearly/Monthly + Save Portfolio + Edit Selection
  <div class="flex flex-1 overflow-hidden">
    <aside class="w-52 shrink-0">   ← fixed sidebar: filter accordions (scroll independently)
    <div class="flex-1 flex flex-col overflow-hidden">
      <div class="shrink-0">         ← fixed: View by / Split by pill selectors + 3 peak cards
      <div class="flex-1 overflow-y-auto">  ← scrollable: 3 × ForecastSection
```

---

## 6. New File: `backend/data/portfolios.json`

Local JSON fallback when MongoDB Atlas is unavailable.

```json
[]
```

Created as an empty array. Populated automatically by the backend on the first `POST /api/portfolios` call.

---

## 7. Modified: `src/store/forecastStore.jsx`

### What changed
Added `portfolioConfig` state to global context so both `ModelSelector` and `PortfolioPage` can share it.

### Diff

```js
// Added inside ForecastProvider:
const [portfolioConfig, setPortfolioConfig] = useState(null); // { modelIds, startYear, endYear, initialViewState? }

// Added to context value object:
portfolioConfig, setPortfolioConfig,
```

### `portfolioConfig` shape

```js
{
  modelIds:  string[],     // IDs of selected models
  startYear: number,
  endYear:   number,
  // Only present when loading a saved portfolio:
  initialViewState?: {
    activeFilters: {
      assets:      Set<string>,
      indications: Set<string>,
      lines:       Set<string>,
      geographies: Set<string>,
    },
    primaryDim:   "total" | "asset" | "indication" | "line" | "geography",
    secondaryDim: "none"  | "asset" | "indication" | "line" | "geography",
    granularity:  "yearly" | "monthly",
    revenueType:  "adjusted" | "unadjusted",
  }
}
```

---

## 8. Modified: `src/App.jsx`

### What changed
Added imports and two new view routes.

### Diff

```jsx
// Imports added:
import ModelSelector from "./components/PortfolioAggregation/ModelSelector";
import PortfolioPage from "./components/PortfolioAggregation/PortfolioPage";

// Routes added in AppRouter:
if (view === "portfolio-select")  return <ModelSelector />;
if (view === "portfolio")         return <PortfolioPage />;
```

---

## 9. Modified: `src/components/Dashboard.jsx`

### What changed
Added a "Portfolio Aggregation" button to the Dashboard header, to the left of the existing "New Forecast Model" button. Disabled when no models exist.

### Code added

```jsx
<button
  onClick={() => setView("portfolio-select")}
  disabled={models.length === 0}
  title={
    models.length === 0
      ? "Create at least one forecast model first"
      : "Aggregate and compare all forecast models"
  }
  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700"
>
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"
    />
  </svg>
  Portfolio Aggregation
</button>
```

---

## 10. Modified: `backend/index.js`

### What changed
Added local file path constant, two helper functions, and four REST endpoints for portfolio CRUD. All endpoints try MongoDB Atlas first and fall back to local JSON.

### New constants and helpers

```js
const PORTFOLIO_FILE = path.join(__dirname, "data", "portfolios.json");

function readPortfolios() {
  if (!fs.existsSync(PORTFOLIO_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, "utf-8")); }
  catch { return []; }
}

function writePortfolios(list) {
  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(list, null, 2), "utf-8");
}
```

### `GET /api/portfolios` — list all saved portfolios

Tries MongoDB Atlas (sorted by `updatedAt` descending), maps `_localId` → `id`, falls back to local JSON on any error.

```js
app.get("/api/portfolios", async (req, res) => {
  const db = getDb();
  if (db) {
    try {
      const docs = await db.collection("portfolios").find({}).sort({ updatedAt: -1 }).toArray();
      return res.json(docs.map((d) => ({ ...d, id: d._localId ?? String(d._id) })));
    } catch (err) {
      console.error("Portfolio list cloud error:", err.message);
    }
  }
  res.json(readPortfolios());
});
```

### `POST /api/portfolios` — save new portfolio

Generates a unique `id` and timestamps, then writes to both MongoDB and local JSON.

```js
app.post("/api/portfolios", async (req, res) => {
  const portfolio = {
    ...req.body,
    id: `pf${Date.now()}`,
    createdAt: new Date().toISOString().split("T")[0],
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  if (db) {
    try {
      await db.collection("portfolios").insertOne({ ...portfolio, _localId: portfolio.id });
    } catch (err) {
      console.error("Portfolio cloud save error:", err.message);
    }
  }

  const list = readPortfolios();
  list.unshift(portfolio);
  writePortfolios(list);
  res.status(201).json(portfolio);
});
```

### `PATCH /api/portfolios/:id` — rename portfolio

Updates `name` and `updatedAt` in both stores.

```js
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
    } catch (err) {
      console.error("Portfolio cloud rename error:", err.message);
    }
  }

  res.json(list[idx]);
});
```

### `DELETE /api/portfolios/:id` — delete portfolio

Removes from both local JSON and MongoDB Atlas.

```js
app.delete("/api/portfolios/:id", async (req, res) => {
  const list     = readPortfolios();
  const filtered = list.filter((p) => p.id !== req.params.id);
  if (filtered.length === list.length)
    return res.status(404).json({ error: "Portfolio not found" });
  writePortfolios(filtered);

  const db = getDb();
  if (db) {
    try {
      await db.collection("portfolios").deleteOne({ _localId: req.params.id });
    } catch (err) {
      console.error("Portfolio cloud delete error:", err.message);
    }
  }

  res.json({ success: true });
});
```

---

## 11. Data Flow & Architecture

```
Dashboard
  └─ [Portfolio Aggregation button]
        │
        ▼
  ModelSelector  (view = "portfolio-select")
  ├── useEffect → GET /api/portfolios → renders SavedPortfolioCard[]
  ├── [Open]  → handleLoadPortfolio → setPortfolioConfig({ ..., initialViewState })
  │                                  → setView("portfolio")
  └── [New Portfolio View] → handleProceed → setPortfolioConfig({ modelIds, startYear, endYear })
                                            → setView("portfolio")

  PortfolioPage  (view = "portfolio")
  ├── useMemo → buildPortfolio(models, modelIds, startYear, endYear)
  │              └── runForecast(model) per model
  │              └── flatten to PortfolioCombo[]
  │
  ├── useState: activeFilters (Set × 4), granularity, primaryDim, secondaryDim, revenueType
  │   └── if portfolioConfig.initialViewState → initialised from saved state
  │
  ├── useMemo → getDependentOptions → filterOptions (cascading)
  ├── useMemo → filterCombos        → filteredCombos
  ├── useMemo → aggregateByDimension → npsGrouped, vialsGrouped, revenueGrouped
  ├── useMemo → findPeak            → peakRevenue, peakNPS, peakVials
  │
  ├── [Save Portfolio] → SaveModal → handleSave
  │                                  └── POST /api/portfolios (Sets serialised to arrays)
  │                                  └── success toast (3s)
  │
  └── renders: sidebar filters + peak cards + 3 × ForecastSection
```

### MongoDB document shape (portfolios collection)

```js
{
  _id:         ObjectId,        // MongoDB-assigned
  _localId:    "pf1748123456789", // matches the local id field
  id:          "pf1748123456789",
  name:        "Breast Cancer Pipeline — US",
  modelIds:    ["m1748100000001", "m1748100000002"],
  modelNames:  ["Enhertu", "Dato-DXd"],
  startYear:   2025,
  endYear:     2030,
  granularity: "yearly",
  primaryDim:  "asset",
  secondaryDim:"geography",
  revenueType: "adjusted",
  activeFilters: {
    assets:      ["Enhertu"],
    indications: [],
    lines:       ["1L", "2L"],
    geographies: ["US"],
  },
  createdAt:   "2026-05-25",
  updatedAt:   "2026-05-25T10:30:00.000Z",
  cloudSavedAt: "2026-05-25T10:30:00.000Z",
}
```

---

## 12. API Endpoints

| Method | Path | Description | Body | Response |
|--------|------|-------------|------|----------|
| `GET` | `/api/portfolios` | List all saved portfolios (MongoDB → local fallback) | — | `Portfolio[]` |
| `POST` | `/api/portfolios` | Save new portfolio view | Portfolio payload | `Portfolio` (201) |
| `PATCH` | `/api/portfolios/:id` | Rename a portfolio | `{ name }` | Updated `Portfolio` |
| `DELETE` | `/api/portfolios/:id` | Delete a portfolio | — | `{ success: true }` |

---

## 13. Key Design Decisions

### Why cascading (dependent) filters?
Each filter's available options are computed by applying ALL other active filters, but not the target dimension itself. This prevents a filter from collapsing its own options while still correctly narrowing every other dimension. Implemented in `getDependentOptions`.

### Why instant filtering (no Apply button)?
Every checkbox change immediately updates `activeFilters` state, which triggers the `useMemo` chain (`filteredCombos` → `npsGrouped` / `vialsGrouped` / `revenueGrouped`). The computation is synchronous and fast enough for the dataset sizes typical in this application.

### Why store `Sets` as arrays in the database?
`JSON.stringify(new Set())` produces `"{}"` — Sets are not JSON-serialisable. They are spread into arrays (`[...set]`) before the `POST` body is sent, and reconstructed as `new Set(array)` when loading in `handleLoadPortfolio`.

### Why `h-screen flex flex-col overflow-hidden` layout?
The sidebar filters, header, and view controls must remain visible at all times while the 3 forecast charts scroll. Using `h-screen` on the root with `shrink-0` on all fixed regions and `flex-1 overflow-y-auto` on the charts container achieves this without any `position: sticky` hacks.

### Why peak values instead of totals on summary cards?
Total revenue / patients / vials over a 5–10 year period is less actionable than knowing the peak year's value, which directly corresponds to what the model shows at maximum uptake. Peak is calculated by `findPeak(grouped, periodList)` which sums across all series for each period and returns the single period with the highest aggregate.

### Why `revenueUnadj` stored separately in `PortfolioCombo`?
The forecast engine's `revenue` field already applies the PTRS factor (`revenue = vialsDispensed × netPrice × ptrs`). To support the "Unadjusted" toggle, the PTRS-free value is recomputed directly from `traceData` (`vialsDispensed × netPrice`) during `buildPortfolio` and stored as `revenueUnadjYearly` / `revenueUnadjMonthly`.

### Why a single `colorMap` shared across all 3 charts?
If each `ForecastSection` computed its own colours independently, the same series key (e.g. "Enhertu") could get different colours in the Patients chart vs the Revenue chart. One map computed from `filteredCombos` + `primaryDim` + `secondaryDim` is passed as a prop to all three sections.

### Why dual-dim secondary uses `"none"` string instead of `null`?
`null` is a valid falsy value but can cause ambiguity in equality checks and JSON round-trips. Using the explicit string `"none"` as the "off" sentinel keeps the logic (`secondaryDim !== "none"`) unambiguous and survives serialisation to/from the database.
