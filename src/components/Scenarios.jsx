import { useState } from "react";
import { useForecast } from "../store/forecastStore";

const API = "http://localhost:3001/api";

export default function ScenariosTab({ model }) {
  const { updateModel } = useForecast();
  const scenarios = model.scenarios ?? {};
  const names = Object.keys(scenarios);

  const [comparing, setComparing] = useState(null);

  async function deleteScenario(name) {
    const res = await fetch(`${API}/models/${model.id}/scenarios/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    const updated = await res.json();
    updateModel(model.id, { scenarios: updated.scenarios });
  }

  if (names.length === 0) {
    return (
      <div className="bg-slate-900 border border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-slate-300 font-semibold">No scenarios yet</p>
          <p className="text-slate-500 text-sm mt-1 max-w-xs">
            Use the AI chat (✦ button bottom-right) to run a scenario — e.g. "5% downside in epi" — then save it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {names.map((name) => {
        const sc = scenarios[name];
        const isComparing = comparing === name;
        return (
          <ScenarioCard
            key={name}
            scenario={sc}
            model={model}
            isComparing={isComparing}
            onToggleCompare={() => setComparing(isComparing ? null : name)}
            onDelete={() => deleteScenario(name)}
          />
        );
      })}
    </div>
  );
}

function ScenarioCard({ scenario, model, isComparing, onToggleCompare, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const changes = scenario.changes || [];
  const savedAt = scenario.savedAt ? new Date(scenario.savedAt).toLocaleString() : "Unknown";

  const startYear = model.startYear || 2025;
  const years = Array.from({ length: model.timelineYears || 5 }, (_, i) => String(startYear + i));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
            </svg>
          </div>
          <div>
            <p className="text-slate-200 font-medium text-sm">{scenario.name}</p>
            {scenario.description && (
              <p className="text-slate-500 text-xs mt-0.5">{scenario.description}</p>
            )}
            <p className="text-slate-600 text-xs mt-1">Saved {savedAt}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleCompare}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              isComparing
                ? "bg-violet-600/20 border-violet-500/40 text-violet-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            {isComparing ? "Hide comparison" : "Compare vs Base"}
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-red-400 text-xs">Delete?</span>
              <button onClick={onDelete} className="px-2 py-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded-md">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 text-xs text-slate-500 hover:text-slate-300 border border-slate-700 rounded-md">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-slate-600 hover:text-red-400 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Change tags */}
      <div className="px-5 pb-3 flex flex-wrap gap-2">
        {changes.map((c, i) => (
          <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
            c.direction === "down"
              ? "bg-red-900/20 border border-red-500/20 text-red-400"
              : "bg-emerald-900/20 border border-emerald-500/20 text-emerald-400"
          }`}>
            {c.direction === "down" ? "▼" : "▲"} {c.deltaPercent}% {c.assumptionType}
            {c.comboKeys !== "all" && Array.isArray(c.comboKeys) && c.comboKeys.length === 1 &&
              <span className="text-slate-500"> · {c.comboKeys[0]}</span>}
          </span>
        ))}
      </div>

      {/* Comparison table */}
      {isComparing && <ComparisonTable scenario={scenario} model={model} years={years} />}
    </div>
  );
}

// ─── Side-by-side comparison ──────────────────────────────────────────────────

function ComparisonTable({ scenario, model, years }) {
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];

  // Build rows for epiAssumptions if changed
  const rows = [];

  function buildRows(baseSection, scenarioSection, label) {
    if (!baseSection?.combos && !scenarioSection?.combos) return;
    const baseCombos = baseSection?.combos ?? {};
    const scCombos = scenarioSection?.combos ?? {};
    const allKeys = new Set([...Object.keys(baseCombos), ...Object.keys(scCombos)]);

    for (const ck of allKeys) {
      const [gi, li, si] = ck.split("-").map(Number);
      const geo = geos[gi] || `Geo ${gi}`;
      const lot = `${(li ?? 0) + 1}L`;
      const seg = model.segmentNames?.[si] || (model.segments > 1 ? `Seg ${(si ?? 0) + 1}` : null);
      const comboLabel = [geo, lot, seg].filter(Boolean).join(" / ");

      const baseVals = baseCombos[ck]?.input ?? {};
      const scVals = scCombos[ck]?.input ?? {};

      rows.push({ section: label, comboLabel, baseVals, scVals });
    }
  }

  const changes = scenario.changes || [];
  const changedTypes = new Set(changes.map((c) => c.assumptionType));

  if (changedTypes.has("epi")) buildRows(model.epiAssumptions, scenario.assumptions?.epiAssumptions, "Epi");
  if (changedTypes.has("marketShare")) buildRows(model.marketShareAssumptions, scenario.assumptions?.marketShareAssumptions, "Market Share");
  if (changedTypes.has("persistency")) buildRows(model.persistencyAssumptions, scenario.assumptions?.persistencyAssumptions, "Persistency");

  if (rows.length === 0) {
    return (
      <div className="border-t border-slate-800 px-5 py-4 text-slate-500 text-xs">
        No assumption data saved to compare. Ensure assumptions are filled in before running a scenario.
      </div>
    );
  }

  return (
    <div className="border-t border-slate-800 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-800/60 border-b border-slate-700">
            <th className="px-4 py-2 text-left text-slate-400 font-medium sticky left-0 bg-slate-800/80 whitespace-nowrap">Section / Combo</th>
            {years.map((y) => (
              <th key={y} colSpan={2} className="px-2 py-2 text-center text-slate-400 font-medium border-l border-slate-700/40">{y}</th>
            ))}
          </tr>
          <tr className="bg-slate-800/30 border-b border-slate-700/40">
            <th className="px-4 py-1 sticky left-0 bg-slate-800/60" />
            {years.map((y) => (
              <span key={y} style={{ display: "contents" }}>
                <th className="px-2 py-1 text-slate-500 font-normal border-l border-slate-700/40">Base</th>
                <th className="px-2 py-1 text-amber-500/80 font-normal">Scenario</th>
              </span>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={`border-b border-slate-800/60 ${ri % 2 === 0 ? "" : "bg-slate-800/20"}`}>
              <td className="px-4 py-2 sticky left-0 bg-slate-900 whitespace-nowrap">
                <p className="text-slate-400 text-xs font-medium">{row.section}</p>
                <p className="text-slate-300 text-xs">{row.comboLabel}</p>
              </td>
              {years.map((y) => {
                const base = row.baseVals?.[y];
                const sc = row.scVals?.[y];
                const bNum = parseFloat(base);
                const sNum = parseFloat(sc);
                const changed = !isNaN(bNum) && !isNaN(sNum) && bNum !== sNum;
                const down = sNum < bNum;
                return (
                  <span key={y} style={{ display: "contents" }}>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400 border-l border-slate-700/30">
                      {base != null && base !== "" ? Number(base).toLocaleString() : "—"}
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums font-medium ${changed ? (down ? "text-red-400" : "text-emerald-400") : "text-slate-400"}`}>
                      {sc != null && sc !== "" ? Number(sc).toLocaleString() : "—"}
                    </td>
                  </span>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
