import { useState, useRef, useEffect, Fragment } from "react";

const API = "http://localhost:3001/api";

const ASSUMPTION_SUGGESTIONS = [
  "Pull epi cuts for this model",
  "Pull biomarker & funnel cut rates",
];
const SCENARIO_SUGGESTIONS = [
  "Run scenario: 5% downside in epi",
  "Run scenario: 10% upside in market share",
  "Run scenario: 3% downside in funnel rates",
];

export default function AiChat({ model, activeTab, onEpiProposal, onFunnelProposal, onSourcesSaved, onScenarioSaved }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages.length]);

  async function send(text) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, model, activeTab }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "error", text: data.error || "Something went wrong." }]);
      } else {
        setMessages((prev) => [...prev, { role: "ai", intent: data.intent, data }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "error", text: "Cannot reach the backend. Is it running?" }]);
    }
    setLoading(false);
  }

  async function saveScenario(scenarioData) {
    const res = await fetch(`${API}/models/${model.id}/scenarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenarioData),
    });
    const updated = await res.json();
    onScenarioSaved?.(updated);
    return updated;
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all ${
          open ? "bg-slate-700 ring-2 ring-slate-500" : "bg-violet-600 hover:bg-violet-500"
        }`}
        title="AI Assistant"
      >
        {open ? (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: "560px" }}>

          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2.5 bg-slate-900/80">
            <div className="w-7 h-7 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-slate-200 text-sm font-medium leading-none">AI Assistant</p>
              <p className="text-slate-500 text-xs mt-0.5">
              Gemini 2.5 · {model.indication || model.assetName}
            </p>
            </div>
            <button onClick={() => setMessages([])} className="ml-auto text-slate-600 hover:text-slate-400 text-xs transition-colors">
              Clear
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-slate-500 text-xs text-center pt-2">
                  {activeTab === "scenarios" ? "Run a forecast scenario:" : "What can I help you with?"}
                </p>
                {(activeTab === "scenarios" ? SCENARIO_SUGGESTIONS : ASSUMPTION_SUGGESTIONS).map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 text-xs hover:border-violet-500/40 hover:text-slate-200 transition-all"
                  >
                    {s}
                  </button>
                ))}
                {activeTab === "assumptions" && (
                  <p className="text-slate-600 text-xs text-center">Switch to the Scenarios tab to run scenario analysis</p>
                )}
                {activeTab === "scenarios" && (
                  <p className="text-slate-600 text-xs text-center">Switch to the Assumptions tab to pull epi data</p>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                model={model}
                onApplyEpi={onEpiProposal}
                onApplyFunnel={onFunnelProposal}
                onSourcesSaved={onSourcesSaved}
                onSaveScenario={saveScenario}
                onScenarioSaved={onScenarioSaved}
              />
            ))}

            {loading && (
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-slate-500 text-xs">Thinking…</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-slate-800">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Ask AI to pull epi data, run a scenario…"
                rows={2}
                className="flex-1 resize-none bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0 transition-colors"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Individual message bubble ────────────────────────────────────────────────

function MessageBubble({ msg, model, onApplyEpi, onApplyFunnel, onSourcesSaved, onSaveScenario, onScenarioSaved }) {
  const [savedName, setSavedName] = useState(null);
  const [saving, setSaving] = useState(false);

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-violet-600/20 border border-violet-500/20 rounded-2xl rounded-tr-sm px-3 py-2 text-sm text-slate-200">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === "error") {
    return (
      <div className="bg-red-900/20 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400">
        {msg.text}
      </div>
    );
  }

  if (msg.role === "ai") {
    const { intent, data } = msg;

    if (intent === "epi_search") {
      return (
        <EpiProposalCard
          data={data.payload}
          model={model}
          onApplyEpi={onApplyEpi}
          onApplyFunnel={onApplyFunnel}
          onSourcesSaved={onSourcesSaved}
        />
      );
    }

    if (intent === "scenario") {
      return (
        <ScenarioCard
          parsed={data.parsed}
          scenarioData={data.scenarioData}
          saving={saving}
          savedName={savedName}
          onSave={async () => {
            setSaving(true);
            const updated = await onSaveScenario(data.scenarioData);
            setSavedName(data.scenarioData.name);
            setSaving(false);
            onScenarioSaved?.(updated);
          }}
        />
      );
    }

    if (intent === "general") {
      return (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl rounded-tl-sm px-3 py-2.5">
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{data.text}</p>
        </div>
      );
    }
  }

  return null;
}

// ─── Epi proposal card ────────────────────────────────────────────────────────

function EpiProposalCard({ data, model, onApplyEpi, onApplyFunnel, onSourcesSaved }) {
  const [appliedEpi, setAppliedEpi] = useState(false);
  const [appliedFunnel, setAppliedFunnel] = useState(false);
  const [sourcingOpen, setSourcingOpen] = useState(true);
  const [expandedCtx, setExpandedCtx] = useState(null);
  if (!data) return null;

  const startYear = model.startYear || 2025;
  const years = Array.from({ length: model.timelineYears || 5 }, (_, i) => String(startYear + i));
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const lots = model.linesOfTherapy || 1;
  const segs = model.segments || 1;
  const numProds = 1 + (model.competitors || 0);

  const sourcingRows = data.rows ?? [];
  const epiCombos = data.combos ?? {};         // keyed "geoIdx-lotIdx"
  const funnelCutsData = data.funnelCuts ?? {}; // keyed by cut label

  // Preview: one row per geo+LOT
  const comboPreviewRows = [];
  for (let g = 0; g < geos.length; g++) {
    for (let l = 0; l < lots; l++) {
      const key = `${g}-${l}`;
      const vals = epiCombos[key] ?? {};
      comboPreviewRows.push({ key, label: `${geos[g]} / ${l + 1}L`, vals });
    }
  }

  const hasFunnelCuts = Object.keys(funnelCutsData).length > 0;
  const hasEpiCombos = comboPreviewRows.some(r => Object.keys(r.vals).length > 0);

  function handleApplyEpi() {
    // Expand 2-part geo+LOT key to ALL geo+LOT+seg+product combos with same value
    const combosPayload = {};
    for (let g = 0; g < geos.length; g++) {
      for (let l = 0; l < lots; l++) {
        const yearVals = epiCombos[`${g}-${l}`] ?? {};
        for (let s = 0; s < segs; s++) {
          for (let p = 0; p < numProds; p++) {
            combosPayload[`${g}-${l}-${s}-${p}`] = { input: yearVals, computed: yearVals };
          }
        }
      }
    }
    onApplyEpi?.({ inputLevel: "yearly", combos: combosPayload, _source: data.source });
    // Persist sourcing rows
    if (sourcingRows.length > 0) onSourcesSaved?.(sourcingRows);
    setAppliedEpi(true);
  }

  function handleApplyFunnel() {
    // Build proposal: same rate value across ALL combos for each funnel cut
    const funnelProposal = {};
    for (const [label, rate] of Object.entries(funnelCutsData)) {
      const yearVals = Object.fromEntries(years.map(y => [y, String(rate)]));
      const combosPayload = {};
      for (let g = 0; g < geos.length; g++) {
        for (let l = 0; l < lots; l++) {
          for (let s = 0; s < segs; s++) {
            for (let p = 0; p < numProds; p++) {
              combosPayload[`${g}-${l}-${s}-${p}`] = yearVals;
            }
          }
        }
      }
      funnelProposal[label] = { inputLevel: "yearly", combos: combosPayload };
    }
    onApplyFunnel?.(funnelProposal);
    if (!appliedEpi && sourcingRows.length > 0) onSourcesSaved?.(sourcingRows);
    setAppliedFunnel(true);
  }

  const RATE_COLORS = {
    "Incidence": "text-violet-300",
    "Prevalence": "text-violet-300",
    "Diagnosis Rate": "text-blue-300",
    "Biomarker Testing Rate": "text-cyan-300",
    "Biomarker Positivity Rate": "text-teal-300",
    "Treatment Eligibility 1L": "text-emerald-300",
    "LOT 1L→2L Flow": "text-amber-300",
    "LOT 2L→3L Flow": "text-orange-300",
  };

  return (
    <div className="bg-slate-800/60 border border-violet-500/20 rounded-2xl rounded-tl-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-700/60">
        <p className="text-violet-300 text-xs font-medium">Epi &amp; Funnel Cut Data Retrieved</p>
        {data.source && <p className="text-slate-500 text-xs mt-0.5">{data.source}</p>}
      </div>

      {/* Sourcing table */}
      {sourcingRows.length > 0 && (
        <div className="border-b border-slate-700/40">
          <button
            onClick={() => setSourcingOpen(o => !o)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 bg-slate-800/40 transition-colors"
          >
            <span className="font-medium text-slate-300">
              Source Breakdown
              <span className="ml-1.5 text-slate-500 font-normal">({sourcingRows.length} entries)</span>
            </span>
            <svg className={`w-3.5 h-3.5 transition-transform ${sourcingOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {sourcingOpen && (
            <div className="overflow-x-auto" style={{ maxHeight: "240px", overflowY: "auto" }}>
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800">
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Type</th>
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Geography</th>
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Retrieved</th>
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Base Pop</th>
                    <th className="px-2 py-1.5 text-right text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Rate</th>
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Unit</th>
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Source</th>
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">Context</th>
                  </tr>
                </thead>
                <tbody>
                  {sourcingRows.map((row, i) => (
                    <Fragment key={i}>
                      <tr className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                        <td className={`px-2 py-1.5 whitespace-nowrap font-medium ${RATE_COLORS[row.rate_type] || "text-slate-300"}`}>{row.rate_type}</td>
                        <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{row.geography}</td>
                        <td className="px-2 py-1.5 text-slate-300 max-w-[120px]">
                          <span className="block truncate" title={row.retrieved_value}>{row.retrieved_value}</span>
                        </td>
                        <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{row.base_population || "—"}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-400 tabular-nums font-semibold">
                          {row.calculated_rate != null ? Number(row.calculated_rate).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{row.unit}</td>
                        <td className="px-2 py-1.5">
                          {row.source_url ? (
                            <a href={row.source_url} target="_blank" rel="noopener noreferrer"
                              className="text-violet-400 hover:text-violet-300 underline underline-offset-2 flex items-center gap-0.5 whitespace-nowrap text-xs">
                              Link
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </a>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.source_context ? (
                            <button onClick={() => setExpandedCtx(expandedCtx === i ? null : i)}
                              className="text-slate-500 hover:text-slate-300 text-xs underline underline-offset-2 whitespace-nowrap transition-colors">
                              {expandedCtx === i ? "hide" : "view"}
                            </button>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                      </tr>
                      {expandedCtx === i && row.source_context && (
                        <tr className="bg-slate-900/60">
                          <td colSpan={8} className="px-3 py-2 text-slate-400 text-xs italic border-b border-slate-700/30">
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

      {/* Epi patient counts preview */}
      {hasEpiCombos && (
        <div className="border-b border-slate-700/40">
          <p className="px-3 py-1.5 text-slate-500 text-xs bg-slate-800/30">
            Patient counts per Geo / LOT (same value applied to all segments &amp; products)
          </p>
          <div className="overflow-x-auto" style={{ maxHeight: "160px", overflowY: "auto" }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/60">
                  <th className="px-3 py-1.5 text-left text-slate-400 font-medium sticky left-0 bg-slate-800/60 whitespace-nowrap">Geo / LOT</th>
                  {years.map(y => <th key={y} className="px-2 py-1.5 text-right text-slate-400 font-medium whitespace-nowrap">{y}</th>)}
                </tr>
              </thead>
              <tbody>
                {comboPreviewRows.map(row => (
                  <tr key={row.key} className="border-t border-slate-700/40">
                    <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap sticky left-0 bg-slate-800/40">{row.label}</td>
                    {years.map(y => (
                      <td key={y} className="px-2 py-1.5 text-right text-slate-200 tabular-nums">
                        {row.vals?.[y] != null ? Number(row.vals[y]).toLocaleString() : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Funnel cuts preview */}
      {hasFunnelCuts && (
        <div className="border-b border-slate-700/40">
          <p className="px-3 py-1.5 text-slate-500 text-xs bg-slate-800/30">Funnel cut rates (applied uniformly across all years)</p>
          <div className="px-3 py-2 space-y-1">
            {Object.entries(funnelCutsData).map(([label, rate]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-slate-300 text-xs">{label}</span>
                <span className="text-emerald-400 text-xs font-semibold tabular-nums">{Number(rate).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.methodology && (
        <p className="px-3 py-2 text-slate-500 text-xs italic border-b border-slate-700/40">{data.methodology}</p>
      )}

      {/* Action buttons */}
      <div className="px-3 py-2.5 space-y-2">
        {hasEpiCombos && (
          appliedEpi ? (
            <p className="text-emerald-400 text-xs flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
              Epi applied — review in Epidemiology section, then Save
            </p>
          ) : (
            <button onClick={handleApplyEpi}
              className="w-full py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors">
              Apply to Epi Assumptions
            </button>
          )
        )}
        {hasFunnelCuts && (
          appliedFunnel ? (
            <p className="text-emerald-400 text-xs flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
              Funnel cuts applied — review in Biomarker &amp; Funnel section, then Save
            </p>
          ) : (
            <button onClick={handleApplyFunnel}
              className="w-full py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium rounded-lg transition-colors">
              Apply to Funnel Cut Assumptions
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── Scenario card ────────────────────────────────────────────────────────────

function ScenarioCard({ parsed, scenarioData, saving, savedName, onSave }) {
  if (!parsed) return null;

  const changes = parsed.changes || [];

  return (
    <div className="bg-slate-800/60 border border-amber-500/20 rounded-2xl rounded-tl-sm overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-700/60">
        <p className="text-amber-300 text-xs font-medium">{parsed.scenarioName}</p>
        {parsed.description && <p className="text-slate-400 text-xs mt-0.5">{parsed.description}</p>}
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {changes.map((c, i) => {
          const keys = c.comboKeys === "all" ? "all combinations" : (Array.isArray(c.comboKeys) ? c.comboKeys.join(", ") : c.comboKeys);
          const years = c.applyToYears === "all" || !c.applyToYears ? "all years" : `${c.applyToYears.join(", ")}`;
          return (
            <div key={i} className="flex items-start gap-2">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${c.direction === "down" ? "bg-red-400" : "bg-emerald-400"}`} />
              <p className="text-slate-300 text-xs">
                <span className="font-medium text-slate-200 capitalize">{c.assumptionType}</span>
                {c.funnelCutId && <span className="text-slate-500"> ({c.funnelCutId})</span>}
                <span className={c.direction === "down" ? " text-red-400" : " text-emerald-400"}>
                  {" "}{c.direction === "down" ? "▼" : "▲"} {c.deltaPercent}%
                </span>
                <span className="text-slate-500"> · {keys} · {years}</span>
              </p>
            </div>
          );
        })}
      </div>

      <div className="px-3 py-2.5 border-t border-slate-700/60">
        {savedName ? (
          <p className="text-emerald-400 text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
            Saved as "{savedName}" — check Scenarios tab
          </p>
        ) : (
          <button
            onClick={onSave}
            disabled={saving}
            className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            {saving ? (
              <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
            ) : (
              "Save Scenario"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
