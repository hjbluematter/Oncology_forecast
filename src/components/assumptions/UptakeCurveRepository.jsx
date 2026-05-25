import { useState, useEffect } from "react";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TOTAL_CURVES = 100;

// ─── Math helpers ─────────────────────────────────────────────────────────────

function generateLinear(timeToPeak, totalPeriods) {
  return Array.from({ length: totalPeriods }, (_, t) =>
    parseFloat(Math.min(100, (t / Math.max(1, timeToPeak)) * 100).toFixed(2))
  );
}

function generateDiffusion(diffusionConstant, timeToPeak, totalPeriods) {
  const k  = Math.max(0.01, parseFloat(diffusionConstant));
  const t0 = Math.max(1, parseFloat(timeToPeak));
  const raw = t => 1 / (1 + Math.exp(-k * (t - t0)));
  const r0  = raw(0);
  const r_peak = raw(t0);
  const denom  = r_peak - r0;
  return Array.from({ length: totalPeriods }, (_, t) =>
    parseFloat(denom > 0 ? Math.min(100, ((raw(t) - r0) / denom) * 100).toFixed(2) : 0)
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function UptakeCurveRepository({ model, curves, onChange, onClose }) {
  const isMonthly   = (model.granularity ?? "Yearly").toLowerCase() === "monthly";
  const totalPeriods = isMonthly ? model.timelineYears * 12 : model.timelineYears;
  const periodUnit  = isMonthly ? "months" : "years";

  const [selected, setSelected] = useState(0); // index into curves array
  const [search,   setSearch]   = useState("");

  const cur = curves[selected];

  function patchCurve(patch) {
    const next = curves.map((c, i) => i === selected ? { ...c, ...patch } : c);
    // Auto-recompute values when method params change
    const updated = next[selected];
    if (updated.method === "linear" && updated.timeToPeak) {
      next[selected] = { ...updated, computed: generateLinear(updated.timeToPeak, totalPeriods) };
    } else if (updated.method === "diffusion" && updated.timeToPeak && updated.diffusionConstant) {
      next[selected] = { ...updated, computed: generateDiffusion(updated.diffusionConstant, updated.timeToPeak, totalPeriods) };
    }
    onChange(next);
  }

  function patchManualValue(idx, val) {
    const manual = [...(cur.manual ?? Array(totalPeriods).fill(""))];
    manual[idx] = val;
    const next = curves.map((c, i) => i === selected ? { ...c, manual } : c);
    onChange(next);
  }

  const displayValues = cur.method === "manual"
    ? (cur.manual ?? Array(totalPeriods).fill(""))
    : (cur.computed ?? []);

  const filteredIndices = curves
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div>
            <p className="text-slate-200 font-semibold">Uptake Curve Repository</p>
            <p className="text-slate-500 text-xs mt-0.5">{TOTAL_CURVES} curve slots · time-to-peak in {periodUnit} · values = % of peak share reached</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — curve list */}
          <div className="w-56 border-r border-slate-800 flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-800">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search curves…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredIndices.map(({ c, i }) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-800/50 transition-colors ${
                    selected === i ? "bg-violet-600/15 border-l-2 border-l-violet-500" : "hover:bg-slate-800/40"
                  }`}
                >
                  <p className={`text-xs font-medium ${selected === i ? "text-violet-300" : "text-slate-300"}`}>{c.name}</p>
                  <p className="text-slate-600 text-xs mt-0.5">
                    {c.method === "empty" ? "Empty" : c.method === "manual" ? "Manual" : c.method === "linear" ? `Linear · ${c.timeToPeak ?? "—"} ${periodUnit}` : `Diffusion · k=${c.diffusionConstant ?? "—"}`}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Right panel — curve editor */}
          <div className="flex-1 overflow-y-auto">
            {/* Curve name + method */}
            <div className="px-6 py-4 border-b border-slate-800 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-slate-500 text-xs mb-1 block">Curve Name</label>
                  <input
                    type="text"
                    value={cur.name}
                    onChange={e => patchCurve({ name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-slate-500 text-xs mb-1 block">Method</label>
                  <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
                    {["empty","manual","linear","diffusion"].map(m => (
                      <button
                        key={m}
                        onClick={() => patchCurve({ method: m })}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                          cur.method === m ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Method-specific inputs */}
              {cur.method === "linear" && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-slate-500 text-xs whitespace-nowrap">Time to Peak ({periodUnit})</label>
                    <input
                      type="number" min={1} max={totalPeriods}
                      value={cur.timeToPeak ?? ""}
                      onChange={e => patchCurve({ timeToPeak: parseFloat(e.target.value) })}
                      className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                  <p className="text-slate-600 text-xs">Linear ramp from 0% at launch to 100% at time-to-peak, then flat</p>
                </div>
              )}

              {cur.method === "diffusion" && (
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-slate-500 text-xs whitespace-nowrap">Diffusion Constant (k)</label>
                    <input
                      type="number" min={0.01} step={0.05}
                      value={cur.diffusionConstant ?? ""}
                      onChange={e => patchCurve({ diffusionConstant: parseFloat(e.target.value) })}
                      className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-slate-500 text-xs whitespace-nowrap">Time to Peak ({periodUnit})</label>
                    <input
                      type="number" min={1} max={totalPeriods}
                      value={cur.timeToPeak ?? ""}
                      onChange={e => patchCurve({ timeToPeak: parseFloat(e.target.value) })}
                      className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                  <p className="text-slate-600 text-xs">S-curve: higher k = steeper ramp · inflection at time-to-peak</p>
                </div>
              )}

              {cur.method === "manual" && (
                <p className="text-slate-600 text-xs">Enter % of peak share reached at each period since launch (0 = launch period)</p>
              )}
            </div>

            {/* Values preview / manual entry */}
            {cur.method !== "empty" && (
              <div className="px-6 py-4">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">
                  {cur.method === "manual" ? "Manual values — % of peak share" : "Computed values — % of peak share"}
                </p>
                <div className="overflow-x-auto">
                  <table className="border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-800/60 border-b border-slate-700">
                        <th className="px-3 py-2 text-left text-slate-500 font-medium whitespace-nowrap" style={{minWidth:100}}>
                          Period since launch
                        </th>
                        {Array.from({ length: Math.min(totalPeriods, 36) }, (_, t) => (
                          <th key={t} className="px-2 py-2 text-center text-slate-500 font-medium whitespace-nowrap" style={{minWidth:52}}>
                            {isMonthly
                              ? (t === 0 ? "Launch" : `+${t}m`)
                              : (t === 0 ? "Launch" : `+${t}y`)}
                          </th>
                        ))}
                        {totalPeriods > 36 && <th className="px-2 py-2 text-slate-600 text-xs">+{totalPeriods-36} more</th>}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-slate-950">
                        <td className="px-3 py-2 text-slate-400 font-medium bg-slate-900 border-r border-slate-700">% of Peak</td>
                        {Array.from({ length: Math.min(totalPeriods, 36) }, (_, t) => {
                          const val = cur.method === "manual"
                            ? (cur.manual?.[t] ?? "")
                            : (displayValues[t] ?? "");
                          return (
                            <td key={t} className="border-l border-slate-800 px-0.5 py-0.5">
                              {cur.method === "manual" ? (
                                <input
                                  type="number" min={0} max={100} step={1}
                                  value={val}
                                  onChange={e => patchManualValue(t, e.target.value)}
                                  className="w-12 px-1.5 py-1.5 text-right text-slate-200 bg-transparent border border-transparent rounded hover:border-slate-600 focus:border-violet-500 focus:bg-slate-800 focus:outline-none transition-colors text-xs"
                                />
                              ) : (
                                <div className="px-2 py-1.5 text-right text-slate-300 tabular-nums">
                                  {val !== "" && val !== undefined ? `${val}%` : "—"}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Mini bar preview */}
                {displayValues.length > 0 && cur.method !== "manual" && (
                  <div className="mt-4 flex items-end gap-0.5 h-16">
                    {displayValues.slice(0, Math.min(totalPeriods, 36)).map((v, t) => (
                      <div
                        key={t}
                        className="flex-1 bg-violet-600/60 rounded-sm min-w-1"
                        style={{ height: `${Math.max(2, v)}%` }}
                        title={`+${t}${isMonthly?"m":"y"}: ${v}%`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {cur.method === "empty" && (
              <div className="px-6 py-12 text-center">
                <p className="text-slate-600 text-sm">Select a method above to configure this curve</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Factory: build 100 empty curve slots ─────────────────────────────────────

export function buildDefaultCurves() {
  return Array.from({ length: TOTAL_CURVES }, (_, i) => ({
    id:                 i + 1,
    name:               `Uptake Curve ${i + 1}`,
    method:             "empty",
    timeToPeak:         "",
    diffusionConstant:  "",
    computed:           [],
    manual:             [],
  }));
}
