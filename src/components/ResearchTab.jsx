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

const ROLE_STYLE = {
  anchor:  { dot: "bg-slate-400",  label: null },
  filter:  { dot: "bg-amber-400",  label: null },
  epi_base:{ dot: "bg-violet-500", label: "Epi Base ↑" },
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

// ─── Derivation chain (same visual as AiChat's DerivationSection) ─────────────

function DerivationBlock({ derivation, populationByYear }) {
  const geos = Object.keys(derivation);
  const [activeGeo, setActiveGeo] = useState(geos[0] ?? "");

  if (geos.length === 0) return null;
  const geoData = derivation[activeGeo];
  if (!geoData) return null;

  const steps = geoData.steps ?? [];
  const patientsByYear = geoData.patients_by_year ?? {};
  const finalRate = geoData.final_rate_per_100k;
  const popSource = geoData.population_source;
  const popByYear = populationByYear?.[activeGeo] ?? {};
  const years = Object.keys(patientsByYear).sort();

  return (
    <div className="p-4 space-y-4">
      {/* Geo tabs */}
      {geos.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {geos.map(g => (
            <button
              key={g}
              onClick={() => setActiveGeo(g)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                activeGeo === g
                  ? "bg-violet-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Step chain */}
      {steps.length > 0 && (
        <div className="space-y-0">
          {steps.map((step, si) => {
            const style = ROLE_STYLE[step.role] ?? ROLE_STYLE.filter;
            return (
              <div key={si} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${style.dot}`} />
                  {si < steps.length - 1 && <div className="w-px flex-1 bg-slate-700 my-0.5" />}
                </div>
                <div className="pb-3 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold ${step.role === "filter" ? "text-amber-300" : step.role === "epi_base" ? "text-violet-300" : "text-slate-200"}`}>
                      {step.label}
                    </span>
                    {step.role === "filter" && step.rate != null && (
                      <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded font-mono">
                        × {step.rate}{step.rate_unit === "%" ? "%" : "/100K"}
                      </span>
                    )}
                    {style.label && (
                      <span className="text-xs bg-violet-500/15 text-violet-400 border border-violet-500/25 px-1.5 py-0.5 rounded">
                        {style.label}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5">{step.retrieved_value}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-slate-400 text-xs">
                      → {step.output_absolute != null ? Number(step.output_absolute).toLocaleString() : "—"} patients
                    </span>
                    {step.source_url && (
                      <a
                        href={step.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-500 hover:text-violet-400 text-xs underline underline-offset-2"
                      >
                        src
                      </a>
                    )}
                  </div>
                  {step.source_context && (
                    <p className="text-slate-600 text-xs mt-0.5 italic">{step.source_context}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Year × Population × Rate = Patients table */}
      {years.length > 0 && finalRate != null && (
        <div>
          <p className="text-xs text-slate-400 font-medium mb-1.5">
            {finalRate}/100K × UN Population → Patients per Year
            {popSource && <span className="ml-1.5 text-slate-600 font-normal">({popSource})</span>}
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="bg-slate-800/60">
                  <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Year</th>
                  <th className="px-3 py-1.5 text-right text-slate-400 font-medium">UN Population</th>
                  <th className="px-3 py-1.5 text-right text-slate-400 font-medium">Rate/100K</th>
                  <th className="px-3 py-1.5 text-right text-slate-400 font-medium">= Patients</th>
                </tr>
              </thead>
              <tbody>
                {years.map(yr => (
                  <tr key={yr} className="border-t border-slate-800/60 hover:bg-slate-800/20">
                    <td className="px-3 py-1.5 text-slate-300 tabular-nums">{yr}</td>
                    <td className="px-3 py-1.5 text-right text-slate-400 tabular-nums">
                      {popByYear[yr] != null ? Number(popByYear[yr]).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-amber-400 tabular-nums font-mono">{finalRate}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-400 tabular-nums font-semibold">
                      {Number(patientsByYear[yr]).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Session card ─────────────────────────────────────────────────────────────

function SessionCard({ session, sessionIndex, onDelete }) {
  const [open, setOpen] = useState(true);
  const [derivationOpen, setDerivationOpen] = useState(true);
  const [sourcingOpen, setSourcingOpen] = useState(false);
  const [expandedCtx, setExpandedCtx] = useState(null);

  const rows = session.rows ?? [];
  const derivation = session.derivation ?? {};
  const populationByYear = session.population_by_year ?? {};
  const hasDerivation = Object.keys(derivation).length > 0;
  const methodology = session.methodology;
  const source = session.source;

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

      {open && (
        <>
          {/* Source summary + methodology */}
          {(source || methodology) && (
            <div className="px-5 py-3 border-b border-slate-800/60 space-y-1">
              {source && <p className="text-slate-400 text-xs">{source}</p>}
              {methodology && <p className="text-slate-500 text-xs italic">{methodology}</p>}
            </div>
          )}

          {/* Calculation Derivation section */}
          {hasDerivation && (
            <div className="border-b border-slate-800/60">
              <button
                onClick={() => setDerivationOpen(o => !o)}
                className="w-full px-5 py-2.5 flex items-center justify-between text-left hover:bg-slate-800/20 transition-colors"
              >
                <span className="text-slate-300 text-xs font-semibold tracking-wide uppercase">Calculation Derivation</span>
                <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${derivationOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {derivationOpen && (
                <DerivationBlock derivation={derivation} populationByYear={populationByYear} />
              )}
            </div>
          )}

          {/* Sourcing table — collapsible */}
          {rows.length > 0 && (
            <div>
              <button
                onClick={() => setSourcingOpen(o => !o)}
                className="w-full px-5 py-2.5 flex items-center justify-between text-left hover:bg-slate-800/20 transition-colors"
              >
                <span className="text-slate-300 text-xs font-semibold tracking-wide uppercase">
                  Raw Sourcing Data <span className="text-slate-600 font-normal normal-case">({rows.length} rows)</span>
                </span>
                <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${sourcingOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {sourcingOpen && (
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
            </div>
          )}

          {rows.length === 0 && !hasDerivation && (
            <p className="px-5 py-4 text-slate-600 text-xs">No data points in this session.</p>
          )}
        </>
      )}
    </div>
  );
}
