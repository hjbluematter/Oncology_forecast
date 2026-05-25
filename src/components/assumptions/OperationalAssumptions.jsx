import { useState } from "react";
import { useForecast } from "../../store/forecastStore";
import { buildAssetCombos, DirectEntryPanel, strip, getSharingForAssetAssumption } from "./shared";
import { apiFetch } from "../../utils/apiFetch";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// All metrics captured for the key product only (asset), across all LOT × segment × geography.
// PTRS is a single value (probability), not a time series.

const TIME_SERIES_METRICS = [
  { id:"compliance",    label:"Compliance",              unit:"%",      showPct:true,  description:"% of patients compliant with therapy per period" },
  { id:"access",        label:"Access Rate",             unit:"%",      showPct:true,  description:"% of eligible patients who can access the therapy" },
  { id:"abandonment",   label:"Abandonment Rate",        unit:"%",      showPct:true,  description:"% of patients who abandon before completing treatment" },
  { id:"vials",         label:"Vials per Patient-Month", unit:"vials",  showPct:false, description:"Average number of vials dispensed per patient per month" },
  { id:"grossPrice",    label:"Gross Price per Vial",    unit:"$",      showPct:false, description:"WAC gross price per vial (local currency)" },
  { id:"gtn",           label:"Gross-to-Net",            unit:"%",      showPct:true,  description:"GTN adjustment — net price = gross × (1 − GTN%)" },
];

