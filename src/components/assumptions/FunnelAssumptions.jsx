import { useState } from "react";
import { useForecast } from "../../store/forecastStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const OPERATORS = [
  {
    id: "complement",
    symbol: "1−x",
    label: "Complement",
    hint: "pool × (1 − value%)",
    pct: true,
    apply: (pool, v) => pool * (1 - v / 100),
  },
  {
    id: "multiply",
    symbol: "×",
    label: "Multiply",
    hint: "pool × value%",
    pct: true,
    apply: (pool, v) => pool * (v / 100),
  },
  {
    id: "divide",
    symbol: "÷",
    label: "Divide",
    hint: "pool ÷ value%",
    pct: true,
    apply: (pool, v) => (v !== 0 ? pool / (v / 100) : pool),
  },
  {
    id: "add",
    symbol: "+",
    label: "Add",
    hint: "pool + value (absolute)",
    pct: false,
    apply: (pool, v) => pool + v,
  },
  {
    id: "subtract",
    symbol: "−",
    label: "Subtract",
    hint: "pool − value (absolute)",
    pct: false,
    apply: (pool, v) => pool - v,
  },
];

function getOp(id) {
  return OPERATORS.find(o => o.id === id) ?? OPERATORS[0];
}

function fmt(n) {
  const v = Math.round(n);
  return isNaN(v) ? "—" : v.toLocaleString("en-US");
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FunnelAssumptions({ model }) {
  const { updateModel } = useForecast();

  // Initialise from saved assumptions or seed from wizard funnel
  function initSteps() {
    const saved = model.funnelAssumptions ?? [];
    return (model.epiFunnel ?? []).map((factor, idx) => {
      const s = saved.find(s => s.id === factor.id) ?? {};
      return {
        id:          factor.id,
        label:       s.label       ?? factor.label,
        description: s.description ?? factor.description ?? "",
        operator:    s.operator    ?? (idx === 0 ? null : "complement"),
        value:       s.value       !== undefined ? s.value : (idx === 0 ? null : 80),
        locked:      factor.locked ?? false,
      };
    });
  }

  const [steps, setSteps]     = useState(initSteps);
  const [saving, setSaving]   = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [dirty, setDirty]     = useState(false);
  const [editIdx, setEditIdx] = useState(null); // which row is in edit mode

  function patch(idx, changes) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...changes } : s));
    setDirty(true);
  }

  // Compute running patient pool — uses epi computed values as anchor for step 0
  const epiTotal = (() => {
    const cv = model.epiAssumptions?.computedValues ?? {};
    const keys = Object.keys(cv);
    if (!keys.length) return 0;
    return keys.reduce((s, k) => s + (parseFloat(cv[k]) || 0), 0);
  })();

  const runningPools = steps.reduce((acc, step, idx) => {
    if (idx === 0) {
      acc.push(epiTotal || null);
      return acc;
    }
    const prev = acc[idx - 1];
    if (prev === null || step.value === null || step.value === "" || isNaN(step.value)) {
      acc.push(null);
      return acc;
    }
    const op = getOp(step.operator);
    acc.push(Math.max(0, op.apply(prev, parseFloat(step.value))));
    return acc;
  }, []);

  async function handleSave() {
    setSaving(true);
    const funnelAssumptions = steps.map(s => ({
      id:          s.id,
      label:       s.label,
      description: s.description,
      operator:    s.operator,
      value:       s.value,
    }));
    await fetch(`${API}/models/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funnelAssumptions }),
    });
    updateModel(model.id, { funnelAssumptions });
    setSaving(false);
    setDirty(false);
    setSavedAt(new Date().toLocaleTimeString());
  }

  const hasEpi = epiTotal > 0;

  return (
    <div className="divide-y divide-slate-800">

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <div className="px-5 py-3 flex items-center justify-between bg-slate-900/60">
        <p className="text-slate-500 text-xs">
          {hasEpi
            ? `Anchor: ${fmt(epiTotal)} total ${model.epiType?.toLowerCase() ?? "patients"} · configure each cut below`
            : "Save Epidemiology assumptions first to see running patient pools"}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600">
            {dirty
              ? <span className="text-amber-500">Unsaved changes</span>
              : savedAt ? `Saved ${savedAt}` : ""}
          </span>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            {saving
              ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            }
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Funnel steps ─────────────────────────────────────────────────── */}
      <div className="px-5 py-5 space-y-2">
        {steps.map((step, idx) => {
          const pool    = runningPools[idx];
          const prevPool = idx > 0 ? runningPools[idx - 1] : null;
          const op      = step.operator ? getOp(step.operator) : null;
          const isFirst = idx === 0;
          const isEdit  = editIdx === idx;

          return (
            <div key={step.id} className="group">
              {/* Connector arrow */}
              {idx > 0 && (
                <div className="flex items-center gap-3 pl-3 mb-1 select-none">
                  <div className="w-px h-4 bg-slate-800 ml-3" />
                  {op && (
                    <span className="text-slate-600 text-xs font-mono">
                      {op.symbol} {step.value !== null && step.value !== "" ? (op.pct ? `${step.value}%` : Number(step.value).toLocaleString()) : "?"}
                    </span>
                  )}
                </div>
              )}

              {/* Step card */}
              <div className={`rounded-xl border transition-colors ${
                isFirst
                  ? "border-violet-500/25 bg-violet-600/5"
                  : isEdit
                  ? "border-violet-500/40 bg-slate-900"
                  : "border-slate-800 bg-slate-900 hover:border-slate-700"
              }`}>
                {/* Main row */}
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* Step dot */}
                  <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                    isFirst ? "bg-violet-500" : pool !== null ? "bg-emerald-500" : "bg-slate-700"
                  }`} />

                  <div className="flex-1 min-w-0">
                    {isEdit ? (
                      /* ── Edit mode ─────────────────────────────────── */
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={step.label}
                          onChange={e => patch(idx, { label: e.target.value })}
                          placeholder="Step label"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                        />
                        <input
                          type="text"
                          value={step.description}
                          onChange={e => patch(idx, { description: e.target.value })}
                          placeholder="Short description (optional)"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-500 text-xs focus:outline-none focus:border-violet-500 transition-colors"
                        />
                      </div>
                    ) : (
                      /* ── View mode ─────────────────────────────────── */
                      <div>
                        <p className={`text-sm font-medium ${isFirst ? "text-violet-300" : "text-slate-200"}`}>
                          {step.label}
                        </p>
                        {step.description && (
                          <p className="text-slate-500 text-xs mt-0.5">{step.description}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Running pool badge */}
                  <div className="shrink-0 text-right">
                    {pool !== null ? (
                      <span className={`text-sm font-semibold tabular-nums ${isFirst ? "text-violet-300" : "text-emerald-300"}`}>
                        {fmt(pool)}
                      </span>
                    ) : (
                      <span className="text-slate-700 text-sm">—</span>
                    )}
                    {pool !== null && prevPool !== null && idx > 0 && (
                      <p className="text-slate-600 text-xs">
                        {prevPool > 0 ? `${((pool / prevPool) * 100).toFixed(1)}% of prev` : ""}
                      </p>
                    )}
                  </div>

                  {/* Edit toggle */}
                  {!isFirst && (
                    <button
                      onClick={() => setEditIdx(isEdit ? null : idx)}
                      className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                        isEdit
                          ? "text-violet-400 bg-violet-600/15"
                          : "text-slate-600 hover:text-slate-300 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* ── Operator + value row (non-anchor steps) ─────────────────── */}
                {!isFirst && (
                  <div className="border-t border-slate-800 px-4 py-3 flex flex-wrap items-center gap-3">
                    <span className="text-slate-600 text-xs">Apply as</span>

                    {/* Operator pills */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {OPERATORS.map(o => (
                        <button
                          key={o.id}
                          onClick={() => patch(idx, { operator: o.id })}
                          title={o.hint}
                          className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-all ${
                            step.operator === o.id
                              ? "bg-violet-600 text-white shadow"
                              : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                          }`}
                        >
                          {o.symbol}
                        </button>
                      ))}
                    </div>

                    {/* Hint label */}
                    {op && (
                      <span className="text-slate-600 text-xs">{op.hint}</span>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Value input */}
                    <div className="flex items-center gap-2">
                      <label className="text-slate-500 text-xs whitespace-nowrap">
                        {op?.pct ? "Default %" : "Default value"}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={step.value ?? ""}
                          min={0}
                          max={op?.pct ? 100 : undefined}
                          step={op?.pct ? 1 : 100}
                          onChange={e => patch(idx, { value: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                          placeholder="—"
                          className="w-24 bg-slate-900 border border-slate-700 rounded-lg pl-2.5 pr-6 py-1.5 text-slate-200 text-xs text-right focus:outline-none focus:border-violet-500 transition-colors"
                        />
                        {op?.pct && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 text-xs pointer-events-none">%</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* ── Final output node ────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pl-3">
          <div className="w-px h-4 bg-slate-800 ml-3" />
        </div>
        <div className="flex items-center gap-3 bg-emerald-600/8 border border-emerald-500/20 rounded-xl px-4 py-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <div className="flex-1">
            <p className="text-emerald-300 text-sm font-medium">Net New Patient Starts</p>
            <p className="text-emerald-700 text-xs">Output fed into LOT waterfall</p>
          </div>
          <div className="text-right">
            {runningPools[runningPools.length - 1] !== null ? (
              <span className="text-emerald-300 text-sm font-semibold tabular-nums">
                {fmt(runningPools[runningPools.length - 1])}
              </span>
            ) : (
              <span className="text-slate-700 text-sm">—</span>
            )}
            {hasEpi && runningPools[runningPools.length - 1] !== null && (
              <p className="text-slate-600 text-xs">
                {((runningPools[runningPools.length - 1] / epiTotal) * 100).toFixed(1)}% of pool
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
