import { useState, Fragment } from "react";

const API = "http://localhost:3001/api";

const RATE_COLORS = {
  "Incidence": "text-violet-400",
  "Prevalence": "text-violet-400",
  "Diagnosis Rate": "text-blue-400",
  "Biomarker Testing Rate": "text-cyan-400",
  "Biomarker Positivity Rate": "text-teal-400",
  "Treatment Eligibility 1L": "text-emerald-400",
  "LOT 1L→2L Flow": "text-amber-400",
  "LOT 2L→3L Flow": "text-orange-400",
};

export default function ResearchTab({ model, onModelUpdate }) {
  const sessions = model.epiSources ?? [];

  async function deleteSession(idx) {
    const updated = sessions.filter((_, i) => i !== idx);
    await fetch(`${API}/models/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epiSources: updated }),
    });
    onModelUpdate?.({ epiSources: updated });
  }

  async function clearAll() {
    await fetch(`${API}/models/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epiSources: [] }),
    });
    onModelUpdate?.({ epiSources: [] });
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-slate-900 border border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center py-28 gap-4">
        <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-slate-300 font-semibold">No sourced data yet</p>
          <p className="text-slate-500 text-sm mt-1 max-w-sm">Use the AI chat on the Assumptions tab to pull epi and funnel cut data. All sourced values will be saved here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-slate-400 text-sm">{sessions.length} pull session{sessions.length !== 1 ? "s" : ""} · {sessions.reduce((acc, s) => acc + (s.rows?.length ?? 0), 0)} data points total</p>
        <button
          onClick={clearAll}
          className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 px-3 py-1.5 rounded-lg transition-all"
        >
          Clear All
        </button>
      </div>

      {sessions.map((session, i) => (
        <SessionCard
          key={i}
          session={session}
          sessionIndex={i}
          onDelete={() => deleteSession(i)}
        />
      ))}
    </div>
  );
}

function SessionCard({ session, sessionIndex, onDelete }) {
  const [open, setOpen] = useState(true);
  const [expandedCtx, setExpandedCtx] = useState(null);
  const rows = session.rows ?? [];
  const date = (() => {
    try { return new Date(session.pulledAt).toLocaleString(); }
    catch { return session.pulledAt; }
  })();

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Session header */}
      <div className="px-5 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 text-left"
          >
            <svg className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            <div>
              <p className="text-slate-200 text-sm font-medium">Pull Session #{sessionIndex + 1}</p>
              <p className="text-slate-500 text-xs">{date} · {rows.length} data point{rows.length !== 1 ? "s" : ""}</p>
            </div>
          </button>
        </div>
        <button
          onClick={onDelete}
          className="text-slate-600 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded hover:bg-red-500/10"
        >
          Delete
        </button>
      </div>

      {open && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800/60">
                <th className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Rate Type</th>
                <th className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Geography</th>
                <th className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Retrieved Value</th>
                <th className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Base Population</th>
                <th className="px-3 py-2 text-right text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Rate</th>
                <th className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Unit</th>
                <th className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Source</th>
                <th className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Context</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <Fragment key={ri}>
                  <tr className={`border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors ${ri % 2 === 0 ? "" : "bg-slate-800/10"}`}>
                    <td className={`px-3 py-2 whitespace-nowrap font-medium ${RATE_COLORS[row.rate_type] || "text-slate-300"}`}>
                      {row.rate_type}
                    </td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{row.geography || "Global"}</td>
                    <td className="px-3 py-2 text-slate-300 max-w-[180px]">
                      <span className="block truncate" title={row.retrieved_value}>{row.retrieved_value}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{row.base_population || "—"}</td>
                    <td className="px-3 py-2 text-right text-emerald-400 tabular-nums font-semibold">
                      {row.calculated_rate != null
                        ? Number(row.calculated_rate).toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.unit}</td>
                    <td className="px-3 py-2">
                      {row.source_url ? (
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-400 hover:text-violet-300 underline underline-offset-2 flex items-center gap-0.5 whitespace-nowrap"
                        >
                          Link
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {row.source_context ? (
                        <button
                          onClick={() => setExpandedCtx(expandedCtx === ri ? null : ri)}
                          className="text-slate-500 hover:text-slate-300 underline underline-offset-2 text-xs transition-colors whitespace-nowrap"
                        >
                          {expandedCtx === ri ? "hide" : "view"}
                        </button>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                  {expandedCtx === ri && row.source_context && (
                    <tr className="bg-slate-900/80">
                      <td colSpan={8} className="px-4 py-2.5 text-slate-400 text-xs italic border-b border-slate-800">
                        "{row.source_context}"
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && rows.length === 0 && (
        <p className="px-5 py-4 text-slate-600 text-xs">No data points in this session.</p>
      )}
    </div>
  );
}
