import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { runForecast } from "../utils/forecastEngine";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const LOT_COLORS = ["#7c3aed", "#2563eb", "#0d9488", "#d97706", "#dc2626", "#7c3aed"];

function fmtRevenue(v) {
  if (v === null || v === undefined || isNaN(v)) return "$0";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

function fmtInt(v) {
  if (v === null || v === undefined || isNaN(v)) return "0";
  return Math.round(v).toLocaleString("en-US");
}

function periodLabel(period) {
  if (period.includes("-")) {
    const [y, m] = period.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m) - 1]} ${y}`;
  }
  return period;
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex flex-col gap-1">
      <p className="text-slate-500 text-xs">{label}</p>
      <p className="text-slate-100 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-slate-500 text-xs">{sub}</p>}
    </div>
  );
}

function CustomTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, e) => s + (e.value ?? 0), 0);
  function fmtTip(v) {
    if (metric === "revenue") return fmtRevenue(v * 1_000_000);
    return fmtInt(v);
  }
  return (
    <div className="bg-[#1e293b] border border-slate-600 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-300 font-medium mb-2">{label}</p>
      {payload.map(e => (
        <div key={e.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: e.color }} />
            <span className="text-slate-400">{e.name}</span>
          </span>
          <span className="text-white tabular-nums">{fmtTip(e.value ?? 0)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between">
          <span className="text-slate-400">Total</span>
          <span className="text-white tabular-nums">{fmtTip(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── AI Narrative ────────────────────────────────────────────────────────────

function buildNarrativeSummary(model, results) {
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const lots = model.linesOfTherapy ?? 1;
  const segs = model.segments ?? 1;
  const lotLabels = Array.from({ length: lots }, (_, i) => `${i + 1}L`);
  const years = results.years.map(String);

  // Aggregate monthly results to yearly
  function yearlySum(valMap) {
    const out = {};
    for (const y of years) {
      const keys = results.periods.filter(p => p.startsWith(y + "-"));
      out[y] = (keys.length ? keys : [y]).reduce((s, p) => s + (valMap?.[p] ?? 0), 0);
    }
    return out;
  }

  // Revenue by year (total)
  const revenueByYear = {};
  for (const y of years) {
    const keys = results.periods.filter(p => p.startsWith(y + "-"));
    revenueByYear[y] = (keys.length ? keys : [y]).reduce((s, p) => s + (results.totalRevenue?.[p] ?? 0), 0);
  }

  // NPS by year (total)
  const npsByYear = {};
  for (const y of years) {
    const keys = results.periods.filter(p => p.startsWith(y + "-"));
    let v = 0;
    for (let g = 0; g < geos.length; g++)
      for (let l = 0; l < lots; l++)
        for (let s = 0; s < segs; s++)
          v += (keys.length ? keys : [y]).reduce((s2, p) => s2 + (results.nps[`${g}-${l}-${s}-0`]?.[p] ?? 0), 0);
    npsByYear[y] = Math.round(v);
  }

  const totalRev = Object.values(revenueByYear).reduce((s, v) => s + v, 0);
  const totalNPS = Object.values(npsByYear).reduce((s, v) => s + v, 0);
  const totalVials = Object.values(results.totalVials ?? {}).reduce((s, v) => s + v, 0);

  const peakEntry = Object.entries(revenueByYear).reduce((a, b) => b[1] > a[1] ? b : a, ["", 0]);

  // Revenue by LOT (total + by year)
  const revenueByLot = {};
  const revenueByLotByYear = {};
  for (const ll of lotLabels) {
    const byYear = {};
    for (const y of years) {
      const keys = results.periods.filter(p => p.startsWith(y + "-"));
      byYear[y] = (keys.length ? keys : [y]).reduce((s, p) => s + (results.revenueByLot[ll]?.[p] ?? 0), 0);
    }
    revenueByLotByYear[ll] = Object.fromEntries(Object.entries(byYear).map(([k, v]) => [k, fmtRevenue(v)]));
    revenueByLot[ll] = Object.values(byYear).reduce((s, v) => s + v, 0);
  }

  // Revenue by Geo (total + by year)
  const revenueByGeo = {};
  const revenueByGeoByYear = {};
  for (let g = 0; g < geos.length; g++) {
    const byYear = {};
    for (const y of years) {
      const keys = results.periods.filter(p => p.startsWith(y + "-"));
      let v = 0;
      for (let l = 0; l < lots; l++)
        for (let s = 0; s < segs; s++)
          v += (keys.length ? keys : [y]).reduce((s2, p) => s2 + (results.revenue[`${g}-${l}-${s}-0`]?.[p] ?? 0), 0);
      byYear[y] = v;
    }
    revenueByGeo[geos[g]] = Object.values(byYear).reduce((s, v) => s + v, 0);
    revenueByGeoByYear[geos[g]] = Object.fromEntries(Object.entries(byYear).map(([k, v]) => [k, fmtRevenue(v)]));
  }

  // Revenue by LOT × Geo matrix
  const lotGeoMatrix = {};
  for (const ll of lotLabels) {
    lotGeoMatrix[ll] = {};
    const li = parseInt(ll) - 1;
    for (let g = 0; g < geos.length; g++) {
      let v = 0;
      for (let s = 0; s < segs; s++)
        v += Object.values(results.revenue[`${g}-${li}-${s}-0`] ?? {}).reduce((a, b) => a + b, 0);
      lotGeoMatrix[ll][geos[g]] = fmtRevenue(v);
    }
  }

  // Sample operational assumptions from first combo first period
  const firstKey = `0-0-0`;
  const firstPeriod = results.periods[0];
  const trace = results.traceData?.[firstKey]?.[firstPeriod];
  const operationalSample = trace ? {
    compliance_pct: trace.compliance,
    access_pct: trace.access,
    abandonment_pct: trace.abandonment,
    vialsPerPatientMonth: trace.vialsPerPM,
    grossPrice_per_vial: fmtPrice(trace.grossPrice),
    gtn_pct: trace.gtn,
    netPrice_per_vial: fmtPrice(trace.netPrice),
    ptrs_pct: trace.ptrs,
    iraAppliedInFirstPeriod: trace.iraApplied ?? false,
  } : null;

  // RoE / RoW totals
  let roeTotal = null, rowTotal = null;
  if (model.showRestOfEurope && results.roeByLot) {
    let v = 0;
    for (const ll of lotLabels)
      v += Object.values(results.roeByLot[ll] ?? {}).reduce((s, e) => s + (e?.revenue ?? 0), 0);
    roeTotal = fmtRevenue(v);
  }
  if (model.showRestOfWorld && results.rowByLot) {
    let v = 0;
    for (const ll of lotLabels)
      v += Object.values(results.rowByLot[ll] ?? {}).reduce((s, e) => s + (e?.revenue ?? 0), 0);
    rowTotal = fmtRevenue(v);
  }

  const topGeo = Object.entries(revenueByGeo).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topLot = Object.entries(revenueByLot).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topLotShare = totalRev > 0 ? Math.round(revenueByLot[topLot] / totalRev * 100) : 0;
  const topGeoShare = totalRev > 0 ? Math.round(revenueByGeo[topGeo] / totalRev * 100) : 0;

  return {
    asset: model.assetName,
    indication: model.indication,
    modelType: model.modelType,
    epiType: model.epiType,
    granularity: model.granularity,
    timeline: `${model.startYear} – ${model.startYear + model.timelineYears - 1}`,
    geographies: geos,
    linesOfTherapy: lots,
    segments: segs,
    segmentNames: model.segmentNames?.slice(0, segs) ?? [],
    totalCumulativeRevenue: fmtRevenue(totalRev),
    totalCumulativeRevenue_USD: Math.round(totalRev),
    peakYear: peakEntry[0],
    peakYearRevenue: fmtRevenue(peakEntry[1]),
    totalNewPatients_allYears: Math.round(totalNPS),
    totalVialsDispensed_allYears: Math.round(totalVials),
    revenueByYear: Object.fromEntries(Object.entries(revenueByYear).map(([k, v]) => [k, fmtRevenue(v)])),
    newPatientsByYear: npsByYear,
    revenueByLot: Object.fromEntries(Object.entries(revenueByLot).map(([k, v]) => [k, fmtRevenue(v)])),
    revenueByLotByYear,
    revenueByGeo: Object.fromEntries(Object.entries(revenueByGeo).map(([k, v]) => [k, fmtRevenue(v)])),
    revenueByGeoByYear,
    lotGeoMatrix,
    topGeography: topGeo,
    topGeographyShareOfTotal: `${topGeoShare}%`,
    topLineOfTherapy: topLot,
    topLotShareOfTotal: `${topLotShare}%`,
    roeAggregateRevenue: roeTotal,
    rowAggregateRevenue: rowTotal,
    operationalAssumptions_firstCombo: operationalSample,
    iraApplied: model.applyIRA ? { fromYear: model.iraYear, discountRate: `${model.iraDiscountRate}%`, smallMolecule: model.iraSmallMolecule } : null,
    ptrsApplied: model.applyPTRS ? { probability: `${model.ptrsValue}%`, impliedHaircut: `${100 - model.ptrsValue}%` } : null,
  };
}

function NarrativeSection({ model, results }) {
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const summary = buildNarrativeSummary(model, results);
      const res = await fetch(`${API}/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Backend returned unexpected response — is the backend restarted? (${res.status})`); }
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setNarrative(data.narrative);
      setExpanded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div
        className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
        onClick={() => narrative && setExpanded(e => !e)}
      >
        <div className="w-8 h-8 rounded-lg bg-violet-600/15 border border-violet-500/20 flex items-center justify-center text-violet-600 shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-slate-200 text-sm font-medium">AI Forecast Narrative</p>
          <p className="text-slate-500 text-xs mt-0.5">
            {narrative && !expanded ? "Click to expand" : "Executive summary generated from your forecast results"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {narrative && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); generate(); }}
            disabled={loading}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors"
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            )}
            {loading ? "Generating…" : narrative ? "Regenerate" : "Generate Summary"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-5 py-4 text-red-500 text-xs bg-red-50 border-b border-red-100">
          {error}
        </div>
      )}

      {narrative && !loading && expanded && (
        <div className="px-5 py-5 border-t border-slate-800">
          <div className="prose prose-sm max-w-none">
            {narrative.split("\n\n").filter(p => p.trim()).map((para, i) => (
              <p key={i} className="text-slate-200 text-sm leading-relaxed mb-3 last:mb-0">
                {para.trim()}
              </p>
            ))}
          </div>
          <button
            onClick={() => setExpanded(false)}
            className="mt-4 flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            Collapse summary
          </button>
        </div>
      )}

      {!narrative && !loading && !error && (
        <div className="px-5 py-8 text-center">
          <p className="text-slate-500 text-sm">Click "Generate Summary" to get an AI-written executive narrative of these results.</p>
        </div>
      )}
    </div>
  );
}

// ─── Combo Detail (funnel trace) ─────────────────────────────────────────────

const OP_SYMBOL = { complement: "1−x", multiply: "×", divide: "÷", add: "+", subtract: "−" };
const OP_IS_ABS = { add: true, subtract: true };

function fmtNum(v, decimals = 0) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return Number(v.toFixed(decimals)).toLocaleString("en-US");
}
function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return `${Number(v.toFixed(1))}%`;
}
function fmtPrice(v) {
  if (!v && v !== 0) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Number(v.toFixed(2)).toLocaleString("en-US")}`;
}

