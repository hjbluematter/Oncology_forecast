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
  { value: "total",       label: "Aggregated" },
  { value: "asset",       label: "Asset" },
  { value: "indication",  label: "Indication" },
  { value: "line",        label: "Line of Therapy" },
  { value: "geography",   label: "Geography" },
];

const SECONDARY_OPTIONS = [
  { value: "none",        label: "None" },
  { value: "asset",       label: "Asset" },
  { value: "indication",  label: "Indication" },
  { value: "line",        label: "Line of Therapy" },
  { value: "geography",   label: "Geography" },
];

// ─── SaveModal ────────────────────────────────────────────────────────────────

function SaveModal({ defaultName, onSave, onCancel, saving, error }) {
  const [name, setName] = useState(defaultName ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-slate-800 font-semibold text-base mb-1">Save Portfolio View</h2>
        <p className="text-slate-500 text-xs mb-4">Give this configuration a name so you can reload it later.</p>
        <input
          autoFocus type="text" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }}
          placeholder="e.g. Breast Cancer Pipeline — US"
          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2.5">
          <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave(name.trim())}
            disabled={!name.trim() || saving}
            className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? "Saving…" : "Save Portfolio"}
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
    <div className="border-b border-slate-200 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2.5 text-left"
      >
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-1.5">
          {activeCount > 0 && (
            <span className="bg-violet-100 text-violet-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
              {activeCount}
            </span>
          )}
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="pb-2.5 space-y-0.5">
          {options.length === 0 ? (
            <p className="text-xs text-slate-400 px-1 py-1">No options</p>
          ) : (
            <>
              <button
                onClick={() => onSelectAll(allSelected ? [] : options)}
                className="text-xs text-violet-600 hover:text-violet-800 font-medium px-1 pb-1 transition-colors"
              >
                {allSelected ? "Clear" : "All"}
              </button>
              {options.map((opt) => (
                <label key={opt} className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-slate-50 group">
                  <input
                    type="checkbox"
                    checked={selected.has(opt)}
                    onChange={() => onToggle(opt)}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-slate-700 truncate group-hover:text-slate-900">{opt}</span>
                </label>
              ))}
            </>
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
    const row = { period: p };
    for (const k of seriesKeys) row[k] = grouped[k]?.[p] ?? 0;
    return row;
  }), [grouped, periodList, seriesKeys]);

  const fmtPeriod = (p) => {
    if (!p) return "";
    if (p.includes("-")) {
      const [y, m] = p.split("-");
      return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1]} ${y}`;
    }
    return p;
  };

  const isMonthly = granularity === "monthly";
  const tickInterval = isMonthly ? Math.floor(periodList.length / 10) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          {peakVal > 0 && (
            <span className="text-xs text-slate-500 ml-2">
              Peak: <span className="font-medium text-slate-700">{formatter(peakVal)}</span>
              {peakPeriod && <span className="text-slate-400"> in {fmtPeriod(peakPeriod)}</span>}
              <span className="mx-1.5 text-slate-300">·</span>
              Total: <span className="font-medium text-slate-700">{formatter(total)}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {revenueToggle && (
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 text-xs">
              {["adjusted","unadjusted"].map((v) => (
                <button
                  key={v}
                  onClick={() => onRevenueTypeChange(v)}
                  className={`px-2 py-1 rounded-md font-medium transition-colors capitalize ${
                    revenueType === v ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {v === "adjusted" ? "PTRS-adj" : "Unadjusted"}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 text-xs">
            {[["chart","📊"],["table","📋"]].map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`px-2 py-1 rounded-md font-medium transition-colors ${
                  viewMode === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {viewMode === "chart" ? (
          <ResponsiveContainer width="100%" height={220}>
            {isMonthly ? (
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} interval={tickInterval} tickFormatter={fmtPeriod} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatter(v, true)} width={60} />
                <Tooltip formatter={(v) => formatter(v)} labelFormatter={fmtPeriod} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {seriesKeys.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} stroke={colorMap[k] ?? SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatter(v, true)} width={60} />
                <Tooltip formatter={(v) => formatter(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {seriesKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={colorMap[k] ?? SERIES_COLORS[i % SERIES_COLORS.length]} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-xs min-w-max">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200">
                  <th className="sticky left-0 bg-white text-left py-2 pr-4 font-semibold text-slate-600 min-w-[100px]">Series</th>
                  {periodList.map((p) => (
                    <th key={p} className="text-right py-2 px-2 font-medium text-slate-500 whitespace-nowrap">{fmtPeriod(p)}</th>
                  ))}
                  <th className="text-right py-2 px-2 font-semibold text-slate-700 whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody>
                {seriesKeys.map((k) => {
                  const rowTotal = periodList.reduce((s, p) => s + (grouped[k]?.[p] ?? 0), 0);
                  return (
                    <tr key={k} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="sticky left-0 bg-white hover:bg-slate-50 py-1.5 pr-4 font-medium text-slate-700 truncate max-w-[140px]">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 shrink-0" style={{ background: colorMap[k] ?? "#888" }} />
                        {k}
                      </td>
                      {periodList.map((p) => (
                        <td key={p} className="text-right py-1.5 px-2 text-slate-600 whitespace-nowrap">{formatter(grouped[k]?.[p] ?? 0)}</td>
                      ))}
                      <td className="text-right py-1.5 px-2 font-semibold text-slate-800 whitespace-nowrap">{formatter(rowTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td className="sticky left-0 bg-slate-50 py-2 pr-4 font-bold text-slate-800">Total</td>
                  {periodList.map((p) => {
                    const colTotal = seriesKeys.reduce((s, k) => s + (grouped[k]?.[p] ?? 0), 0);
                    return <td key={p} className="text-right py-2 px-2 font-bold text-slate-800 whitespace-nowrap">{formatter(colTotal)}</td>;
                  })}
                  <td className="text-right py-2 px-2 font-bold text-slate-800 whitespace-nowrap">{formatter(total)}</td>
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
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-500 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
              value === opt.value
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-white text-slate-600 border-slate-300 hover:border-violet-400 hover:text-violet-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtRevenue(v, compact = false) {
  if (!v) return "$0";
  if (compact || Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtPatients(v, compact = false) {
  if (!v) return "0";
  if (compact || Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}
function fmtVials(v, compact = false) {
  if (!v) return "0";
  if (compact || Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

// ─── PortfolioPage ────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { models, portfolioConfig, setView } = useForecast();

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
  const [granularity,  setGranularity]  = useState(iv0?.granularity  ?? "yearly");
  const [primaryDim,   setPrimaryDim]   = useState(iv0?.primaryDim   ?? "total");
  const [secondaryDim, setSecondaryDim] = useState(iv0?.secondaryDim ?? "none");
  const [revenueType,  setRevenueType]  = useState(iv0?.revenueType  ?? "adjusted");

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

  const filteredCombos = useMemo(() => filterCombos(allCombos, activeFilters), [allCombos, activeFilters]);

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

  const fmtPeriodLabel = (p) => {
    if (!p) return "";
    if (p.includes("-")) {
      const [y, m] = p.split("-");
      return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1]} ${y}`;
    }
    return p;
  };

  if (!portfolioConfig) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 text-sm mb-4">No portfolio configured.</p>
          <button onClick={() => setView("portfolio-select")} className="text-violet-600 hover:text-violet-800 font-medium text-sm">
            ← Back to setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">
      {saveModalOpen && (
        <SaveModal
          defaultName={`Portfolio ${new Date().toLocaleDateString()}`}
          onSave={handleSave}
          onCancel={() => { setSaveModalOpen(false); setSaveError(null); }}
          saving={saving}
          error={saveError}
        />
      )}

      {saveSuccess && (
        <div className="fixed bottom-4 right-4 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Portfolio saved
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <button onClick={() => setView("dashboard")} className="hover:text-violet-600 transition-colors font-medium">OncoCast</button>
          <span>›</span>
          <button onClick={() => setView("portfolio-select")} className="hover:text-violet-600 transition-colors">Portfolio</button>
          <span>›</span>
          <span className="text-slate-800 font-semibold">
            {models.filter((m) => portfolioConfig.modelIds.includes(m.id)).map((m) => m.assetName).filter(Boolean).join(", ") || "Portfolio View"}
          </span>
          <span className="text-slate-400 ml-1">({portfolioConfig.startYear}–{portfolioConfig.endYear})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {["yearly","monthly"].map((v) => (
              <button
                key={v}
                onClick={() => setGranularity(v)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                  granularity === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {v === "yearly" ? "Yearly" : "Monthly"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSaveModalOpen(true)}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2M12 3v12m0 0l-4-4m4 4l4-4" />
            </svg>
            Save Portfolio
          </button>
          <button
            onClick={() => setView("portfolio-select")}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
          >
            Edit Selection
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar filters */}
        <aside className="w-48 shrink-0 bg-white border-r border-slate-200 overflow-y-auto p-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Filters</div>
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
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* View controls + peak cards */}
          <div className="shrink-0 bg-white border-b border-slate-200 px-5 py-3 space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <PillSelector label="View by" value={primaryDim} options={DIM_OPTIONS} onChange={setPrimaryDim} />
              <PillSelector
                label="Split by"
                value={secondaryDim}
                options={SECONDARY_OPTIONS.filter((o) => o.value === "none" || o.value !== primaryDim)}
                onChange={setSecondaryDim}
              />
            </div>

            {/* Peak cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Peak Revenue", value: peakRevenue, fmt: fmtRevenue, color: "text-violet-700" },
                { label: "Peak New Patients", value: peakNPS, fmt: fmtPatients, color: "text-blue-700" },
                { label: "Peak Vials", value: peakVials, fmt: fmtVials, color: "text-emerald-700" },
              ].map(({ label, value, fmt, color }) => (
                <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
                  <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                  <div className={`text-lg font-bold ${color}`}>{fmt(value.value)}</div>
                  {value.period && (
                    <div className="text-xs text-slate-400">{fmtPeriodLabel(value.period)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable chart sections */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {allCombos.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
                <p className="text-slate-400 text-sm">No forecast data available for the selected models and time range.</p>
                <p className="text-slate-400 text-xs mt-1">Make sure the selected models have been run and have data within {portfolioConfig.startYear}–{portfolioConfig.endYear}.</p>
              </div>
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
