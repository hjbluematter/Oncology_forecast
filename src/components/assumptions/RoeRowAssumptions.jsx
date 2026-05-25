import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { useForecast } from "../../store/forecastStore";
import { apiFetch } from "../../utils/apiFetch";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

function buildPeriods(model) {
  const { startYear, timelineYears, granularity } = model;
  const isMonthly = granularity === "Monthly";
  const periods = [];
  for (let y = startYear; y < startYear + timelineYears; y++) {
    if (isMonthly) {
      for (let m = 1; m <= 12; m++) periods.push(`${y}-${String(m).padStart(2, "0")}`);
    } else {
      periods.push(String(y));
    }
  }
  return periods;
}

function fmtPeriod(p, granularity) {
  if (granularity === "Monthly" && p.includes("-")) {
    const [y, m] = p.split("-");
    const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${mn[parseInt(m)-1]} ${y}`;
  }
  return p;
}

const ROWS = [
  { key: "nps",     label: "NPS Factor",     hint: "% of source geo new patients" },
  { key: "revenue", label: "Revenue Factor",  hint: "% of source geo revenue" },
];

// Matches the visual style of MultiRowTable from shared.jsx exactly
function GeoScalingTable({ label, sourceGeo, model, data, onChange }) {
  const periods = useMemo(() => buildPeriods(model), [model.startYear, model.timelineYears, model.granularity]);

  function handleCell(rowKey, period, val) {
    onChange({ ...data, [period]: { ...(data?.[period] ?? {}), [rowKey]: val } });
  }

  return (
    <div className="mb-6">
      {/* Section label */}
      <div className="flex items-center gap-2 px-1 mb-2">
        <span className="text-slate-200 text-xs font-semibold">{label}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-normal">derived from {sourceGeo}</span>
      </div>

      {/* Wide table — same as MultiRowTable */}
      <div className="overflow-auto border border-[#d1e0f5] rounded-lg" style={{ maxHeight: 180 }}>
        <table className="border-collapse text-xs" style={{ minWidth: 220 + periods.length * 86 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#dbe8f8] border-b border-[#b3cce8]">
              <th className="sticky left-0 bg-[#dbe8f8] text-left px-3 py-2.5 font-semibold border-r border-[#d1e0f5] text-slate-100 whitespace-nowrap" style={{ minWidth: 220 }}>
                Metric
              </th>
              {periods.map(p => (
                <th key={p} className="text-right px-2 py-2.5 font-medium text-slate-200 whitespace-nowrap" style={{ minWidth: 86 }}>
                  {fmtPeriod(p, model.granularity)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => {
              const isEven = ri % 2 === 0;
              const rowBg    = isEven ? "bg-white" : "bg-[#f0f6ff]";
              const stickyBg = isEven ? "bg-white" : "bg-[#e8f0fd]";
              return (
                <tr key={row.key} className={`border-b border-[#d1e0f5] ${rowBg}`}>
                  <td className={`sticky left-0 border-r border-[#d1e0f5] px-3 py-2 ${stickyBg}`} style={{ minWidth: 220 }}>
                    <div>
                      <p className="text-xs font-medium leading-tight text-slate-100">{row.label}</p>
                      <p className="text-slate-400 text-xs">{row.hint}</p>
                    </div>
                  </td>
                  {periods.map(p => {
                    const val = data?.[p]?.[row.key] ?? "";
                    return (
                      <td key={p} className="border-l border-[#d1e0f5] px-0.5 py-0.5" style={{ minWidth: 86 }}>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={val}
                            onChange={e => handleCell(row.key, p, e.target.value)}
                            placeholder="—"
                            className="w-full h-full py-1.5 text-right tabular-nums text-slate-100 text-xs bg-transparent border border-transparent rounded hover:border-slate-500 focus:border-violet-500 focus:bg-white focus:outline-none transition-colors placeholder-slate-500 pl-2 pr-5"
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none select-none">%</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RoeRowAssumptions({ model, readOnly = false }) {
  const { updateModel } = useForecast();
  const showRoE = model.showRestOfEurope;
  const showRoW = model.showRestOfWorld;

  const periods = useMemo(() => buildPeriods(model), [model.startYear, model.timelineYears, model.granularity]);

  const [roeData, setRoeData] = useState(model.roeAssumptions ?? {});
  const [rowData, setRowData] = useState(model.rowAssumptions ?? {});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [uploadMsg, setUploadMsg] = useState(null);

  const fileInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null); // "roe" | "row"

  if (!showRoE && !showRoW) {
    return (
      <div className="text-slate-400 text-sm py-2">
        Rest of Europe (RoE) and Rest of World (RoW) are not enabled. Enable them in the geographies step of the model wizard.
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const patch = {};
      if (showRoE) patch.roeAssumptions = roeData;
      if (showRoW) patch.rowAssumptions = rowData;
      const res = await apiFetch(`${API}/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Save failed");
      updateModel(model.id, patch);
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function buildSheet(data, sourceGeo) {
    const headers = ["Period Key", "Label", ...ROWS.map(r => r.label)];
    const dataRows = periods.map(p => [
      p,
      fmtPeriod(p, model.granularity),
      ...ROWS.map(r => {
        const v = data?.[p]?.[r.key];
        return v !== "" && v !== undefined ? (parseFloat(v) || v) : "";
      }),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    ws["!cols"] = [{ wch: 12 }, { wch: 14 }, ...ROWS.map(() => ({ wch: 20 }))];
    return ws;
  }

  function downloadExcel(target) {
    const wb = XLSX.utils.book_new();
    if (target === "roe" && showRoE) {
      XLSX.utils.book_append_sheet(wb, buildSheet(roeData, "EU5"), "RoE (from EU5)");
    }
    if (target === "row" && showRoW) {
      XLSX.utils.book_append_sheet(wb, buildSheet(rowData, "US"), "RoW (from US)");
    }
    if (target === "all") {
      if (showRoE) XLSX.utils.book_append_sheet(wb, buildSheet(roeData, "EU5"), "RoE (from EU5)");
      if (showRoW) XLSX.utils.book_append_sheet(wb, buildSheet(rowData, "US"), "RoW (from US)");
    }
    XLSX.writeFile(wb, `${model.assetName ?? "model"}_roe_row_assumptions.xlsx`);
  }

  function parseSheet(ws, currentData) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const hi = rows.findIndex(r => r.some(c => String(c).trim() === "Period Key"));
    if (hi === -1) return { error: "Cannot find 'Period Key' column." };
    const hdr = rows[hi];
    const next = { ...currentData };
    let matched = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const key = String(rows[i][0] ?? "").trim();
      if (!periods.includes(key)) continue;
      for (const row of ROWS) {
        const ci = hdr.findIndex(h => String(h).trim() === row.label);
        if (ci === -1) continue;
        const val = rows[i][ci];
        next[key] = { ...(next[key] ?? {}), [row.key]: val !== "" ? String(val) : "" };
      }
      matched++;
    }
    if (matched === 0) return { error: "No matching period keys found." };
    return { data: next, matched };
  }

  function handleUpload(file, target) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        // Try to match sheet by name, fall back to first sheet
        const sheetName = target === "roe"
          ? wb.SheetNames.find(n => n.toLowerCase().includes("roe")) ?? wb.SheetNames[0]
          : wb.SheetNames.find(n => n.toLowerCase().includes("row")) ?? wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const result = parseSheet(ws, target === "roe" ? roeData : rowData);
        if (result.error) { setUploadMsg({ type: "error", text: result.error }); return; }
        if (target === "roe") { setRoeData(result.data); }
        else                  { setRowData(result.data); }
        setDirty(true);
        setUploadMsg({ type: "success", text: `${result.matched} rows imported from "${file.name}"` });
      } catch { setUploadMsg({ type: "error", text: "Failed to parse file." }); }
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="divide-y divide-slate-800">
      {/* Toolbar */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-3 bg-slate-900/60">
        <p className="text-slate-400 text-xs">
          Period-level scaling factors as % of source geography
          {showRoE ? " · RoE from EU5" : ""}{showRoW ? " · RoW from US" : ""}
        </p>
        <div className="flex items-center gap-2 ml-auto">
          {!readOnly && (
            <>
              {/* Download */}
              <div className="flex items-center gap-1">
                {showRoE && (
                  <button
                    onClick={() => downloadExcel("roe")}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-emerald-600 border border-slate-700 hover:border-emerald-600/50 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
                    RoE Excel
                  </button>
                )}
                {showRoW && (
                  <button
                    onClick={() => downloadExcel("row")}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-emerald-600 border border-slate-700 hover:border-emerald-600/50 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
                    RoW Excel
                  </button>
                )}
              </div>

              {/* Upload */}
              {showRoE && (
                <button
                  onClick={() => { setUploadMsg(null); setUploadTarget("roe"); fileInputRef.current?.click(); }}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-violet-700 border border-slate-700 hover:border-violet-600/50 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                  Upload RoE
                </button>
              )}
              {showRoW && (
                <button
                  onClick={() => { setUploadMsg(null); setUploadTarget("row"); fileInputRef.current?.click(); }}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-violet-700 border border-slate-700 hover:border-violet-600/50 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                  Upload RoW
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f && uploadTarget) handleUpload(f, uploadTarget);
                  e.target.value = "";
                }}
              />

              {uploadMsg && (
                <span className={`text-xs ${uploadMsg.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
                  {uploadMsg.text}
                </span>
              )}
              {saveError && <span className="text-xs text-red-500">{saveError}</span>}
              <span className="text-xs">
                {dirty
                  ? <span className="text-amber-500">Unsaved</span>
                  : savedAt ? <span className="text-slate-400">Saved {savedAt}</span> : null}
              </span>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              >
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                }
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tables */}
      <div className="px-5 py-4 space-y-2">
        {showRoE && (
          <GeoScalingTable
            label="Rest of Europe (RoE)"
            sourceGeo="EU5"
            model={model}
            data={roeData}
            onChange={d => { setRoeData(d); setDirty(true); }}
          />
        )}
        {showRoW && (
          <GeoScalingTable
            label="Rest of World (RoW)"
            sourceGeo="US"
            model={model}
            data={rowData}
            onChange={d => { setRowData(d); setDirty(true); }}
          />
        )}
      </div>
    </div>
  );
}