// Build human-readable combo label for the dropdown
function makeComboLabel(model, geoIdx, lotIdx, segIdx) {
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const parts = [];
  if (geos.length > 1) parts.push(geos[geoIdx]);
  parts.push(`${lotIdx + 1}L`);
  const segName = model.segmentNames?.[segIdx] || (model.segments > 1 ? `Seg ${segIdx + 1}` : null);
  if (segName && model.segments > 1) parts.push(segName);
  return parts.join(" / ") || "All";
}

// Build the row definitions for the trace table
function buildTraceRows(model, results, key3, isIncidence, isPatientFlow) {
  const rows = [];
  const samplePeriod = results.periods[0];
  const sample = results.traceData[key3]?.[samplePeriod];
  if (!sample) return rows;

  // ── Section: Epidemiology Pool ──────────────────────────────────────────
  rows.push({ type: "section", label: "Epidemiology Pool" });
  rows.push({
    type: "data", label: "EPI Base (diagnosed pool)",
    getValue: p => results.traceData[key3]?.[p]?.epiBase ?? 0,
    fmt: v => fmtNum(v), aggregate: "sum",
    color: "text-blue-300",
  });
  sample.funnelSteps.forEach(step => {
    const opSym = OP_SYMBOL[step.operator] ?? step.operator;
    const isAbs = OP_IS_ABS[step.operator];
    rows.push({
      type: "data",
      label: step.label,
      sublabel: `${opSym} ${step.appliedValue !== null ? (isAbs ? fmtNum(step.appliedValue) : fmtPct(step.appliedValue)) : "?"}`,
      getValue: p => results.traceData[key3]?.[p]?.funnelSteps?.find(s => s.id === step.id)?.outputPool ?? 0,
      fmt: v => fmtNum(v), aggregate: "avg",
      color: "text-slate-200",
      indent: true,
    });
  });
  rows.push({
    type: "subtotal", label: "Eligible Patients",
    getValue: p => results.traceData[key3]?.[p]?.eligible ?? 0,
    fmt: v => fmtNum(v), aggregate: "avg",
    color: "text-blue-200",
  });

  // ── Section: Market Conversion ──────────────────────────────────────────
  rows.push({ type: "section", label: "Market Conversion" });
  rows.push({
    type: "data", label: `Market Share — ${model.assetName || "Key Product"}`,
    getValue: p => results.traceData[key3]?.[p]?.shareRaw ?? 0,
    fmt: v => fmtPct(v), aggregate: "avg",
    color: "text-violet-300",
  });
  rows.push({
    type: "subtotal",
    label: isIncidence ? "New Patient Starts (NPS)" : "Total Patients",
    getValue: p => results.traceData[key3]?.[p]?.nps ?? 0,
    fmt: v => fmtNum(v), aggregate: "sum",
    color: "text-violet-700",
  });

  // ── Section: Duration of Therapy ───────────────────────────────────────
  if (isIncidence) {
    rows.push({ type: "section", label: "Duration of Therapy" });
    rows.push({
      type: "data", label: "Active Patients (start of period)",
      getValue: p => results.traceData[key3]?.[p]?.activeStart ?? 0,
      fmt: v => fmtNum(v), aggregate: "avg",
      color: "text-slate-300",
    });
    rows.push({
      type: "data", label: "Median DoT",
      getValue: p => results.traceData[key3]?.[p]?.medianMonths ?? 0,
      fmt: v => v ? `${fmtNum(v, 1)} mo` : "not set", aggregate: "first",
      color: "text-slate-400",
    });
    rows.push({
      type: "data", label: "Patient-Months",
      getValue: p => results.traceData[key3]?.[p]?.pm ?? 0,
      fmt: v => fmtNum(v), aggregate: "sum",
      color: "text-slate-400",
    });
    rows.push({
      type: "data", label: "Active Patients (end of period)",
      getValue: p => results.traceData[key3]?.[p]?.activeEnd ?? 0,
      fmt: v => fmtNum(v), aggregate: "avg",
      color: "text-slate-400",
    });
    if (isPatientFlow) {
      rows.push({
        type: "data", label: "Progression Rate",
        getValue: p => results.traceData[key3]?.[p]?.progRatePct ?? 0,
        fmt: v => fmtPct(v), aggregate: "avg",
        color: "text-amber-400",
      });
      rows.push({
        type: "data", label: "Patients Progressing to Next Line",
        getValue: p => results.traceData[key3]?.[p]?.progressingOut ?? 0,
        fmt: v => fmtNum(v), aggregate: "sum",
        color: "text-amber-300",
      });
    }
  } else {
    rows.push({ type: "section", label: "Patient Volume" });
    rows.push({
      type: "data", label: "Patient-Months",
      getValue: p => results.traceData[key3]?.[p]?.pm ?? 0,
      fmt: v => fmtNum(v), aggregate: "sum",
      color: "text-slate-400",
    });
  }

  // ── Section: Revenue Build ──────────────────────────────────────────────
  rows.push({ type: "section", label: "Revenue Build" });
  [
    { id: "compliance",  label: "Compliance",              fmt: fmtPct,   key: "compliance",  color: "text-slate-300",   agg: "avg" },
    { id: "access",      label: "Access Rate",             fmt: fmtPct,   key: "access",      color: "text-slate-300",   agg: "avg" },
    { id: "abandonment", label: "Abandonment (1 − x)",fmt: fmtPct,   key: "abandonment", color: "text-slate-300",   agg: "avg" },
    { id: "vials",       label: "Vials / Patient-Month",   fmt: v => fmtNum(v, 2), key: "vialsPerPM", color: "text-slate-300", agg: "avg" },
    { id: "gross",       label: "Gross Price / Vial",      fmt: fmtPrice, key: "grossPrice",  color: "text-slate-300",   agg: "avg" },
    { id: "gtn",         label: "GTN (1 − x)",        fmt: fmtPct,   key: "gtn",         color: "text-slate-300",   agg: "avg" },
    { id: "net",         label: "Net Price / Vial",        fmt: fmtPrice, key: "netPrice",    color: "text-emerald-700", agg: "avg" },
  ].forEach(row => {
    rows.push({ type: "data", label: row.label, getValue: p => results.traceData[key3]?.[p]?.[row.key] ?? 0, fmt: row.fmt, aggregate: row.agg, color: row.color, indent: row.id !== "net" });
  });

  rows.push({
    type: "subtotal", label: "Vials Dispensed",
    getValue: p => results.traceData[key3]?.[p]?.vialsDispensed ?? 0,
    fmt: v => fmtNum(v), aggregate: "sum",
    color: "text-teal-300",
  });
  if (sample.iraApplied !== undefined) {
    rows.push({
      type: "data", label: "IRA Price Discount",
      getValue: p => {
        const t = results.traceData[key3]?.[p];
        return t?.iraApplied ? t.iraDiscountApplied : null;
      },
      fmt: v => v !== null ? `-${fmtPct(v)}` : "not applied",
      aggregate: "first",
      color: "text-amber-400",
      indent: true,
    });
  }
  rows.push({
    type: "data", label: "PTRS",
    getValue: p => results.traceData[key3]?.[p]?.ptrs ?? 100,
    fmt: fmtPct, aggregate: "avg",
    color: "text-slate-300",
    indent: true,
  });
  rows.push({
    type: "total", label: "Revenue",
    getValue: p => results.traceData[key3]?.[p]?.revenue ?? 0,
    fmt: fmtRevenue, aggregate: "sum",
    color: "text-violet-300",
  });

  return rows;
}

