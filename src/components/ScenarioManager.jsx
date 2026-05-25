// ─── Scenario Manager ──────────────────────────────────────────────────────────
// Self-contained scenario management module. Scenarios are stored in
// model.scenarios[] and persisted via PATCH to the backend.
//
// Key design: ScenarioAssumptionsWrapper re-provides ForecastContext with an
// overridden updateModel() so all existing assumption components save into
// scenario.assumptions without any changes to those components.

import { useState, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
  Cell, ReferenceLine,
} from "recharts";
import { ForecastContext, useForecast } from "../store/forecastStore";
import { runForecast } from "../utils/forecastEngine";
import { buildCombos, ComboFilter, filterCombos } from "./assumptions/shared";
import { apiFetch } from "../utils/apiFetch";
import EpiAssumptions from "./assumptions/EpiAssumptions";
import FunnelCutAssumptions from "./assumptions/FunnelCutAssumptions";
import MarketShareAssumptions from "./assumptions/MarketShareAssumptions";
import PersistencyAssumptions from "./assumptions/PersistencyAssumptions";
import ProgressionAssumptions from "./assumptions/ProgressionAssumptions";
import OperationalAssumptions from "./assumptions/OperationalAssumptions";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRevenue(v) {
  if (!v && v !== 0) return "$0";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function fmtDelta(v) {
  if (!v && v !== 0) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${fmtRevenue(v)}`;
}

function fmtPct(v) {
  if (!v && v !== 0) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function genId() {
  return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Deep-clone the assumption fields from a base model to initialize a new scenario
function cloneBaseAssumptions(baseModel) {
  const keys = [
    "epiAssumptions",
    "funnelCutValues",
    "marketShareAssumptions",
    "persistencyAssumptions",
    "progressionAssumptions",
    "operationalAssumptions",
  ];
  const out = {};
  for (const k of keys) {
    if (baseModel[k] !== undefined) {
      out[k] = JSON.parse(JSON.stringify(baseModel[k]));
    }
  }
  return out;
}

// Build total revenue from a runForecast result
function totalRev(results) {
  return Object.values(results.totalRevenue ?? {}).reduce((s, v) => s + v, 0);
}

// Aggregate revenue by (geo, lot, seg) 3-part key
function revenueByCombo3(results) {
  const out = {};
  for (const [key4, periodMap] of Object.entries(results.revenue ?? {})) {
    const parts = key4.split("-"); // g-l-s-p
    if (parts.length < 4) continue;
    const [g, l, s, p] = parts;
    if (p !== "0") continue; // asset only
    const key3 = `${g}-${l}-${s}`;
    out[key3] = (out[key3] ?? 0) + Object.values(periodMap).reduce((a, b) => a + b, 0);
  }
  return out;
}

// Build combo label from model + "g-l-s" key
function comboLabel(model, key3) {
  const [gi, li, si] = key3.split("-").map(Number);
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const parts = [];
  if (geos.length > 1) parts.push(geos[gi]);
  parts.push(`${li + 1}L`);
  const segName = model.segmentNames?.[si] || (model.segments > 1 ? `Seg ${si + 1}` : null);
  if (segName && model.segments > 1) parts.push(segName);
  return parts.join(" / ") || "All";
}

// ─── Context wrapper for scenario assumption editing ──────────────────────────
// Re-provides ForecastContext with activeModel = scenarioModel and an overridden
// updateModel that writes into scenario.assumptions instead of the global store.

function ScenarioAssumptionsWrapper({ baseModel, scenarioAssumptions, onChange, children }) {
  const realCtx = useForecast();

  const scenarioModel = useMemo(
    () => ({ ...baseModel, ...scenarioAssumptions }),
    [baseModel, scenarioAssumptions]
  );

  const overriddenCtx = useMemo(() => ({
    ...realCtx,
    activeModel: scenarioModel,
    updateModel: (_id, patch) => {
      onChange({ ...scenarioAssumptions, ...patch });
    },
  }), [realCtx, scenarioModel, scenarioAssumptions, onChange]);

  return (
    <ForecastContext.Provider value={overriddenCtx}>
      {children}
    </ForecastContext.Provider>
  );
}

// ─── Assumption sections (same as AssumptionsTab in ModelDetail) ──────────────

function ScenarioAssumptionsTab({ baseModel, scenarioAssumptions, onChange }) {
  const scenarioModel = useMemo(
    () => ({ ...baseModel, ...scenarioAssumptions }),
    [baseModel, scenarioAssumptions]
  );
  const allCombos = buildCombos(scenarioModel);
  const [filterState, setFilterState] = useState(null);
  const visibleKeys = filterState
    ? filterCombos(allCombos, filterState)
    : new Set(allCombos.map(c => c.key));

  return (
    <ScenarioAssumptionsWrapper
      baseModel={baseModel}
      scenarioAssumptions={scenarioAssumptions}
      onChange={onChange}
    >
      <div className="space-y-4">
        <div className="bg-amber-950/30 border border-amber-700/40 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-amber-300 text-xs">Changes here apply only to this scenario — the base model is unchanged.</p>
        </div>

        <ComboFilter combos={allCombos} onChange={setFilterState} />

        <ScenarioSection title="Epidemiology" subtitle={`${scenarioModel.epiType} — starting patient pool`} epiIcon>
          <EpiAssumptions model={scenarioModel} visibleKeys={visibleKeys} />
        </ScenarioSection>

        <ScenarioSection title="Biomarker & Funnel Rates" subtitle="Period-by-period funnel cut values" funnelIcon>
          <FunnelCutAssumptions model={scenarioModel} visibleKeys={visibleKeys} />
        </ScenarioSection>

        <ScenarioSection title="Market Share" subtitle="Share per product, LoT, and segment" shareIcon>
          <MarketShareAssumptions model={scenarioModel} visibleKeys={visibleKeys} />
        </ScenarioSection>

        {(scenarioModel.epiType ?? "Incidence") === "Incidence" && (
          <ScenarioSection title="Persistency (DoT)" subtitle="Median months on therapy per product">
            <PersistencyAssumptions model={scenarioModel} visibleKeys={visibleKeys} />
          </ScenarioSection>
        )}

        {scenarioModel.modelType === "Patient Flow" && (scenarioModel.linesOfTherapy ?? 1) > 1 && (
          <ScenarioSection title="Progression Rates" subtitle="% of patients progressing to next line">
            <ProgressionAssumptions model={scenarioModel} visibleKeys={visibleKeys} />
          </ScenarioSection>
        )}

        <ScenarioSection title="Operational Assumptions" subtitle="Compliance · Access · Price · GTN · PTRS">
          <OperationalAssumptions model={scenarioModel} visibleKeys={visibleKeys} />
        </ScenarioSection>
      </div>
    </ScenarioAssumptionsWrapper>
  );
}

function ScenarioSection({ title, subtitle, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/40 transition-colors"
      >
        <div>
          <p className="text-slate-200 text-sm font-medium">{title}</p>
          <p className="text-slate-500 text-xs">{subtitle}</p>
        </div>
        <svg className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="border-t border-slate-800">{children}</div>}
    </div>
  );
}

// ─── Comparison view ──────────────────────────────────────────────────────────

const CHART_COLORS = { base: "#6366f1", scenario: "#06b6d4" };

// Assumption drivers for waterfall — each swaps ONE group from base→scenario
function buildWaterfallDrivers(scenAssumptions) {
  const ops = scenAssumptions.operationalAssumptions ?? {};
  return [
    { key: "epi",         label: "Epidemiology",   getPatch: () => ({ epiAssumptions: scenAssumptions.epiAssumptions }) },
    { key: "funnel",      label: "Funnel Cuts",     getPatch: () => ({ funnelCutValues: scenAssumptions.funnelCutValues }) },
    { key: "marketShare", label: "Market Share",    getPatch: () => ({ marketShareAssumptions: scenAssumptions.marketShareAssumptions }) },
    { key: "persistency", label: "Persistency",     getPatch: () => ({ persistencyAssumptions: scenAssumptions.persistencyAssumptions }) },
    { key: "progression", label: "Progression",     getPatch: () => ({ progressionAssumptions: scenAssumptions.progressionAssumptions }) },
    { key: "compliance",  label: "Compliance",      getPatch: (base) => ({ operationalAssumptions: { ...(base.operationalAssumptions ?? {}), compliance:  ops.compliance  } }) },
    { key: "access",      label: "Access",          getPatch: (base) => ({ operationalAssumptions: { ...(base.operationalAssumptions ?? {}), access:      ops.access      } }) },
    { key: "abandonment", label: "Abandonment",     getPatch: (base) => ({ operationalAssumptions: { ...(base.operationalAssumptions ?? {}), abandonment: ops.abandonment } }) },
    { key: "vials",       label: "Vials/PM",        getPatch: (base) => ({ operationalAssumptions: { ...(base.operationalAssumptions ?? {}), vials:       ops.vials       } }) },
    { key: "price",       label: "Gross Price",     getPatch: (base) => ({ operationalAssumptions: { ...(base.operationalAssumptions ?? {}), grossPrice:  ops.grossPrice  } }) },
    { key: "gtn",         label: "GTN",             getPatch: (base) => ({ operationalAssumptions: { ...(base.operationalAssumptions ?? {}), gtn:         ops.gtn         } }) },
    { key: "ptrs",        label: "PTRS",            getPatch: (base) => ({ operationalAssumptions: { ...(base.operationalAssumptions ?? {}), ptrs:        ops.ptrs        }, applyPTRS: scenAssumptions.applyPTRS, ptrsValue: scenAssumptions.ptrsValue }) },
    { key: "ira",         label: "IRA Discount",    getPatch: () => ({ applyIRA: scenAssumptions.applyIRA, iraYear: scenAssumptions.iraYear, iraDiscountRate: scenAssumptions.iraDiscountRate, iraSmallMolecule: scenAssumptions.iraSmallMolecule }) },
  ];
}

function ComparisonView({ baseModel, scenario }) {
  const [baseResults, setBaseResults] = useState(null);
  const [scResults, setScResults] = useState(null);
  const [isolatedResults, setIsolatedResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  function handleRun() {
    setLoading(true);
    setError(null);
    setTimeout(() => {
      try {
        const scenarioModel = { ...baseModel, ...scenario.assumptions };
        const br = runForecast(baseModel);
        const sr = runForecast(scenarioModel);
        setBaseResults(br);
        setScResults(sr);

        // Compute isolated single-swap forecasts for waterfall attribution
        const drivers = buildWaterfallDrivers(scenario.assumptions);
        const isolated = drivers.map(d => {
          try {
            const patch = d.getPatch(baseModel);
            const r = runForecast({ ...baseModel, ...patch });
            return { key: d.key, label: d.label, results: r };
          } catch {
            return { key: d.key, label: d.label, results: null };
          }
        });
        setIsolatedResults(isolated);

        setLastRun(new Date().toLocaleTimeString());
      } catch (e) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    }, 0);
  }

  const baseTotalRev  = baseResults ? totalRev(baseResults) : null;
  const scTotalRev    = scResults   ? totalRev(scResults)   : null;
  const delta         = baseTotalRev !== null && scTotalRev !== null ? scTotalRev - baseTotalRev : null;
  const deltaPct      = baseTotalRev ? ((delta / baseTotalRev) * 100) : null;

  // Build chart data
  const chartData = useMemo(() => {
    if (!baseResults || !scResults) return [];
    const isMonthly = baseModel.granularity === "Monthly";
    if (!isMonthly) {
      return baseResults.periods.map(p => ({
        period: p,
        Base: (baseResults.totalRevenue[p] ?? 0) / 1_000_000,
        Scenario: (scResults.totalRevenue[p] ?? 0) / 1_000_000,
      }));
    }
    const byYear = {};
    for (const p of baseResults.periods) {
      const y = p.split("-")[0];
      if (!byYear[y]) byYear[y] = { period: y, Base: 0, Scenario: 0 };
      byYear[y].Base     += (baseResults.totalRevenue[p] ?? 0) / 1_000_000;
      byYear[y].Scenario += (scResults.totalRevenue[p] ?? 0) / 1_000_000;
    }
    return Object.values(byYear);
  }, [baseResults, scResults]);

  // Build combo comparison rows
  const comboRows = useMemo(() => {
    if (!baseResults || !scResults) return [];
    const baseByCombo = revenueByCombo3(baseResults);
    const scByCombo   = revenueByCombo3(scResults);
    const allKeys = new Set([...Object.keys(baseByCombo), ...Object.keys(scByCombo)]);
    return Array.from(allKeys).map(key3 => {
      const bv = baseByCombo[key3] ?? 0;
      const sv = scByCombo[key3]   ?? 0;
      const d  = sv - bv;
      const dp = bv ? (d / bv) * 100 : null;
      return { key3, label: comboLabel(baseModel, key3), base: bv, scenario: sv, delta: d, deltaPct: dp };
    });
  }, [baseResults, scResults]);

  // LOT-level summary
  const lotRows = useMemo(() => {
    if (!baseResults || !scResults) return [];
    const lots = baseModel.linesOfTherapy ?? 1;
    return Array.from({ length: lots }, (_, li) => {
      const ll = `${li + 1}L`;
      const bv = Object.values(baseResults.revenueByLot[ll] ?? {}).reduce((a, b) => a + b, 0);
      const sv = Object.values(scResults.revenueByLot[ll]  ?? {}).reduce((a, b) => a + b, 0);
      const d  = sv - bv;
      const dp = bv ? (d / bv) * 100 : null;
      return { label: ll, base: bv, scenario: sv, delta: d, deltaPct: dp };
    });
  }, [baseResults, scResults]);

  return (
    <div className="space-y-6">
      {/* Run bar */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleRun}
          disabled={loading}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
          )}
          {loading ? "Running…" : "Run Comparison"}
        </button>
        {lastRun && !loading && <span className="text-slate-500 text-xs">Last run: {lastRun}</span>}
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl px-5 py-4">
          <p className="text-red-400 text-sm font-medium">Error running forecast</p>
          <p className="text-red-300 text-xs mt-1 font-mono">{error}</p>
        </div>
      )}

      {baseResults && scResults && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <CompCard label="Base Revenue" value={fmtRevenue(baseTotalRev)} accent="indigo" />
            <CompCard label={`${scenario.name} Revenue`} value={fmtRevenue(scTotalRev)} accent="cyan" />
            <CompCard
              label="Absolute Delta"
              value={fmtDelta(delta)}
              accent={delta >= 0 ? "emerald" : "red"}
            />
            <CompCard
              label="% Change"
              value={deltaPct !== null ? fmtPct(deltaPct) : "—"}
              accent={deltaPct >= 0 ? "emerald" : "red"}
            />
          </div>

          {/* Revenue chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-slate-200 text-sm font-medium">Revenue Comparison Over Time</p>
                <p className="text-slate-500 text-xs mt-0.5">Total revenue · $M · grouped by period</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-indigo-500" /> Base</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-cyan-500" /> {scenario.name}</span>
              </div>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="period" tick={{ fill: "#334155", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#334155", fontSize: 11 }} tickFormatter={v => `$${v.toFixed(1)}M`} />
                  <Tooltip content={<CompTooltip />} />
                  <Bar dataKey="Base"     fill={CHART_COLORS.base}     radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Scenario" name={scenario.name} fill={CHART_COLORS.scenario} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* LOT breakdown */}
          {lotRows.length > 1 && (
            <CompTable title="Revenue by Line of Therapy" rows={lotRows} scenarioName={scenario.name} />
          )}

          {/* Combo breakdown */}
          <CompTable title="Revenue by Combination" subtitle="Asset only · aggregated across all periods" rows={comboRows} scenarioName={scenario.name} />

          {/* Waterfall attribution */}
          <WaterfallSection
            baseModel={baseModel}
            scenario={scenario}
            baseResults={baseResults}
            scResults={scResults}
            isolatedResults={isolatedResults}
          />
        </>
      )}

      {!baseResults && !loading && (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="text-slate-400 text-sm font-medium">Click "Run Comparison" to see base vs scenario results</p>
          <p className="text-slate-400 text-xs">Make sure assumptions are saved before running</p>
        </div>
      )}
    </div>
  );
}

function CompCard({ label, value, accent }) {
  const accentMap = {
    indigo:  "text-indigo-300",
    cyan:    "text-cyan-300",
    emerald: "text-emerald-400",
    red:     "text-red-400",
    violet:  "text-violet-300",
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex flex-col gap-1">
      <p className="text-slate-500 text-xs">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${accentMap[accent] ?? "text-slate-100"}`}>{value}</p>
    </div>
  );
}

