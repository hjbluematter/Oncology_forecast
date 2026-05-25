import { useState, useMemo, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useForecast } from "../../store/forecastStore";
import {
  buildPortfolio, filterCombos, getDependentOptions,
  aggregateByDimension, findPeak, sumAcrossPeriods,
} from "../../utils/portfolioEngine";

const API = "http://localhost:3001/api";

const SERIES_COLORS = [
  "#7c3aed","#2563eb","#059669","#d97706","#dc2626",
  "#9333ea","#0891b2","#65a30d","#ea580c","#e11d48",
  "#6366f1","#14b8a6","#84cc16","#f59e0b","#ef4444",
];

const DIM_OPTIONS = [
  { value: "total",      label: "Aggregated" },
  { value: "asset",      label: "Asset" },
  { value: "indication", label: "Indication" },
  { value: "line",       label: "Line of Therapy" },
  { value: "geography",  label: "Geography" },
];

const SECONDARY_OPTIONS = [
  { value: "none",       label: "None" },
  { value: "asset",      label: "Asset" },
  { value: "indication", label: "Indication" },
  { value: "line",       label: "Line of Therapy" },
  { value: "geography",  label: "Geography" },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtRevenue(v, compact = false) {
  if (!v) return "$0";
  if (compact || Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtPatients(v, compact = false) {
  if (!v) return "0";
  if (compact || Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return Math.round(v).toLocaleString();
}
function fmtVials(v, compact = false) {
  if (!v) return "0";
  if (compact || Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return Math.round(v).toLocaleString();
}

function fmtPeriodLabel(p) {
  if (!p) return "";
  if (p.includes("-")) {
    const [y, m] = p.split("-");
    return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1]} ${y}`;
  }
  return p;
}

// ─── Custom Recharts tooltip ──────────────────────────────────────────────────

function DarkTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, e) => s + (e.value ?? 0), 0);
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs shadow-2xl max-w-xs">
      <p className="text-slate-300 font-semibold mb-2">{label}</p>
      {[...payload].reverse().map((e) => (
        <div key={e.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: e.color }} />
            <span className="text-slate-400 truncate">{e.name}</span>
          </span>
          <span className="text-white tabular-nums shrink-0">{formatter(e.value ?? 0)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between font-semibold">
          <span className="text-slate-300">Total</span>
          <span className="text-white tabular-nums">{formatter(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── SaveModal ────────────────────────────────────────────────────────────────

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
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(name.trim())}
            disabled={!name.trim() || saving}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving…
              </>
            ) : "Save Portfolio"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FilterSection ────────────────────────────────────────────────────────────

function FilterSection({ title, options, selected, onToggle, onSelectAll }) {
  const [open, setOpen] = useState(true);
  const activeCount = options.filter((o) => selected.has(o)).length;
  const allSelected = options.length > 0 && activeCount === options.length;

  return (
    <div className="border-b border-slate-800/60 last:border-0">
      <div className="flex items-center py-2.5 gap-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-1.5 text-left"
        >
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
          {activeCount > 0 && (
            <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">
              {activeCount}
            </span>
          )}
        </button>
        {options.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelectAll(allSelected ? [] : options); }}
            className="text-[10px] font-semibold text-slate-600 hover:text-violet-400 transition-colors px-1 shrink-0"
          >
            {allSelected ? "Clear" : "All"}
          </button>
        )}
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-slate-700 hover:text-slate-500 transition-colors p-0.5">
          <svg className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="pb-2.5 space-y-0.5">
          {options.length === 0 ? (
            <p className="text-xs text-slate-700 px-1 py-1">No options</p>
          ) : (
            options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-slate-800/50 group">
                <input
                  type="checkbox"
                  checked={selected.has(opt)}
                  onChange={() => onToggle(opt)}
                  className="rounded w-3.5 h-3.5 accent-violet-500 shrink-0"
                />
                <span className={`text-xs truncate transition-colors ${
                  selected.has(opt) ? "text-slate-200" : "text-slate-500 group-hover:text-slate-300"
                }`}>{opt}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── ForecastSection ──────────────────────────────────────────────────────────

function ForecastSection({ title, icon, grouped, periodList, granularity, formatter, colorMap, revenueToggle, revenueType, onRevenueTypeChange }) {
  const [viewMode, setViewMode] = useState("chart");
  const seriesKeys = Object.keys(grouped);

  const { value: peakVal, period: peakPeriod } = useMemo(
    () => findPeak(grouped, periodList), [grouped, periodList]
  );
  const total = useMemo(() => sumAcrossPeriods(grouped), [grouped]);

  const chartData = useMemo(() => periodList.map((p) => {
    const row = { period: p, label: fmtPeriodLabel(p) };
    for (const k of seriesKeys) row[k] = grouped[k]?.[p] ?? 0;
    return row;
  }), [grouped, periodList, seriesKeys]);

  const isMonthly = granularity === "monthly";
  const tickInterval = isMonthly ? Math.max(0, Math.floor(periodList.length / 10) - 1) : 0;

  const axisStyle = { fill: "#64748b", fontSize: 10 };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/80 flex-wrap gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{icon}</span>
          <span className="text-sm font-semibold text-slate-100">{title}</span>
          {peakVal > 0 && (
            <span className="text-xs text-slate-500 ml-1 hidden sm:inline">
              Peak: <span className="font-medium text-slate-300">{formatter(peakVal)}</span>
              {peakPeriod && <span className="text-slate-600"> in {fmtPeriodLabel(peakPeriod)}</span>}
              <span className="mx-1.5 text-slate-700">·</span>
              Total: <span className="text-slate-400">{formatter(total)}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {revenueToggle && (
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
              {["adjusted","unadjusted"].map((v) => (
                <button
                  key={v}
                  onClick={() => onRevenueTypeChange(v)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors capitalize ${
                    revenueType === v
                      ? "bg-violet-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {v === "adjusted" ? "PTRS-adj" : "Unadjusted"}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
            {[["chart","📊"],["table","📋"]].map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  viewMode === v
                    ? "bg-violet-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        {viewMode === "chart" ? (
          <ResponsiveContainer width="100%" height={220}>
            {isMonthly ? (
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => formatter(v, true)} width={64} />
                <Tooltip content={<DarkTooltip formatter={formatter} />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }} />
                {seriesKeys.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} stroke={colorMap[k] ?? SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} strokeWidth={2} activeDot={{ r: 3 }} />
                ))}
              </LineChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="period" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => formatter(v, true)} width={64} />
                <Tooltip content={<DarkTooltip formatter={formatter} />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }} />
                {seriesKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={colorMap[k] ?? SERIES_COLORS[i % SERIES_COLORS.length]}
                    radius={i === seriesKeys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs border-separate border-spacing-0 min-w-max">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-slate-900 text-left py-2 pr-4 pl-1 text-slate-400 font-semibold border-b border-slate-800 z-10 min-w-[120px]">
                    Series
                  </th>
                  {periodList.map((p) => (
                    <th key={p} className="text-right py-2 px-2 text-slate-500 font-medium border-b border-slate-800 whitespace-nowrap min-w-[68px]">
                      {fmtPeriodLabel(p)}
                    </th>
                  ))}
                  <th className="text-right py-2 pl-3 pr-1 text-slate-400 font-semibold border-b border-slate-800 whitespace-nowrap">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {seriesKeys.map((k) => {
                  const rowTotal = periodList.reduce((s, p) => s + (grouped[k]?.[p] ?? 0), 0);
                  return (
                    <tr key={k} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="sticky left-0 bg-slate-900 group-hover:bg-slate-800/30 py-1.5 pr-4 pl-1 border-b border-slate-800/50 z-10">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorMap[k] ?? "#888" }} />
                          <span className="text-slate-300 truncate max-w-[100px]" title={k}>{k}</span>
                        </div>
                      </td>
                      {periodList.map((p) => (
                        <td key={p} className="text-right py-1.5 px-2 text-slate-400 whitespace-nowrap tabular-nums border-b border-slate-800/50">
                          {formatter(grouped[k]?.[p] ?? 0)}
                        </td>
                      ))}
                      <td className="text-right py-1.5 pl-3 pr-1 text-slate-200 font-semibold whitespace-nowrap tabular-nums border-b border-slate-800/50">
                        {formatter(rowTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700">
                  <td className="sticky left-0 bg-slate-900 py-2 pr-4 pl-1 font-bold text-slate-200 z-10">Total</td>
                  {periodList.map((p) => {
                    const colTotal = seriesKeys.reduce((s, k) => s + (grouped[k]?.[p] ?? 0), 0);
                    return (
                      <td key={p} className="text-right py-2 px-2 font-bold text-slate-200 whitespace-nowrap tabular-nums">
                        {formatter(colTotal)}
                      </td>
                    );
                  })}
                  <td className="text-right py-2 pl-3 pr-1 font-bold text-white whitespace-nowrap tabular-nums">
                    {formatter(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PillSelector ─────────────────────────────────────────────────────────────

function PillSelector({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-slate-500 shrink-0 uppercase tracking-wider">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all ${
              value === opt.value
                ? "bg-violet-600/25 border-violet-500/60 text-violet-300"
                : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── PortfolioPage ────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { models, portfolioConfig, setView } = useForecast();

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState(null);
  const [saveSuccess,   setSaveSuccess]   = useState(false);

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

  const iv0 = portfolioConfig?.initialViewState;
  const [activeFilters, setActiveFilters] = useState(initFilters);
  const [granularity,   setGranularity]   = useState(iv0?.granularity  ?? "yearly");
  const [primaryDim,    setPrimaryDim]    = useState(iv0?.primaryDim   ?? "total");
  const [secondaryDim,  setSecondaryDim]  = useState(iv0?.secondaryDim ?? "none");
  const [revenueType,   setRevenueType]   = useState(iv0?.revenueType  ?? "adjusted");

  const { yearList, monthList, allCombos } = useMemo(() => {
    if (!portfolioConfig) return { yearList: [], monthList: [], allCombos: [] };
    return buildPortfolio(models, portfolioConfig.modelIds, portfolioConfig.startYear, portfolioConfig.endYear);
  }, [models, portfolioConfig]);

  const periodList = granularity === "monthly" ? monthList : yearList;

  const filterOptions = useMemo(() => ({
    assets:      getDependentOptions(allCombos, "assets",      activeFilters),
    indications: getDependentOptions(allCombos, "indications", activeFilters),
    lines:       getDependentOptions(allCombos, "lines",       activeFilters),
    geographies: getDependentOptions(allCombos, "geographies", activeFilters),
  }), [allCombos, activeFilters]);

  // ── Total active filters — computed before filteredCombos so it can gate data ──
  const totalActiveFilters =
    activeFilters.assets.size + activeFilters.indications.size +
    activeFilters.lines.size  + activeFilters.geographies.size;

  // Empty filters → empty canvas (no data shown until user makes a selection)
  const filteredCombos = useMemo(
    () => totalActiveFilters === 0 ? [] : filterCombos(allCombos, activeFilters),
    [allCombos, activeFilters, totalActiveFilters]
  );

  const effectiveSecondary = secondaryDim !== primaryDim ? secondaryDim : "none";

  const colorMap = useMemo(() => {
    const dimMap = { asset: "assetName", indication: "indication", line: "lotLabel", geography: "geoLabel" };
    const keys = new Set();
    for (const c of filteredCombos) {
      const primaryVal = dimMap[primaryDim] ? c[dimMap[primaryDim]] : "Total";
      const hasSecondary = effectiveSecondary && effectiveSecondary !== "none";
      const key = hasSecondary
        ? `${primaryVal} › ${c[dimMap[effectiveSecondary]]}`
        : (primaryVal ?? "Total");
      if (key) keys.add(key);
    }
    const map = {};
    [...keys].sort().forEach((k, i) => { map[k] = SERIES_COLORS[i % SERIES_COLORS.length]; });
    return map;
  }, [filteredCombos, primaryDim, effectiveSecondary]);

  const npsGrouped = useMemo(() =>
    aggregateByDimension(filteredCombos, primaryDim, effectiveSecondary, granularity, "nps", periodList),
    [filteredCombos, primaryDim, effectiveSecondary, granularity, periodList]
  );
  const vialsGrouped = useMemo(() =>
    aggregateByDimension(filteredCombos, primaryDim, effectiveSecondary, granularity, "vials", periodList),
    [filteredCombos, primaryDim, effectiveSecondary, granularity, periodList]
  );
  const revenueGrouped = useMemo(() => {
    const metric = revenueType === "unadjusted" ? "revenueUnadj" : "revenue";
    return aggregateByDimension(filteredCombos, primaryDim, effectiveSecondary, granularity, metric, periodList);
  }, [filteredCombos, primaryDim, effectiveSecondary, granularity, revenueType, periodList]);

  const peakRevenue = useMemo(() => findPeak(revenueGrouped, periodList), [revenueGrouped, periodList]);
  const peakNPS     = useMemo(() => findPeak(npsGrouped,     periodList), [npsGrouped,     periodList]);
  const peakVials   = useMemo(() => findPeak(vialsGrouped,   periodList), [vialsGrouped,   periodList]);

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
      const res = await fetch(`${API}/portfolios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  if (!portfolioConfig) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 text-sm mb-4">No portfolio configured.</p>
          <button onClick={() => setView("portfolio-select")} className="text-violet-400 hover:text-violet-300 font-medium text-sm transition-colors">
            ← Back to setup
          </button>
        </div>
      </div>
    );
  }

  const portfolioModelNames = models
    .filter((m) => portfolioConfig.modelIds.includes(m.id))
    .map((m) => m.assetName)
    .filter(Boolean);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-950">

      {/* ── Save modal ── */}
      {saveModalOpen && (
        <SaveModal
          defaultName={`Portfolio ${new Date().toLocaleDateString()}`}
          onSave={handleSave}
          onCancel={() => { setSaveModalOpen(false); setSaveError(null); }}
          saving={saving}
          error={saveError}
        />
      )}

      {/* ── Success toast ── */}
      {saveSuccess && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-xl">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Portfolio saved successfully
        </div>
      )}

      {/* ── Header ── */}
      <header className="bm-header border-b shrink-0 z-20">
        <div className="px-5 py-3 flex items-center justify-between gap-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm min-w-0">
            <div className="w-7 h-7 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <button onClick={() => setView("dashboard")} className="text-slate-400 hover:text-slate-200 font-medium transition-colors hidden sm:block">OncoCast</button>
            <svg className="w-3 h-3 text-slate-700 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <button onClick={() => setView("portfolio-select")} className="text-slate-400 hover:text-slate-200 transition-colors hidden sm:block">Portfolio</button>
            <svg className="w-3 h-3 text-slate-700 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-slate-200 font-semibold truncate">
              {portfolioModelNames.join(", ") || "Portfolio View"}
            </span>
            <span className="text-slate-600 text-xs shrink-0 hidden md:inline">
              · {portfolioConfig.startYear}–{portfolioConfig.endYear}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Yearly / Monthly toggle */}
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
              {["yearly","monthly"].map((v) => (
                <button
                  key={v}
                  onClick={() => setGranularity(v)}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                    granularity === v
                      ? "bg-violet-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {v === "yearly" ? "Yearly" : "Monthly"}
                </button>
              ))}
            </div>

            {/* Save Portfolio */}
            <button
              onClick={() => { setSaveError(null); setSaveModalOpen(true); }}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors border border-violet-500"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Save Portfolio
            </button>

            {/* Edit Selection */}
            <button
              onClick={() => setView("portfolio-select")}
              className="text-xs text-slate-400 hover:text-slate-200 font-medium px-3 py-2 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors bg-slate-800 hover:bg-slate-700"
            >
              Edit Selection
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar: filters ── */}
        <aside className="w-48 shrink-0 bg-slate-900/70 border-r border-slate-800 flex flex-col overflow-hidden">
          {/* Sidebar header */}
          <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filters</span>
              {totalActiveFilters > 0 && (
                <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {totalActiveFilters}
                </span>
              )}
            </div>
            {totalActiveFilters > 0 && (
              <button
                onClick={() => setActiveFilters(makeEmpty())}
                className="text-[10px] text-slate-600 hover:text-red-400 transition-colors font-medium"
              >
                Clear
              </button>
            )}
          </div>

          {/* Filter list */}
          <div className="flex-1 overflow-y-auto px-3 py-1">
            <FilterSection
              title="Asset" options={filterOptions.assets}
              selected={activeFilters.assets}
              onToggle={(v) => toggleFilter("assets", v)}
              onSelectAll={(vals) => setFilterValues("assets", vals)}
            />
            <FilterSection
              title="Indication" options={filterOptions.indications}
              selected={activeFilters.indications}
              onToggle={(v) => toggleFilter("indications", v)}
              onSelectAll={(vals) => setFilterValues("indications", vals)}
            />
            <FilterSection
              title="Line of Therapy" options={filterOptions.lines}
              selected={activeFilters.lines}
              onToggle={(v) => toggleFilter("lines", v)}
              onSelectAll={(vals) => setFilterValues("lines", vals)}
            />
            <FilterSection
              title="Geography" options={filterOptions.geographies}
              selected={activeFilters.geographies}
              onToggle={(v) => toggleFilter("geographies", v)}
              onSelectAll={(vals) => setFilterValues("geographies", vals)}
            />
          </div>

          {totalActiveFilters > 0 && (
            <div className="shrink-0 px-3 py-2 border-t border-slate-800 text-center">
              <span className="text-xs text-slate-700">
                {filteredCombos.length} / {allCombos.length} combos
              </span>
            </div>
          )}
        </aside>

        {/* ── Right: fixed controls + scrollable charts ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Fixed view controls + peak cards */}
          <div className="shrink-0 bg-slate-950/90 border-b border-slate-800 px-5 py-3.5 space-y-3 backdrop-blur">
            {/* View by / Split by */}
            <div className="flex flex-wrap items-center gap-5">
              <PillSelector
                label="View by"
                value={primaryDim}
                options={DIM_OPTIONS}
                onChange={setPrimaryDim}
              />
              <PillSelector
                label="Split by"
                value={secondaryDim}
                options={SECONDARY_OPTIONS.filter((o) => o.value === "none" || o.value !== primaryDim)}
                onChange={setSecondaryDim}
              />
            </div>

            {/* Peak cards — blank when no filters active */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Peak Revenue",      value: peakRevenue, fmt: fmtRevenue,  color: "text-violet-400",  border: "border-violet-500/20", bg: "from-violet-600/10 to-violet-500/5" },
                { label: "Peak New Patients", value: peakNPS,     fmt: fmtPatients, color: "text-blue-400",    border: "border-blue-500/20",   bg: "from-blue-600/10 to-blue-500/5"   },
                { label: "Peak Vials",        value: peakVials,   fmt: fmtVials,    color: "text-emerald-400", border: "border-emerald-500/20",bg: "from-emerald-600/10 to-emerald-500/5" },
              ].map(({ label, value, fmt, color, border, bg }) => (
                <div key={label} className={`bg-gradient-to-br ${bg} border ${border} rounded-xl px-4 py-3`}>
                  <div className="text-xs text-slate-400 mb-1 font-medium">{label}</div>
                  <div className={`text-xl font-bold tabular-nums ${totalActiveFilters === 0 ? "text-slate-700" : color}`}>
                    {totalActiveFilters === 0 ? "—" : fmt(value.value)}
                  </div>
                  {totalActiveFilters > 0 && value.period && (
                    <div className="text-xs text-slate-600 mt-0.5">{fmtPeriodLabel(value.period)}</div>
                  )}
                  {totalActiveFilters === 0 && (
                    <div className="text-xs text-slate-700 mt-0.5">Select filters to view</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable chart sections */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* No models loaded */}
            {allCombos.length === 0 ? (
              <div className="bg-slate-900 border border-dashed border-slate-800 rounded-xl p-12 text-center">
                <p className="text-slate-400 text-sm">No forecast data for the selected models and time range.</p>
                <p className="text-slate-600 text-xs mt-1">
                  Ensure selected models have assumptions configured and data within {portfolioConfig.startYear}–{portfolioConfig.endYear}.
                </p>
                <button
                  onClick={() => setView("portfolio-select")}
                  className="mt-4 text-violet-400 hover:text-violet-300 text-sm transition-colors"
                >
                  ← Change model selection
                </button>
              </div>

            /* No filters selected → blank canvas prompt */
            ) : totalActiveFilters === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                  <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-slate-300 font-medium text-sm">Select filters to view data</p>
                  <p className="text-slate-600 text-xs mt-1.5 max-w-xs">
                    Use the sidebar on the left to filter by Asset, Indication, Line of Therapy, or Geography.
                    Data will appear as soon as at least one filter is selected.
                  </p>
                </div>
                {/* Quick-select all hint */}
                <p className="text-slate-700 text-xs">
                  Tip: click <span className="text-slate-500 font-medium">All</span> next to any filter section to select everything at once.
                </p>
              </div>

            /* Filters active → show charts */
            ) : (
              <>
                <ForecastSection
                  title="Revenue"
                  icon="💰"
                  grouped={revenueGrouped}
                  periodList={periodList}
                  granularity={granularity}
                  formatter={fmtRevenue}
                  colorMap={colorMap}
                  revenueToggle={true}
                  revenueType={revenueType}
                  onRevenueTypeChange={setRevenueType}
                />
                <ForecastSection
                  title="New Patients (NPS)"
                  icon="🧑‍⚕️"
                  grouped={npsGrouped}
                  periodList={periodList}
                  granularity={granularity}
                  formatter={fmtPatients}
                  colorMap={colorMap}
                />
                <ForecastSection
                  title="Vials Dispensed"
                  icon="💊"
                  grouped={vialsGrouped}
                  periodList={periodList}
                  granularity={granularity}
                  formatter={fmtVials}
                  colorMap={colorMap}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