export default function OperationalAssumptions({ model, visibleKeys, readOnly = false }) {
  const { updateModel } = useForecast();
  const combos = buildAssetCombos(model);

  // visibleKeys uses 4-part keys (geo-lot-seg-product); asset combos use 3-part keys — convert
  const assetVisibleKeys = visibleKeys
    ? new Set([...visibleKeys].map(k => k.split("-").slice(0, 3).join("-")))
    : null;

  const enablePTRS = !!(model.ptrs || model.enablePTRS);
  const enableIRA  = !!(model.ira  || model.enableIRA);

  async function saveCombosForMetric(metricId, payload) {
    const operationalAssumptions = {
      ...(model.operationalAssumptions ?? {}),
      [metricId]: payload,
    };
    await apiFetch(`${API}/models/${model.id}`, {
      method: "PATCH", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ operationalAssumptions }),
    });
    updateModel(model.id, { operationalAssumptions });
  }

  async function savePTRS(values) {
    const operationalAssumptions = {
      ...(model.operationalAssumptions ?? {}),
      ptrs: { combos: values },
    };
    await apiFetch(`${API}/models/${model.id}`, {
      method: "PATCH", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ operationalAssumptions }),
    });
    updateModel(model.id, { operationalAssumptions });
  }

  return (
    <div className="divide-y divide-slate-800">
      <div className="px-5 py-2 bg-slate-900/60">
        <p className="text-slate-500 text-xs">
          Key product ({model.assetName||"Asset"}) only · {combos.length} combination{combos.length!==1?"s":""}
        </p>
      </div>

      {TIME_SERIES_METRICS.map(m => (
        <MetricSection
          key={m.id}
          metric={m}
          model={model}
          combos={combos}
          savedValues={(model.operationalAssumptions ?? {})[m.id]}
          onSave={payload => saveCombosForMetric(m.id, payload)}
          sharingGroups={getSharingForAssetAssumption(model, m.id)}
          visibleKeys={assetVisibleKeys}
          readOnly={readOnly}
        />
      ))}

      {enableIRA && (
        <MetricSection
          metric={{ id:"ira", label:"IRA Price Negotiation Impact", unit:"%", showPct:true, description:"IRA-driven net price reduction % by period" }}
          model={model}
          combos={combos}
          savedValues={(model.operationalAssumptions ?? {}).ira}
          onSave={payload => saveCombosForMetric("ira", payload)}
          sharingGroups={getSharingForAssetAssumption(model, "ira")}
          visibleKeys={assetVisibleKeys}
          readOnly={readOnly}
        />
      )}

      {enablePTRS && (
        <PTRSSection
          model={model}
          combos={combos}
          saved={(model.operationalAssumptions ?? {}).ptrs}
          onSave={savePTRS}
          sharingGroups={getSharingForAssetAssumption(model, "ptrs")}
          visibleKeys={assetVisibleKeys}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

// ── Time-series metric section ────────────────────────────────────────────────

function MetricSection({ metric, model, combos, savedValues, onSave, sharingGroups, visibleKeys, readOnly }) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/30 transition-colors text-left"
      >
        <div>
          <p className="text-slate-200 text-sm font-medium">{metric.label}</p>
          <p className="text-slate-400 text-xs">{metric.description} · unit: <span className="text-slate-300">{metric.unit}</span></p>
        </div>
        <svg className={`w-4 h-4 text-slate-500 transition-transform ${open?"rotate-180":""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-800">
          <DirectEntryPanel
            model={model}
            combos={combos}
            savedValues={savedValues}
            conversionType="rate"
            showPct={metric.showPct}
            excelFilename={`${model.assetName||"model"}_${metric.id}.xlsx`}
            onSave={onSave}
            sharingGroups={sharingGroups}
            visibleKeys={visibleKeys}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  );
}

// ── PTRS — single probability per combination, not a time series ──────────────

function PTRSSection({ model, combos, saved, onSave, sharingGroups, visibleKeys }) {
  const [open, setOpen]   = useState(true);

  // Sharing: primary = first combo in combos with that group number
  const groupFirst   = {};
  const dependentOf  = {};
  for (const c of combos) {
    const g = sharingGroups?.[c.key];
    if (!g) continue;
    if (!groupFirst[g]) { groupFirst[g] = c.key; }
    else { dependentOf[c.key] = { primaryKey: groupFirst[g], primaryLabel: combos.find(x => x.key === groupFirst[g])?.label ?? groupFirst[g] }; }
  }

  const [values, setValues] = useState(() =>
    Object.fromEntries(combos.map(c => [c.key, saved?.combos?.[c.key] ?? ""]))
  );
  const [saving, setSaving]   = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [dirty, setDirty]     = useState(false);

  function patchValue(key, raw) {
    if (dependentOf[key]) return;
    setValues(prev => ({ ...prev, [key]: String(raw).replace(/,/g,"") }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    const finalValues = { ...values };
    for (const [depKey, info] of Object.entries(dependentOf)) {
      finalValues[depKey] = finalValues[info.primaryKey] ?? "";
    }
    await onSave(finalValues);
    setSaving(false); setDirty(false);
    setSavedAt(new Date().toLocaleTimeString());
  }

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/30 transition-colors text-left"
      >
        <div>
          <p className="text-slate-200 text-sm font-medium">PTRS</p>
          <p className="text-slate-400 text-xs">Probability of technical & regulatory success · single value per combination (0–100%)</p>
        </div>
        <svg className={`w-4 h-4 text-slate-500 transition-transform ${open?"rotate-180":""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-800 divide-y divide-slate-800">
          <div className="px-5 py-3 flex items-center justify-between bg-slate-900/60">
            <p className="text-slate-500 text-xs">Single probability value per combination</p>
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
                  <th className="bg-slate-800/70 border-l border-slate-800 px-4 py-2 text-center font-medium text-slate-300" style={{minWidth:140}}>PTRS (%)</th>
                </tr>
              </thead>
              <tbody>
                {combos.filter(c => !visibleKeys || visibleKeys.has(c.key)).map(c => {
                  const dep = dependentOf[c.key];
                  const displayVal = dep ? (values[dep.primaryKey] ?? "") : (values[c.key] ?? "");
                  return (
                    <tr key={c.key} className={`border-b border-slate-800 ${dep?"bg-slate-900/40":"bg-slate-950"} ${c.isFirstInGeo&&c.geoIdx>0?"border-t-2 border-t-slate-700":""}`}>
                      <td className="border-r border-slate-700 px-3 py-2.5 bg-slate-900">
                        <div className="flex items-center gap-1.5">
                          {dep && <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>}
                          <div>
                            <p className={`text-xs font-medium ${dep?"text-slate-500":"text-slate-200"}`}>{c.label}</p>
                            {dep && <p className="text-slate-400 text-xs">Shared with {dep.primaryLabel}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 border-l border-slate-800">
                        {dep ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-28 px-2.5 py-1.5 text-slate-400 text-xs text-right tabular-nums">{displayVal || "—"}</span>
                            <span className="text-slate-400 text-xs">%</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input type="number" min={0} max={100} step={1}
                              value={values[c.key] ?? ""}
                              onChange={e => patchValue(c.key, e.target.value)}
                              placeholder="e.g. 75"
                              className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-violet-500 transition-colors text-right tabular-nums"
                            />
                            <span className="text-slate-400 text-xs">%</span>
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
      )}
    </div>
  );
}