// ─── Waterfall attribution chart ─────────────────────────────────────────────

const WF_COLORS = {
  base:        "#6366f1",
  scenario:    "#06b6d4",
  pos:         "#22c55e",
  neg:         "#ef4444",
  interaction: "#334155",
};

function periodFmt(p) {
  if (p.includes("-")) {
    const [y, m] = p.split("-");
    const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${mn[parseInt(m)-1]} ${y}`;
  }
  return p;
}

function getRevForPeriod(results, period, allPeriods) {
  if (!results) return 0;
  if (period === "all") return Object.values(results.totalRevenue ?? {}).reduce((s, v) => s + v, 0);
  if (!period.includes("-")) {
    // year label — sum all months that start with it (monthly model) or direct lookup (yearly)
    const monthly = allPeriods.some(p => p.includes("-"));
    if (monthly) {
      return allPeriods.filter(p => p.startsWith(period + "-")).reduce((s, p) => s + (results.totalRevenue[p] ?? 0), 0);
    }
    return results.totalRevenue[period] ?? 0;
  }
  return results.totalRevenue[period] ?? 0;
}

function WaterfallTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;
  const isBase = entry.type === "base" || entry.type === "scenario";
  return (
    <div className="bg-[#1e293b] border border-slate-600 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-300 font-medium mb-1">{entry.name}</p>
      {isBase ? (
        <p className="text-white tabular-nums">{fmtRevenue(entry.raw)}</p>
      ) : (
        <>
          <p className={`tabular-nums font-semibold ${entry.raw >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {entry.raw >= 0 ? "+" : ""}{fmtRevenue(entry.raw)}
          </p>
          {entry.rawBase > 0 && (
            <p className="text-slate-400 mt-0.5">{((entry.raw / entry.rawBase) * 100).toFixed(1)}% of base</p>
          )}
        </>
      )}
    </div>
  );
}