function ComboDetailSection({ model, results }) {
  const isIncidence = (model.epiType ?? "Incidence") === "Incidence";
  const isPatientFlow = model.modelType === "Patient Flow";
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const lots = model.linesOfTherapy ?? 1;
  const segs = model.segments ?? 1;

  // Build combo options (asset / p=0 only)
  const comboOptions = useMemo(() => {
    const opts = [];
    for (let g = 0; g < geos.length; g++)
      for (let l = 0; l < lots; l++)
        for (let s = 0; s < segs; s++)
          opts.push({ key: `${g}-${l}-${s}`, label: makeComboLabel(model, g, l, s) });
    return opts;
  }, [geos.length, lots, segs]);

  const [selectedKey, setSelectedKey] = useState(comboOptions[0]?.key ?? "");

  const traceRows = useMemo(
    () => selectedKey ? buildTraceRows(model, results, selectedKey, isIncidence, isPatientFlow) : [],
    [selectedKey, results, isIncidence, isPatientFlow]
  );

  // For monthly models, show yearly aggregated columns in the trace table
  const isMonthly = model.granularity === "Monthly";
  const displayPeriods = isMonthly ? results.years.map(String) : results.periods;

  // Aggregator for monthly → yearly
  function getVal(row, displayPeriod) {
    if (!isMonthly) return row.getValue(displayPeriod);
    const monthKeys = results.periods.filter(p => p.startsWith(displayPeriod + "-"));
    if (!monthKeys.length) return 0;
    const vals = monthKeys.map(p => row.getValue(p)).filter(v => v !== null && !isNaN(v));
    if (!vals.length) return 0;
    const agg = row.aggregate ?? "avg";
    if (agg === "sum") return vals.reduce((a, b) => a + b, 0);
    if (agg === "first") return vals[0] ?? 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length; // avg
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-slate-200 text-sm font-medium">Forecast Funnel — Combo Detail</p>
          <p className="text-slate-500 text-xs mt-0.5">Step-by-step calculation for {model.assetName || "key product"} · select combination below</p>
        </div>
        <div className="ml-auto">
          <select
            value={selectedKey}
            onChange={e => setSelectedKey(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-violet-500 transition-colors"
          >
            {comboOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Trace table */}
      {traceRows.length > 0 && (
        <div className="overflow-auto" style={{ maxHeight: 640 }}>
          <table className="w-full border-collapse text-xs" style={{ minWidth: `${180 + displayPeriods.length * 90}px` }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800 border-b border-slate-700">
                <th className="sticky left-0 bg-slate-800 text-left px-4 py-2.5 text-slate-300 font-medium whitespace-nowrap border-r border-slate-700" style={{ minWidth: 260 }}>
                  Metric
                </th>
                {displayPeriods.map(p => (
                  <th key={p} className="text-right px-3 py-2.5 text-slate-400 font-medium whitespace-nowrap" style={{ minWidth: 86 }}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {traceRows.map((row, ri) => {
                if (row.type === "section") {
                  return (
                    <tr key={ri} className="border-t-2 border-slate-700/60">
                      <td colSpan={displayPeriods.length + 1} className="px-4 py-2 bg-slate-800/50 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                        {row.label}
                      </td>
                    </tr>
                  );
                }
                const isEven = ri % 2 === 0;
                const rowBg = row.type === "total" ? "bg-violet-600/10"
                  : row.type === "subtotal" ? "bg-slate-800/40"
                  : isEven ? "bg-slate-950" : "bg-slate-900/40";
                return (
                  <tr key={ri} className={`border-b border-slate-800/40 ${rowBg}`}>
                    <td className={`sticky left-0 px-4 py-2 border-r border-slate-800 whitespace-nowrap ${rowBg}`}>
                      <div className={row.indent ? "pl-4" : ""}>
                        <p className={`font-medium leading-tight ${row.color}`}>{row.label}</p>
                        {row.sublabel && <p className="text-slate-400 text-xs font-mono">{row.sublabel}</p>}
                      </div>
                    </td>
                    {displayPeriods.map(p => {
                      const v = getVal(row, p);
                      return (
                        <td key={p} className={`text-right px-3 py-2 tabular-nums ${row.type === "total" ? "text-violet-300 font-semibold" : row.type === "subtotal" ? row.color + " font-medium" : row.color}`}>
                          {v !== null ? row.fmt(v) : <span className="text-slate-500">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {traceRows.length === 0 && (
        <div className="px-5 py-6 text-slate-500 text-xs text-center">
          No trace data available for this combination — ensure EPI assumptions are saved and re-run the forecast.
        </div>
      )}
    </div>
  );
}

// ─── Detailed Results — periods as columns ───────────────────────────────────

function DetailedResultsTables({ model, results }) {
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const lots = model.linesOfTherapy ?? 1;
  const segs = model.segments ?? 1;
  const lotLabels = Array.from({ length: lots }, (_, i) => `${i + 1}L`);
  const segLabels = Array.from({ length: segs }, (_, i) => model.segmentNames?.[i] || `Seg ${i + 1}`);
  const isMonthlyModel = model.granularity === "Monthly";

  const [metric, setMetric] = useState("revenue");
  const [granularity, setGranularity] = useState("yearly");
  const [viewBy, setViewBy] = useState("lot"); // "lot" | "geo" | "segment"

  const showRoE = model.showRestOfEurope && Object.keys(results.roeByLot ?? {}).length > 0;
  const showRoW = model.showRestOfWorld && Object.keys(results.rowByLot ?? {}).length > 0;

  const displayPeriods = (!isMonthlyModel || granularity === "yearly")
    ? results.years.map(String)
    : results.periods;

  // Aggregate months to year when needed
  function agg(keyFn, dp) {
    if (!isMonthlyModel || granularity === "monthly") return keyFn(dp) ?? 0;
    return results.periods.filter(p => p.startsWith(dp + "-")).reduce((s, p) => s + (keyFn(p) ?? 0), 0);
  }

  function getMetricVal(gIdx, lotIdx, segIdx, dp) {
    const k = `${gIdx}-${lotIdx}-${segIdx}-0`;
    if (metric === "revenue") return agg(p => results.revenue[k]?.[p] ?? 0, dp);
    if (metric === "nps")     return agg(p => results.nps[k]?.[p]     ?? 0, dp);
    return                           agg(p => results.vials[k]?.[p]   ?? 0, dp);
  }

  // Sum across all segments for a geo×lot
  function geoLotVal(gIdx, lotIdx, dp) {
    let v = 0;
    for (let s = 0; s < segs; s++) v += getMetricVal(gIdx, lotIdx, s, dp);
    return v;
  }

  // Sum across all geos (and segs) for a lot
  function lotVal(lotIdx, dp) {
    let v = 0;
    for (let g = 0; g < geos.length; g++) v += geoLotVal(g, lotIdx, dp);
    if (showRoE) v += derivedVal(results.roeByLot, lotLabels[lotIdx], dp);
    if (showRoW) v += derivedVal(results.rowByLot, lotLabels[lotIdx], dp);
    return v;
  }

  // Sum across all lots (and segs) for a geo
  function geoVal(gIdx, dp) {
    let v = 0;
    for (let l = 0; l < lots; l++) v += geoLotVal(gIdx, l, dp);
    return v;
  }

  // Sum across all geos and lots for a segment
  function segVal(segIdx, dp) {
    let v = 0;
    for (let g = 0; g < geos.length; g++)
      for (let l = 0; l < lots; l++)
        v += getMetricVal(g, l, segIdx, dp);
    return v;
  }

  // Sum lot values for a specific segment
  function segLotVal(segIdx, lotIdx, dp) {
    let v = 0;
    for (let g = 0; g < geos.length; g++) v += getMetricVal(g, lotIdx, segIdx, dp);
    return v;
  }

  function derivedVal(byLot, lotLabel, dp) {
    if (metric === "revenue") return agg(p => byLot[lotLabel]?.[p]?.revenue ?? 0, dp);
    if (metric === "nps")     return agg(p => byLot[lotLabel]?.[p]?.nps     ?? 0, dp);
    return 0;
  }

  function fmt(v) {
    return metric === "revenue" ? fmtRevenue(v) : fmtInt(v);
  }

  // ── Build row definitions per view ───────────────────────────────────────────
  const rowDefs = useMemo(() => {
    const rows = [];

    if (viewBy === "lot") {
      for (let li = 0; li < lots; li++) {
        rows.push({ type: "section", label: lotLabels[li], lotIdx: li });
        for (let gi = 0; gi < geos.length; gi++)
          rows.push({ type: "data", label: geos[gi], geoIdx: gi, lotIdx: li });
        if (showRoE) rows.push({ type: "roe-data", label: "RoE", lotIdx: li, lotLabel: lotLabels[li] });
        if (showRoW) rows.push({ type: "row-data", label: "RoW", lotIdx: li, lotLabel: lotLabels[li] });
        rows.push({ type: "subtotal", label: `${lotLabels[li]} Total`, lotIdx: li });
      }
    } else if (viewBy === "geo") {
      for (let gi = 0; gi < geos.length; gi++) {
        rows.push({ type: "section", label: geos[gi], geoIdx: gi });
        for (let li = 0; li < lots; li++)
          rows.push({ type: "data", label: lotLabels[li], geoIdx: gi, lotIdx: li });
        rows.push({ type: "subtotal", label: `${geos[gi]} Total`, geoIdx: gi });
      }
      if (showRoE) {
        rows.push({ type: "section", label: "RoE" });
        for (let li = 0; li < lots; li++)
          rows.push({ type: "roe-data", label: lotLabels[li], lotIdx: li, lotLabel: lotLabels[li] });
        rows.push({ type: "roe-subtotal", label: "RoE Total" });
      }
      if (showRoW) {
        rows.push({ type: "section", label: "RoW" });
        for (let li = 0; li < lots; li++)
          rows.push({ type: "row-data", label: lotLabels[li], lotIdx: li, lotLabel: lotLabels[li] });
        rows.push({ type: "row-subtotal", label: "RoW Total" });
      }
    } else {
      // by segment
      for (let si = 0; si < segs; si++) {
        rows.push({ type: "section", label: segLabels[si], segIdx: si });
        for (let li = 0; li < lots; li++)
          rows.push({ type: "data", label: lotLabels[li], segIdx: si, lotIdx: li });
        rows.push({ type: "subtotal", label: `${segLabels[si]} Total`, segIdx: si });
      }
    }

    rows.push({ type: "grand-total" });
    return rows;
  }, [viewBy, lots, geos.length, segs, showRoE, showRoW]);

  const COL_W = granularity === "monthly" ? 80 : 96;
  const LABEL_W = 200;

  // Resolve value for a data row
  function rowVals(row, dp) {
    if (viewBy === "lot") {
      if (row.type === "data")     return geoLotVal(row.geoIdx, row.lotIdx, dp);
      if (row.type === "roe-data") return derivedVal(results.roeByLot, row.lotLabel, dp);
      if (row.type === "row-data") return derivedVal(results.rowByLot, row.lotLabel, dp);
    }
    if (viewBy === "geo") {
      if (row.type === "data")     return geoLotVal(row.geoIdx, row.lotIdx, dp);
      if (row.type === "roe-data") return derivedVal(results.roeByLot, row.lotLabel, dp);
      if (row.type === "row-data") return derivedVal(results.rowByLot, row.lotLabel, dp);
    }
    if (viewBy === "segment") {
      if (row.type === "data") return segLotVal(row.segIdx, row.lotIdx, dp);
    }
    return 0;
  }

  function subtotalVals(row, dp) {
    if (viewBy === "lot") {
      return lotVal(row.lotIdx, dp);
    }
    if (viewBy === "geo") {
      if (row.type === "subtotal")     return geoVal(row.geoIdx, dp);
      if (row.type === "roe-subtotal") {
        let v = 0;
        for (let li = 0; li < lots; li++) v += derivedVal(results.roeByLot, lotLabels[li], dp);
        return v;
      }
      if (row.type === "row-subtotal") {
        let v = 0;
        for (let li = 0; li < lots; li++) v += derivedVal(results.rowByLot, lotLabels[li], dp);
        return v;
      }
    }
    if (viewBy === "segment") {
      return segVal(row.segIdx, dp);
    }
    return 0;
  }

  function grandTotalVals(dp) {
    let v = 0;
    for (let li = 0; li < lots; li++) v += lotVal(li, dp);
    return v;
  }

  const viewLabel = viewBy === "lot" ? "Line of Therapy → Geography"
    : viewBy === "geo" ? "Geography → Line of Therapy"
    : "Segment → Line of Therapy";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Controls bar */}
      <div className="px-5 py-3 border-b border-slate-800 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-slate-200 text-sm font-medium">Detailed Results</p>
          <p className="text-slate-500 text-xs mt-0.5">{viewLabel} · asset only</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* View By toggle */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
            {[
              { id: "lot",     label: "By LOT" },
              { id: "geo",     label: "By Geography" },
              ...(segs > 1 ? [{ id: "segment", label: "By Segment" }] : []),
            ].map(v => (
              <button key={v.id} onClick={() => setViewBy(v.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewBy === v.id ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
              >{v.label}</button>
            ))}
          </div>

          {/* Metric toggle */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
            {[
              { id: "revenue", label: "Revenue" },
              { id: "nps",     label: "New Patients" },
              { id: "vials",   label: "Vials" },
            ].map(m => (
              <button key={m.id} onClick={() => setMetric(m.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${metric === m.id ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
              >{m.label}</button>
            ))}
          </div>

          {/* Granularity toggle — monthly models only */}
          {isMonthlyModel && (
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
              {[{ id: "yearly", label: "Yearly" }, { id: "monthly", label: "Monthly" }].map(g => (
                <button key={g.id} onClick={() => setGranularity(g.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${granularity === g.id ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                >{g.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto" style={{ maxHeight: 560 }}>
        <table className="border-collapse text-xs" style={{ minWidth: LABEL_W + displayPeriods.length * COL_W + COL_W }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#dbe8f8] border-b border-[#b3cce8]">
              <th className="sticky left-0 text-left px-4 py-2.5 font-semibold border-r border-[#b3cce8] whitespace-nowrap bg-[#dbe8f8] text-slate-100" style={{ minWidth: LABEL_W }}>
                {viewBy === "lot" ? "Geography" : viewBy === "geo" ? "Line of Therapy" : "Line of Therapy"}
              </th>
              {displayPeriods.map(dp => (
                <th key={dp} className="text-right px-3 py-2.5 font-medium whitespace-nowrap text-slate-200" style={{ minWidth: COL_W }}>
                  {periodLabel(dp)}
                </th>
              ))}
              <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap border-l border-[#b3cce8] text-slate-100" style={{ minWidth: COL_W }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rowDefs.map((row, ri) => {

              // ── Section header ──────────────────────────────────────────────
              if (row.type === "section") {
                return (
                  <tr key={`sec-${ri}`} className="border-t border-[#bfdbfe]">
                    <td colSpan={displayPeriods.length + 2} className="px-4 py-1.5 bg-[#eff6ff]">
                      <span className="text-violet-600 font-bold text-xs tracking-wide">{row.label}</span>
                    </td>
                  </tr>
                );
              }

              // ── Subtotal row ────────────────────────────────────────────────
              if (["subtotal", "roe-subtotal", "row-subtotal"].includes(row.type)) {
                const vals = displayPeriods.map(dp => subtotalVals(row, dp));
                const total = vals.reduce((s, v) => s + v, 0);
                return (
                  <tr key={`sub-${ri}`} className="border-t border-[#bfdbfe] border-b-2 border-b-[#bfdbfe]">
                    <td className="sticky left-0 px-4 py-2 font-semibold border-r border-[#bfdbfe] bg-[#dbeafe] text-violet-700 whitespace-nowrap pl-4">
                      {row.label}
                    </td>
                    {vals.map((v, i) => (
                      <td key={i} className="text-right px-3 py-2 tabular-nums font-semibold bg-[#dbeafe] text-violet-700">{fmt(v)}</td>
                    ))}
                    <td className="text-right px-3 py-2 tabular-nums font-semibold bg-[#dbeafe] text-violet-700 border-l border-[#bfdbfe]">{fmt(total)}</td>
                  </tr>
                );
              }

              // ── Grand total ─────────────────────────────────────────────────
              if (row.type === "grand-total") {
                const vals = displayPeriods.map(dp => grandTotalVals(dp));
                const total = vals.reduce((s, v) => s + v, 0);
                return (
                  <tr key="grand-total" className="border-t-2 border-[#a5b4fc]">
                    <td className="sticky left-0 px-4 py-2.5 font-bold border-r border-[#c4b5fd] bg-[#ede9fe] text-violet-800 whitespace-nowrap">
                      Grand Total
                    </td>
                    {vals.map((v, i) => (
                      <td key={i} className="text-right px-3 py-2.5 tabular-nums font-bold bg-[#ede9fe] text-violet-800">{fmt(v)}</td>
                    ))}
                    <td className="text-right px-3 py-2.5 tabular-nums font-bold bg-[#ede9fe] text-violet-800 border-l border-[#c4b5fd]">{fmt(total)}</td>
                  </tr>
                );
              }

              // ── Data row ────────────────────────────────────────────────────
              const isEven = ri % 2 === 0;
              const bg       = isEven ? "#ffffff" : "#f0f6ff";
              const stickyBg = isEven ? "#ffffff" : "#e8f0fd";
              const vals = displayPeriods.map(dp => rowVals(row, dp));
              const rowTotal = vals.reduce((s, v) => s + v, 0);

              return (
                <tr key={`data-${ri}`} style={{ background: bg }} className="border-b border-[#d1e0f5]">
                  <td className="sticky left-0 px-4 py-2 text-slate-200 font-medium whitespace-nowrap border-r border-[#d1e0f5] pl-8" style={{ background: stickyBg }}>
                    {row.label}
                  </td>
                  {vals.map((v, i) => (
                    <td key={i} className="text-right px-3 py-2 tabular-nums text-slate-100">{fmt(v)}</td>
                  ))}
                  <td className="text-right px-3 py-2 tabular-nums text-slate-200 font-medium border-l border-[#d1e0f5]">{fmt(rowTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main output component ────────────────────────────────────────────────────

export default function ForecastOutput({ model }) {
  const [results, setResults] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartMetric, setChartMetric] = useState("revenue");
  const [chartGranularity, setChartGranularity] = useState("yearly");

  const isMonthlyModel = (model.granularity ?? "Yearly") === "Monthly";

  function handleRun() {
    setLoading(true);
    setError(null);
    setTimeout(() => {
      try {
        const r = runForecast(model);
        setResults(r);
        setLastRun(new Date().toLocaleTimeString());
      } catch (e) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    }, 0);
  }

  const lots = model.linesOfTherapy ?? 1;
  const lotLabels = Array.from({ length: lots }, (_, i) => `${i + 1}L`);
  const geoCount = model.geographies?.length > 0 ? model.geographies.length : 1;
  const segs = model.segments ?? 1;

  // Build chart data — metric-aware, granularity-aware
  const chartData = useMemo(() => {
    if (!results) return [];
    const showMonthly = isMonthlyModel && chartGranularity === "monthly";
    const periodKeys = showMonthly ? results.periods : (isMonthlyModel ? results.years.map(String) : results.periods);

    function lotVal(ll, p) {
      const lotIdx = parseInt(ll) - 1;
      if (chartMetric === "revenue") {
        if (showMonthly || !isMonthlyModel) return (results.revenueByLot[ll]?.[p] ?? 0) / 1_000_000;
        // aggregate months to year
        return results.periods.filter(mp => mp.startsWith(p + "-"))
          .reduce((s, mp) => s + (results.revenueByLot[ll]?.[mp] ?? 0), 0) / 1_000_000;
      }
      // NPS or Vials — sum across geos × segs
      let v = 0;
      const pList = (showMonthly || !isMonthlyModel) ? [p] : results.periods.filter(mp => mp.startsWith(p + "-"));
      for (const pp of pList) {
        for (let g = 0; g < geoCount; g++) {
          for (let s = 0; s < segs; s++) {
            const k4 = `${g}-${lotIdx}-${s}-0`;
            if (chartMetric === "nps")   v += results.nps[k4]?.[pp]   ?? 0;
            if (chartMetric === "vials") v += results.vials[k4]?.[pp] ?? 0;
          }
        }
      }
      return v;
    }

    return periodKeys.map(p => {
      const row = { period: periodLabel(p) };
      for (const ll of lotLabels) row[ll] = lotVal(ll, p);
      return row;
    });
  }, [results, chartMetric, chartGranularity]);

  // Peak year revenue
  const peakRevenue = results
    ? Math.max(0, ...Object.values(results.totalRevenue))
    : 0;

  // Total revenue sum
  const totalRev = results
    ? Object.values(results.totalRevenue).reduce((s, v) => s + v, 0)
    : 0;

  // Total NPS sum
  const totalNPSSum = results
    ? Object.values(results.totalNPS).reduce((s, v) => s + v, 0)
    : 0;

  // Total Vials sum
  const totalVialsSum = results
    ? Object.values(results.totalVials).reduce((s, v) => s + v, 0)
    : 0;

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
          {loading ? "Running…" : "Run Forecast"}
        </button>
        {lastRun && !loading && (
          <span className="text-slate-500 text-xs">Last run: {lastRun}</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl px-5 py-4">
          <p className="text-red-400 text-sm font-medium">Forecast error</p>
          <p className="text-red-300 text-xs mt-1 font-mono">{error}</p>
        </div>
      )}

      {results && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Total Revenue (all periods)"
              value={fmtRevenue(totalRev)}
            />
            <SummaryCard
              label="Peak Period Revenue"
              value={fmtRevenue(peakRevenue)}
            />
            <SummaryCard
              label="Total New Patients"
              value={fmtInt(totalNPSSum)}
              sub="all asset combos"
            />
            <SummaryCard
              label="Total Vials Dispensed"
              value={fmtInt(totalVialsSum)}
              sub="all asset combos"
            />
          </div>

          {/* AI Narrative */}
          <NarrativeSection model={model} results={results} />

          {/* Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center gap-3">
              <div>
                <p className="text-slate-200 text-sm font-medium">Forecast Over Time</p>
                <p className="text-slate-500 text-xs mt-0.5">Stacked by line of therapy</p>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                {/* Metric tabs */}
                <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
                  {[
                    { id: "revenue", label: "Revenue" },
                    { id: "nps",     label: "New Patients" },
                    { id: "vials",   label: "Vials" },
                  ].map(m => (
                    <button key={m.id} onClick={() => setChartMetric(m.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${chartMetric === m.id ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                    >{m.label}</button>
                  ))}
                </div>
                {/* Granularity (monthly models only) */}
                {isMonthlyModel && (
                  <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
                    {[{ id: "yearly", label: "Yearly" }, { id: "monthly", label: "Monthly" }].map(g => (
                      <button key={g.id} onClick={() => setChartGranularity(g.id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${chartGranularity === g.id ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                      >{g.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fill: "#334155", fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: "#334155", fontSize: 11 }}
                    tickFormatter={v =>
                      chartMetric === "revenue"
                        ? `$${v.toFixed(1)}M`
                        : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(Math.round(v))
                    }
                  />
                  <Tooltip content={<CustomTooltip metric={chartMetric} />} />
                  {lots > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "#334155" }} />}
                  {lotLabels.map((ll, i) => (
                    <Bar key={ll} dataKey={ll} stackId="a"
                      fill={LOT_COLORS[i % LOT_COLORS.length]}
                      radius={i === lots - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Combo Detail */}
          <ComboDetailSection model={model} results={results} />

          {/* Detailed Tables — one per LOT */}
          <DetailedResultsTables model={model} results={results} />
        </>
      )}

      {!results && !loading && !error && (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-slate-300 font-semibold">No forecast run yet</p>
            <p className="text-slate-500 text-sm mt-1 max-w-md">Click "Run Forecast" to compute revenue, patient counts, and vials dispensed from your saved assumptions.</p>
          </div>
        </div>
      )}
    </div>
  );
}
