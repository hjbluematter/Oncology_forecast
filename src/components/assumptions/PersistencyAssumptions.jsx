import { useState } from "react";
import { useForecast } from "../../store/forecastStore";
import { buildCombos, strip, getSharingForAssumption } from "./shared";
import { apiFetch } from "../../utils/apiFetch";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export default function PersistencyAssumptions({ model, visibleKeys, readOnly = false }) {
  const { updateModel } = useForecast();
  const combos = buildCombos(model);
  const saved  = model.persistencyAssumptions ?? {};

  // Build sharing: primary = first combo in combos with that group id
  const sharingGroups = getSharingForAssumption(model, "persistency") ?? {};
  const groupFirst = {};
  const dependentOf = {}; // comboKey -> { primaryKey, primaryLabel }
  for (const c of combos) {
    const g = sharingGroups[c.key];
    if (!g) continue;
    if (!groupFirst[g]) { groupFirst[g] = c.key; }
    else { dependentOf[c.key] = { primaryKey: groupFirst[g], primaryLabel: combos.find(x => x.key === groupFirst[g])?.label ?? groupFirst[g] }; }
  }

  const [values, setValues] = useState(() =>
    Object.fromEntries(combos.map(c => [c.key, saved.combos?.[c.key] ?? ""]))
  );
  const [saving, setSaving]   = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [dirty, setDirty]     = useState(false);

  function patchValue(key, raw) {
    if (dependentOf[key]) return;
    setValues(prev => ({ ...prev, [key]: strip(raw) }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    const finalValues = { ...values };
    for (const [depKey, info] of Object.entries(dependentOf)) {
      finalValues[depKey] = finalValues[info.primaryKey] ?? "";
    }
    const persistencyAssumptions = { combos: finalValues };
    await apiFetch(`${API}/models/${model.id}`, {
      method: "PATCH", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ persistencyAssumptions }),
    });
    updateModel(model.id, { persistencyAssumptions });
    setSaving(false); setDirty(false);
    setSavedAt(new Date().toLocaleTimeString());
  }

  return (
    <div className="divide-y divide-slate-800">
      <div className="px-5 py-3 flex items-center justify-between bg-slate-900/60">
        <p className="text-slate-500 text-xs">
          Median months on therapy · single value per combination · {combos.length} combination{combos.length!==1?"s":""}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs">{dirty?<span className="text-amber-500">Unsaved</span>:savedAt?<span className="text-slate-400">Saved {savedAt}</span>:null}</span>
          <button onClick={handleSave} disabled={saving||!dirty}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            {saving?<div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>:<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>}
            {saving?"Saving…":"Save"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{minWidth:360}}>
          <thead>
            <tr className="bg-slate-800/70 border-b border-slate-800">
              <th className="bg-slate-800/70 border-r border-slate-700 px-3 py-2 text-left font-medium text-slate-300" style={{minWidth:220}}>Combination</th>
              <th className="bg-slate-800/70 border-l border-slate-800 px-4 py-2 text-center font-medium text-slate-300" style={{minWidth:180}}>Median Months on Therapy</th>
            </tr>
          </thead>
          <tbody>
            {combos.filter(c => !visibleKeys || visibleKeys.has(c.key)).map(c => {
              const dep = dependentOf[c.key];
              const displayValue = dep ? (values[dep.primaryKey] ?? "") : (values[c.key] ?? "");
              return (
                <tr key={c.key} className={`border-b border-slate-800 ${dep ? "bg-slate-900/40" : "bg-slate-950"} ${c.isFirstInGeo&&c.geoIdx>0?"border-t-2 border-t-slate-700":""}`}>
                  <td className="border-r border-slate-700 px-3 py-2.5 bg-slate-900">
                    <div className="flex items-center gap-1.5">
                      {dep && (
                        <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                        </svg>
                      )}
                      <div>
                        <p className={`text-xs font-medium ${dep ? "text-slate-500" : "text-slate-200"}`}>{c.label}</p>
                        {dep && <p className="text-slate-400 text-xs">Shared with {dep.primaryLabel}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 border-l border-slate-800">
                    {dep ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-32 px-2.5 py-1.5 text-slate-400 text-xs text-right tabular-nums">{displayValue || "—"}</span>
                        <span className="text-slate-400 text-xs">months</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min={0} step={0.5}
                          value={values[c.key] ?? ""}
                          onChange={e => patchValue(c.key, e.target.value)}
                          placeholder="e.g. 6.5"
                          className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-violet-500 transition-colors text-right tabular-nums"
                        />
                        <span className="text-slate-400 text-xs">months</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