function WaterfallSection({ baseModel, scenario, baseResults, scResults, isolatedResults }) {
  const isMonthly = baseModel.granularity === "Monthly";
  const allPeriods = baseResults?.periods ?? [];
  const years = baseResults?.years?.map(String) ?? [];

  const [selectedPeriod, setSelectedPeriod] = useState("all");

  const { wfBars, baseRev, scRev, drivers } = useMemo(() => {
    if (!baseResults || !scResults || !isolatedResults) return { wfBars: [], baseRev: 0, scRev: 0, drivers: [] };

    const baseRev = getRevForPeriod(baseResults, selectedPeriod, allPeriods);
    const scRev   = getRevForPeriod(scResults,   selectedPeriod, allPeriods);

    // Compute individual deltas (isolated swaps)
    const drivers = isolatedResults
      .map(d => ({
        label: d.label,
        delta: d.results ? getRevForPeriod(d.results, selectedPeriod, allPeriods) - baseRev : 0,
      }))
      .filter(d => Math.abs(d.delta) > 100) // omit negligible differences
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)); // biggest drivers first

    // Residual interaction term
    const sumDeltas = drivers.reduce((s, d) => s + d.delta, 0);
    const interaction = (scRev - baseRev) - sumDeltas;
    if (Math.abs(interaction) > 100) {
      drivers.push({ label: "Interactions", delta: interaction, isInteraction: true });
    }

    // Build Recharts-compatible waterfall bars
    let running = baseRev / 1e6;
    const bars = [
      { name: "Base", spacer: 0, value: baseRev / 1e6, raw: baseRev, rawBase: baseRev, type: "base" },
    ];
    for (const d of drivers) {
      const val = d.delta / 1e6;
      const spacer = val >= 0 ? running : running + val;
      bars.push({
        name: d.label,
        spacer,
        value: Math.abs(val),
        raw: d.delta,
        rawBase: baseRev,
        type: d.isInteraction ? "interaction" : val >= 0 ? "pos" : "neg",
      });
      running += val;
    }
    bars.push({ name: scenario.name, spacer: 0, value: scRev / 1e6, raw: scRev, rawBase: baseRev, type: "scenario" });

    return { wfBars: bars, baseRev, scRev, drivers };
  }, [baseResults, scResults, isolatedResults, selectedPeriod]);

  // Y-axis domain: a bit of padding
  const yMax = Math.max(...wfBars.map(b => (b.spacer ?? 0) + (b.value ?? 0))) * 1.1;
  const yMin = Math.min(0, ...wfBars.map(b => b.spacer ?? 0)) * 1.1;

  // Build period options
  const periodOptions = [
    { value: "all", label: "All Periods" },
    ...years.map(y => ({ value: y, label: y, group: null })),
    ...(isMonthly ? allPeriods.map(p => ({ value: p, label: periodFmt(p), group: p.split("-")[0] })) : []),
  ];

  if (!baseResults) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-slate-200 text-sm font-medium">Revenue Drivers — Waterfall</p>
          <p className="text-slate-500 text-xs mt-0.5">
            Independent contribution of each assumption group to the revenue delta
          </p>
        </div>
        {/* Period selector */}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-slate-500 text-xs">Period</label>
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-violet-500 transition-colors"
          >
            <option value="all">All Periods</option>
            {isMonthly ? (
              years.map(y => (
                <optgroup key={y} label={y}>
                  <option value={y}>{y} (Total)</option>
                  {allPeriods.filter(p => p.startsWith(y + "-")).map(p => (
                    <option key={p} value={p}>{periodFmt(p)}</option>
                  ))}
                </optgroup>
              ))
            ) : (
              years.map(y => <option key={y} value={y}>{y}</option>)
            )}
          </select>
        </div>
      </div>

      {wfBars.length > 0 && (
        <>
          {/* Waterfall chart */}
          <div className="p-5">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={wfBars} margin={{ top: 16, right: 16, left: 8, bottom: 60 }} barSize={44}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#334155", fontSize: 11 }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fill: "#334155", fontSize: 11 }}
                  tickFormatter={v => `$${v.toFixed(1)}M`}
                  domain={[yMin, yMax]}
                />
                <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
                <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
                {/* Invisible spacer */}
                <Bar dataKey="spacer" stackId="wf" fill="transparent" legendType="none" />
                {/* Visible delta bar — colored per type */}
                <Bar dataKey="value" stackId="wf" radius={[3, 3, 0, 0]}>
                  {wfBars.map((entry, i) => (
                    <Cell key={i} fill={WF_COLORS[entry.type] ?? WF_COLORS.pos} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex items-center gap-5 mt-2 justify-center flex-wrap text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: WF_COLORS.base }} /> Base</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: WF_COLORS.pos }} /> Positive driver</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: WF_COLORS.neg }} /> Negative driver</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: WF_COLORS.interaction }} /> Interactions</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: WF_COLORS.scenario }} /> {scenario.name}</span>
            </div>
          </div>

          {/* Driver table */}
          {drivers.length > 0 && (
            <div className="border-t border-slate-800 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#dbe8f8] border-b border-[#b3cce8]">
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-100 w-48">Assumption Driver</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-200">Delta</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-200">% of Base</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-200 w-48">Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d, i) => {
                    const pct = baseRev ? (d.delta / baseRev) * 100 : 0;
                    const barW = baseRev ? Math.min(100, Math.abs(d.delta / (scRev - baseRev || 1)) * 100) : 0;
                    const isEven = i % 2 === 0;
                    return (
                      <tr key={d.label} style={{ background: isEven ? "#ffffff" : "#f0f6ff" }} className="border-b border-[#d1e0f5]">
                        <td className="px-4 py-2 text-slate-100 font-medium">{d.label}</td>
                        <td className={`px-4 py-2 text-right tabular-nums font-semibold ${d.delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {d.delta >= 0 ? "+" : ""}{fmtRevenue(d.delta)}
                        </td>
                        <td className={`px-4 py-2 text-right tabular-nums ${d.delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {d.delta >= 0 ? "+" : ""}{pct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-[#e2e8f0] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${barW}%`, background: d.delta >= 0 ? "#22c55e" : "#ef4444" }}
                              />
                            </div>
                            <span className="text-slate-400 text-xs w-8 text-right">{Math.round(barW)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CompTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1e293b] border border-slate-600 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-300 font-medium mb-2">{label}</p>
      {payload.map(e => (
        <div key={e.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: e.color }} />
            <span className="text-slate-400">{e.name}</span>
          </span>
          <span className="text-white tabular-nums">{fmtRevenue((e.value ?? 0) * 1_000_000)}</span>
        </div>
      ))}
      {payload.length === 2 && (() => {
        const d = ((payload[1]?.value ?? 0) - (payload[0]?.value ?? 0)) * 1_000_000;
        const color = d >= 0 ? "text-emerald-400" : "text-red-400";
        return (
          <div className={`mt-2 pt-2 border-t border-slate-700 flex justify-between ${color}`}>
            <span>Delta</span>
            <span className="tabular-nums">{fmtDelta(d)}</span>
          </div>
        );
      })()}
    </div>
  );
}

function CompTable({ title, subtitle, rows, scenarioName }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <p className="text-slate-200 text-sm font-medium">{title}</p>
        {subtitle && <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>}
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700">
              <th className="text-left px-4 py-2.5 text-slate-300 font-medium whitespace-nowrap sticky left-0 bg-slate-800">Combination</th>
              <th className="text-right px-4 py-2.5 text-indigo-300 font-medium whitespace-nowrap">Base</th>
              <th className="text-right px-4 py-2.5 text-cyan-300 font-medium whitespace-nowrap">{scenarioName}</th>
              <th className="text-right px-4 py-2.5 text-slate-300 font-medium whitespace-nowrap">Δ ($)</th>
              <th className="text-right px-4 py-2.5 text-slate-300 font-medium whitespace-nowrap">Δ (%)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isEven = i % 2 === 0;
              const deltaColor = row.delta >= 0 ? "text-emerald-400" : "text-red-400";
              return (
                <tr key={row.key3 ?? row.label} className={`border-b border-slate-800/40 ${isEven ? "bg-slate-950" : "bg-slate-900/40"}`}>
                  <td className={`px-4 py-2.5 text-slate-200 font-medium sticky left-0 ${isEven ? "bg-slate-950" : "bg-slate-900/40"}`}>{row.label}</td>
                  <td className="text-right px-4 py-2.5 text-indigo-300 tabular-nums">{fmtRevenue(row.base)}</td>
                  <td className="text-right px-4 py-2.5 text-cyan-300 tabular-nums">{fmtRevenue(row.scenario)}</td>
                  <td className={`text-right px-4 py-2.5 tabular-nums font-medium ${deltaColor}`}>{fmtDelta(row.delta)}</td>
                  <td className={`text-right px-4 py-2.5 tabular-nums ${deltaColor}`}>{row.deltaPct !== null ? fmtPct(row.deltaPct) : "—"}</td>
                </tr>
              );
            })}
            {/* Total row */}
            {rows.length > 1 && (() => {
              const bTotal = rows.reduce((s, r) => s + r.base, 0);
              const sTotal = rows.reduce((s, r) => s + r.scenario, 0);
              const dTotal = sTotal - bTotal;
              const dpTotal = bTotal ? (dTotal / bTotal) * 100 : null;
              const deltaColor = dTotal >= 0 ? "text-emerald-400" : "text-red-400";
              return (
                <tr className="border-t-2 border-slate-700 bg-slate-800/60 font-semibold">
                  <td className="px-4 py-2.5 text-slate-200 sticky left-0 bg-slate-800/60">Total</td>
                  <td className="text-right px-4 py-2.5 text-indigo-300 tabular-nums">{fmtRevenue(bTotal)}</td>
                  <td className="text-right px-4 py-2.5 text-cyan-300 tabular-nums">{fmtRevenue(sTotal)}</td>
                  <td className={`text-right px-4 py-2.5 tabular-nums ${deltaColor}`}>{fmtDelta(dTotal)}</td>
                  <td className={`text-right px-4 py-2.5 tabular-nums ${deltaColor}`}>{dpTotal !== null ? fmtPct(dpTotal) : "—"}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Scenario editor (assumptions + comparison) ───────────────────────────────

const EDITOR_TABS = [
  { id: "assumptions", label: "Assumptions" },
  { id: "comparison",  label: "Comparison" },
];

function ScenarioEditor({ baseModel, scenario, onBack, onSave, onPromoteToBase }) {
  const [localAssumptions, setLocalAssumptions] = useState(() =>
    JSON.parse(JSON.stringify(scenario.assumptions))
  );
  const [editedScenario, setEditedScenario] = useState(scenario);
  const [editorTab, setEditorTab] = useState("assumptions");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState(scenario.name);
  const [metaDesc, setMetaDesc] = useState(scenario.description ?? "");
  const [confirmPromote, setConfirmPromote] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const handleAssumptionChange = useCallback((updatedAssumptions) => {
    setLocalAssumptions(updatedAssumptions);
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = { ...editedScenario, assumptions: localAssumptions };
      await onSave(updated);
      setSaveMsg({ type: "success", text: "Saved" });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setSaveMsg({ type: "error", text: e?.message ?? "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  function saveMeta() {
    setEditedScenario(prev => ({ ...prev, name: metaName, description: metaDesc }));
    setEditingMeta(false);
  }

  async function handlePromote() {
    setPromoting(true);
    setSaveMsg(null);
    try {
      await onPromoteToBase({ ...editedScenario, assumptions: localAssumptions });
      setSaveMsg({ type: "success", text: "Set as base model" });
      setTimeout(() => setSaveMsg(null), 4000);
    } catch (e) {
      setSaveMsg({ type: "error", text: e?.message ?? "Failed to set as base" });
    } finally {
      setPromoting(false);
      setConfirmPromote(false);
    }
  }

  const displayedScenario = useMemo(() => ({
    ...editedScenario,
    assumptions: localAssumptions,
  }), [editedScenario, localAssumptions]);

  return (
    <div className="space-y-5">
      {/* Editor header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              All Scenarios
            </button>
            <span className="text-slate-500">/</span>
            {editingMeta ? (
              <div className="flex items-center gap-2">
                <input
                  value={metaName}
                  onChange={e => setMetaName(e.target.value)}
                  className="bg-[#1e293b] border border-slate-600 rounded px-2 py-1 text-slate-100 text-sm focus:outline-none focus:border-violet-500"
                  placeholder="Scenario name"
                  autoFocus
                />
                <input
                  value={metaDesc}
                  onChange={e => setMetaDesc(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-300 text-sm focus:outline-none focus:border-violet-500 w-56"
                  placeholder="Short description (optional)"
                />
                <button onClick={saveMeta} className="text-xs text-violet-400 hover:text-violet-300 font-medium px-2 py-1 bg-violet-600/10 rounded">Done</button>
                <button onClick={() => setEditingMeta(false)} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-slate-100 text-sm font-semibold">{editedScenario.name}</span>
                {editedScenario.description && (
                  <span className="text-slate-400 text-sm">— {editedScenario.description}</span>
                )}
                <button onClick={() => setEditingMeta(true)} className="text-slate-500 hover:text-slate-200 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {saveMsg && (
              <span className={`text-xs ${saveMsg.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                {saveMsg.text}
              </span>
            )}

            {/* Set as Base — inline confirm */}
            {confirmPromote ? (
              <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-700/50 rounded-lg px-3 py-1.5">
                <span className="text-amber-300 text-xs">Replace base model assumptions?</span>
                <button
                  onClick={handlePromote}
                  disabled={promoting}
                  className="text-xs font-medium text-amber-200 hover:text-white bg-amber-600/30 hover:bg-amber-600/60 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                >
                  {promoting ? "Applying…" : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmPromote(false)}
                  className="text-xs text-slate-500 hover:text-slate-300 px-1 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmPromote(true)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-600/10 hover:bg-amber-600/20 text-amber-300 hover:text-amber-200 border border-amber-500/20 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                </svg>
                Set as Base
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              {saving ? "Saving…" : "Save Scenario"}
            </button>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {EDITOR_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setEditorTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              editorTab === t.id
                ? "border-violet-500 text-violet-300"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {editorTab === "assumptions" && (
        <ScenarioAssumptionsTab
          baseModel={baseModel}
          scenarioAssumptions={localAssumptions}
          onChange={handleAssumptionChange}
        />
      )}

      {editorTab === "comparison" && (
        <ComparisonView baseModel={baseModel} scenario={displayedScenario} />
      )}
    </div>
  );
}

// ─── Scenario list view ───────────────────────────────────────────────────────

function ScenarioCard({ scenario, onEdit, onCompare, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex flex-col gap-3 hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600/15 border border-violet-500/25 flex items-center justify-center text-violet-400 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div>
            <p className="text-slate-200 text-sm font-semibold">{scenario.name}</p>
            {scenario.description && (
              <p className="text-slate-500 text-xs mt-0.5">{scenario.description}</p>
            )}
          </div>
        </div>
        <span className="text-slate-400 text-xs shrink-0">{scenario.createdAt}</span>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
        <button
          onClick={() => onEdit(scenario)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-600/10 hover:bg-violet-600/20 text-violet-700 hover:text-violet-800 border border-violet-500/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
          Edit Assumptions
        </button>
        <button
          onClick={() => onCompare(scenario)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l9 6 9-6M3 18l9-6 9 6" />
          </svg>
          Compare
        </button>
        <div className="ml-auto">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs">Delete?</span>
              <button onClick={() => onDelete(scenario.id)} className="text-xs text-red-400 hover:text-red-300 font-medium">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New scenario modal ───────────────────────────────────────────────────────

function NewScenarioModal({ onConfirm, onCancel }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onConfirm({ name: name.trim(), description: description.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-[#1e293b] border border-slate-600 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-slate-100 font-semibold text-base mb-4">New Scenario</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-400 text-xs mb-1.5 font-medium">Scenario Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Optimistic, Bear Case, IRA Sensitivity"
              className="w-full bg-[#0f172a] border border-slate-600 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-violet-500 transition-colors placeholder:text-slate-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1.5 font-medium">Description <span className="text-slate-500 font-normal">(optional)</span></label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of what this scenario tests"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-300 text-sm focus:outline-none focus:border-violet-500 transition-colors placeholder:text-slate-500"
            />
          </div>
          <p className="text-slate-500 text-xs">
            All assumptions will be pre-filled from the base model. You can then adjust individual assumptions for this scenario.
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-[#1e293b] transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create Scenario
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Root ScenarioManager ─────────────────────────────────────────────────────

export default function ScenarioManager({ model }) {
  const { updateModel } = useForecast();
  const [editingScenario, setEditingScenario] = useState(null); // { scenario, openTab }
  const [showNewModal, setShowNewModal] = useState(false);
  const [persistError, setPersistError] = useState(null);

  const scenarios = model.scenarios ?? [];

  async function persistScenarios(updated) {
    const patch = { scenarios: updated };
    updateModel(model.id, patch);
    try {
      const res = await apiFetch(`${API}/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Backend save failed");
    } catch (e) {
      setPersistError(e?.message ?? "Could not save to backend");
      setTimeout(() => setPersistError(null), 5000);
    }
  }

  function handleCreateScenario({ name, description }) {
    const newScenario = {
      id: genId(),
      name,
      description,
      createdAt: new Date().toLocaleDateString(),
      assumptions: cloneBaseAssumptions(model),
    };
    const updated = [...scenarios, newScenario];
    persistScenarios(updated);
    setShowNewModal(false);
    setEditingScenario({ scenario: newScenario, openTab: "assumptions" });
  }

  async function handleSaveScenario(updatedScenario) {
    const updated = scenarios.map(s => s.id === updatedScenario.id ? updatedScenario : s);
    await persistScenarios(updated);
    setEditingScenario(prev => prev ? { ...prev, scenario: updatedScenario } : null);
  }

  async function handlePromoteToBase(scenario) {
    // Merge scenario assumptions into the base model, keep everything else unchanged
    const patch = { ...scenario.assumptions };
    updateModel(model.id, patch);
    const res = await fetch(`${API}/models/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("Backend save failed");
    // After promoting, re-snapshot the new base into all other scenarios' assumptions
    // so future scenarios still start from the correct base when cloned
  }

  function handleDeleteScenario(id) {
    persistScenarios(scenarios.filter(s => s.id !== id));
  }

  function handleEdit(scenario) {
    setEditingScenario({ scenario, openTab: "assumptions" });
  }

  function handleCompare(scenario) {
    setEditingScenario({ scenario, openTab: "comparison" });
  }

  // ── Scenario editor view ──
  if (editingScenario) {
    return (
      <ScenarioEditor
        baseModel={model}
        scenario={editingScenario.scenario}
        initialTab={editingScenario.openTab}
        onBack={() => setEditingScenario(null)}
        onSave={handleSaveScenario}
        onPromoteToBase={handlePromoteToBase}
      />
    );
  }

  // ── Scenario list view ──
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-200 text-sm font-semibold">Scenarios</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            {scenarios.length === 0
              ? "No scenarios yet — create one to test different assumptions"
              : `${scenarios.length} scenario${scenarios.length !== 1 ? "s" : ""} · each pre-filled from base model assumptions`}
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Scenario
        </button>
      </div>

      {persistError && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-lg px-4 py-2.5 text-red-400 text-xs">
          {persistError}
        </div>
      )}

      {/* Scenario cards */}
      {scenarios.length === 0 ? (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-slate-300 font-semibold">No scenarios yet</p>
            <p className="text-slate-500 text-sm mt-1 max-w-sm">
              Create a scenario to test different assumptions — it starts pre-filled from your base model so you only change what matters.
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-1 flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create First Scenario
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenarios.map(sc => (
            <ScenarioCard
              key={sc.id}
              scenario={sc}
              onEdit={handleEdit}
              onCompare={handleCompare}
              onDelete={handleDeleteScenario}
            />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewScenarioModal
          onConfirm={handleCreateScenario}
          onCancel={() => setShowNewModal(false)}
        />
      )}
    </div>
  );
}
