import { useState, useRef, useEffect, Fragment } from "react";
import { applyScenarioDelta, cloneBaseAssumptions } from "../utils/scenarioEngine";
import { runForecast } from "../utils/forecastEngine";

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
    const updatedModel = await res.json();
    // Pass the new scenario object (last in the array) up so ModelDetail can sync state
    const newScenario = Array.isArray(updatedModel.scenarios)
      ? updatedModel.scenarios[updatedModel.scenarios.length - 1]
      : scenarioData;
    onScenarioSaved?.(newScenario);
    return updatedModel;
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
          model={model}
          onSaveScenario={onSaveScenario}
          onScenarioSaved={onScenarioSaved}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasExistingEpiData(model) {
  const combos = model.epiAssumptions?.combos ?? {};
  return Object.values(combos).some(c => {
    const vals = c.input ?? c;
    return Object.values(vals ?? {}).some(v => v !== "" && v != null && v !== 0);
  });
}

function hasExistingFunnelData(model) {
  const fcv = model.funnelCutValues ?? {};
  return Object.values(fcv).some(cut => {
    const combos = cut.combos ?? {};
    return Object.values(combos).some(c => {
      const vals = c.input ?? c;
      return Object.values(vals ?? {}).some(v => v !== "" && v != null && v !== 0);
    });
  });
}

// ─── Override warning modal ───────────────────────────────────────────────────

function OverrideWarningModal({ target, onConfirm, onCancel }) {
  const label = target === "epi" ? "Epi Assumptions" : target === "funnel" ? "Funnel Cut Assumptions" : "Epi & Funnel Assumptions";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <p className="text-slate-100 text-sm font-semibold">Override existing values?</p>
            <p className="text-slate-400 text-xs mt-1">
              <span className="text-amber-400 font-medium">{label}</span> already has saved inputs.
              Applying AI-retrieved values will overwrite them. This cannot be undone until you manually re-enter the old values.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors">
            Override &amp; Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Derivation chain display ─────────────────────────────────────────────────

function DerivationSection({ derivation, populationByYear, epiCombos, years, geos, lots }) {
  const [activeGeo, setActiveGeo] = useState(geos[0]);
  if (!derivation || Object.keys(derivation).length === 0) return null;

  const geoData = derivation[activeGeo];
  if (!geoData) return null;

  const steps = geoData.steps ?? [];
  const popByYear = populationByYear?.[activeGeo] ?? {};
  const patsByYear = geoData.patients_by_year ?? {};
  const finalRate = geoData.final_rate_per_100k;

  const ROLE_STYLE = {
    anchor:   { dot: "bg-slate-400", label: "text-slate-300", badge: "bg-slate-700 text-slate-400" },
    filter:   { dot: "bg-amber-400",  label: "text-amber-300",  badge: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
    epi_base: { dot: "bg-violet-400", label: "text-violet-300", badge: "bg-violet-500/10 text-violet-400 border border-violet-500/20" },
  };

  return (
    <div className="border-b border-slate-700/40">
      {/* Section header */}
      <div className="px-3 py-1.5 bg-slate-800/40 flex items-center justify-between">
        <span className="text-slate-300 text-xs font-medium">Calculation Derivation</span>
        {geos.length > 1 && (
          <div className="flex gap-1">
            {geos.map(g => (
              <button key={g} onClick={() => setActiveGeo(g)}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${activeGeo === g ? "bg-violet-600 text-white" : "text-slate-500 hover:text-slate-300"}`}>
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step chain */}
      <div className="px-3 py-2 space-y-1.5">
        {steps.map((step, i) => {
          const style = ROLE_STYLE[step.role] ?? ROLE_STYLE.anchor;
          const isLast = i === steps.length - 1;
          return (
            <div key={i} className="flex items-start gap-2">
              {/* Connector */}
              <div className="flex flex-col items-center shrink-0 mt-1">
                <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                {!isLast && <div className="w-px flex-1 bg-slate-700 mt-1 min-h-[12px]" />}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-xs font-medium ${style.label}`}>{step.label}</span>
                  {step.role === "epi_base" && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${style.badge}`}>Epi Base ↑</span>
                  )}
                  {step.role === "filter" && step.operator && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${style.badge}`}>
                      × {Number(step.rate).toFixed(1)}{step.rate_unit === "%" ? "%" : ""}
                    </span>
                  )}
                </div>
                {step.retrieved_value && (
                  <p className="text-slate-500 text-xs mt-0.5 truncate" title={step.retrieved_value}>
                    {step.retrieved_value}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {step.output_absolute != null && (
                    <span className="text-slate-300 text-xs tabular-nums font-medium">
                      → {Number(step.output_absolute).toLocaleString()} patients
                    </span>
                  )}
                  {step.source_url && (
                    <a href={step.source_url} target="_blank" rel="noopener noreferrer"
                      className="text-violet-400 hover:text-violet-300 text-xs underline underline-offset-1">src</a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rate × Population table */}
      {finalRate != null && years.length > 0 && (
        <div className="mx-3 mb-2 rounded-lg overflow-hidden border border-slate-700/50">
          <div className="px-2 py-1 bg-slate-800/60 text-slate-400 text-xs font-medium">
            {finalRate.toFixed(2)}/100K × UN Population → Patients per Year
            {geoData.population_source && (
              <span className="ml-1.5 text-slate-600 font-normal">({geoData.population_source})</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/40">
                  <th className="px-2 py-1 text-left text-slate-500 font-medium whitespace-nowrap">Year</th>
                  <th className="px-2 py-1 text-right text-slate-500 font-medium whitespace-nowrap">Population</th>
                  <th className="px-2 py-1 text-right text-slate-500 font-medium whitespace-nowrap">Rate/100K</th>
                  <th className="px-2 py-1 text-right text-slate-500 font-medium whitespace-nowrap">= Patients</th>
                </tr>
              </thead>
              <tbody>
                {years.map(y => {
                  const pop = popByYear[y];
                  const pts = patsByYear[y];
                  return (
                    <tr key={y} className="border-t border-slate-700/30">
                      <td className="px-2 py-1 text-slate-400">{y}</td>
                      <td className="px-2 py-1 text-right text-slate-400 tabular-nums">
                        {pop != null ? Number(pop).toLocaleString() : "—"}
                      </td>
                      <td className="px-2 py-1 text-right text-slate-400 tabular-nums">{finalRate.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right text-emerald-400 tabular-nums font-semibold">
                        {pts != null ? Number(pts).toLocaleString() : "—"}
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

// ─── Epi proposal card ────────────────────────────────────────────────────────

function EpiProposalCard({ data, model, onApplyEpi, onApplyFunnel, onSourcesSaved }) {
  const [appliedEpi, setAppliedEpi] = useState(false);
  const [appliedFunnel, setAppliedFunnel] = useState(false);
  const [sourcingOpen, setSourcingOpen] = useState(false);
  const [derivationOpen, setDerivationOpen] = useState(true);
  const [expandedCtx, setExpandedCtx] = useState(null);
  const [overrideWarning, setOverrideWarning] = useState(null); // null | "epi" | "funnel"
  if (!data) return null;

  const startYear = model.startYear || 2025;
  const years = Array.from({ length: model.timelineYears || 5 }, (_, i) => String(startYear + i));
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const lots = model.linesOfTherapy || 1;
  const segs = model.segments || 1;
  const numProds = 1 + (model.competitors || 0);

  const sourcingRows = data.rows ?? [];
  const epiCombos = data.combos ?? {};
  const funnelCutsData = data.funnelCuts ?? {};
  const derivation = data.derivation ?? {};
  const populationByYear = data.population_by_year ?? {};

  const hasFunnelCuts = Object.keys(funnelCutsData).length > 0;
  const hasEpiCombos = Object.values(epiCombos).some(v => Object.keys(v).length > 0);
  const hasDerivation = Object.keys(derivation).length > 0;

  function doApplyEpi() {
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
    // Save full session (rows + derivation + population + methodology) so Research tab can reconstruct everything
    onSourcesSaved?.({
      rows: sourcingRows,
      derivation: data.derivation ?? {},
      population_by_year: data.population_by_year ?? {},
      funnelCuts: data.funnelCuts ?? {},
      methodology: data.methodology ?? null,
      source: data.source ?? null,
    });
    setAppliedEpi(true);
  }

  function doApplyFunnel() {
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
    if (!appliedEpi) {
      onSourcesSaved?.({
        rows: sourcingRows,
        derivation: data.derivation ?? {},
        population_by_year: data.population_by_year ?? {},
        funnelCuts: data.funnelCuts ?? {},
        methodology: data.methodology ?? null,
        source: data.source ?? null,
      });
    }
    setAppliedFunnel(true);
  }

  function handleApplyEpi() {
    if (hasExistingEpiData(model)) { setOverrideWarning("epi"); return; }
    doApplyEpi();
  }

  function handleApplyFunnel() {
    if (hasExistingFunnelData(model)) { setOverrideWarning("funnel"); return; }
    doApplyFunnel();
  }

  function confirmOverride() {
    const target = overrideWarning;
    setOverrideWarning(null);
    if (target === "epi") doApplyEpi();
    if (target === "funnel") doApplyFunnel();
  }

  const RATE_COLORS = {
    "Incidence": "text-violet-300", "Prevalence": "text-violet-300",
    "Diagnosis Rate": "text-blue-300", "Biomarker Testing Rate": "text-cyan-300",
    "Biomarker Positivity Rate": "text-teal-300", "Treatment Eligibility 1L": "text-emerald-300",
    "LOT 1L→2L Flow": "text-amber-300", "LOT 2L→3L Flow": "text-orange-300",
  };

  return (
    <>
      {overrideWarning && (
        <OverrideWarningModal
          target={overrideWarning}
          onConfirm={confirmOverride}
          onCancel={() => setOverrideWarning(null)}
        />
      )}

      <div className="bg-slate-800/60 border border-violet-500/20 rounded-2xl rounded-tl-sm overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-slate-700/60">
          <p className="text-violet-300 text-xs font-medium">Epi &amp; Funnel Cut Data Retrieved</p>
          {data.source && <p className="text-slate-500 text-xs mt-0.5">{data.source}</p>}
        </div>

        {/* Derivation chain — shown by default, most informative section */}
        {hasDerivation && (
          <div className="border-b border-slate-700/40">
            <button
              onClick={() => setDerivationOpen(o => !o)}
              className="w-full px-3 py-2 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 bg-slate-800/40 transition-colors"
            >
              <span className="font-medium text-slate-300">
                Calculation Derivation
                <span className="ml-1.5 text-slate-500 font-normal">rate → UN pop × year</span>
              </span>
              <svg className={`w-3.5 h-3.5 transition-transform ${derivationOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {derivationOpen && (
              <DerivationSection
                derivation={derivation}
                populationByYear={populationByYear}
                epiCombos={epiCombos}
                years={years}
                geos={geos}
                lots={lots}
              />
            )}
          </div>
        )}

        {/* Sourcing table — collapsed by default since derivation is more useful */}
        {sourcingRows.length > 0 && (
          <div className="border-b border-slate-700/40">
            <button
              onClick={() => setSourcingOpen(o => !o)}
              className="w-full px-3 py-2 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 bg-slate-800/40 transition-colors"
            >
              <span className="font-medium text-slate-300">
                Raw Source Data
                <span className="ml-1.5 text-slate-500 font-normal">({sourcingRows.length} entries)</span>
              </span>
              <svg className={`w-3.5 h-3.5 transition-transform ${sourcingOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {sourcingOpen && (
              <div className="overflow-x-auto" style={{ maxHeight: "220px", overflowY: "auto" }}>
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-800">
                      {["Type","Geography","Retrieved","Base Pop","Rate","Unit","Source","Context"].map(h => (
                        <th key={h} className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-700">{h}</th>
                      ))}
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
                                Link <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
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

        {/* Funnel cuts preview */}
        {hasFunnelCuts && (
          <div className="border-b border-slate-700/40">
            <p className="px-3 py-1.5 text-slate-500 text-xs bg-slate-800/30">Funnel cut rates (applied uniformly across all years)</p>
            <div className="px-3 py-2 space-y-1">
              {Object.entries(funnelCutsData).map(([label, rate]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-slate-300 text-xs">{label}</span>
                  <span className="text-emerald-400 text-xs font-semibold tabular-nums">{Number(rate).toFixed(1)}%</span>
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
    </>
  );
}

// ─── Scenario card — full AI-guided flow ─────────────────────────────────────
// Step 1: Show proposed changes
// Step 2: Ask additive (pp) or relative (×%) — only if changes involve percentages
// Step 3: Apply delta, run forecast, show delta summary vs base
// Step 4: Name input + Save → goes into ScenarioManager

function fmtRevDelta(v) {
  if (!v && v !== 0) return "—";
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "−";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

function ScenarioCard({ parsed, model, onSaveScenario, onScenarioSaved }) {
  if (!parsed) return null;

  // Step state: "apply_mode" | "running" | "preview" | "saving" | "saved"
  const [step, setStep] = useState("apply_mode");
  const [applyMode, setApplyMode] = useState(null); // "relative" | "absolute"
  const [forecastDelta, setForecastDelta] = useState(null); // { baseTotalRev, scTotalRev, delta, deltaPct }
  const [scenarioAssumptions, setScenarioAssumptions] = useState(null);
  const [scenarioName, setScenarioName] = useState(parsed.scenarioName ?? "");
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState(null);
  const [runError, setRunError] = useState(null);

  const changes = parsed.changes || [];

  // Operational fields that are percentages — need absolute/relative choice
  const OP_PCT_FIELDS = new Set(["gtn", "compliance", "access", "abandonment"]);

  // Determine if any change involves a percentage assumption (not epi count)
  const hasPercentageChange = changes.some(c =>
    c.assumptionType === "funnelCut" ||
    c.assumptionType === "marketShare" ||
    c.assumptionType === "persistency" ||
    (c.assumptionType === "operationalAssumption" && OP_PCT_FIELDS.has(c.fieldName))
  );

  function handleModeSelect(mode) {
    setApplyMode(mode);
    runScenario(mode);
  }

  function runScenario(mode) {
    setStep("running");
    setRunError(null);
    setTimeout(() => {
      try {
        const snap = applyScenarioDelta(model, parsed, mode);
        setScenarioAssumptions(snap);

        const baseResults = runForecast(model);
        const scenarioModel = { ...model, ...snap };
        const scResults = runForecast(scenarioModel);

        const baseTotalRev = Object.values(baseResults.totalRevenue ?? {}).reduce((s, v) => s + v, 0);
        const scTotalRev   = Object.values(scResults.totalRevenue ?? {}).reduce((s, v) => s + v, 0);
        const delta = scTotalRev - baseTotalRev;
        const deltaPct = baseTotalRev ? (delta / baseTotalRev) * 100 : null;

        const baseTotalNPS = Object.values(baseResults.totalNPS ?? {}).reduce((s, v) => s + v, 0);
        const scTotalNPS   = Object.values(scResults.totalNPS ?? {}).reduce((s, v) => s + v, 0);

        // Warn if base forecast is zero — assumptions likely not filled in
        const zeroBaseWarning = baseTotalRev === 0 && baseTotalNPS === 0
          ? "Base forecast is $0 — fill in Epi, Market Share and Operational assumptions first, then the delta will be meaningful."
          : null;

        setForecastDelta({ baseTotalRev, scTotalRev, delta, deltaPct, baseTotalNPS, scTotalNPS, zeroBaseWarning });
        setStep("preview");
      } catch (e) {
        setRunError(e?.message ?? String(e));
        setStep("apply_mode");
      }
    }, 0);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const scenarioObj = {
        name: scenarioName.trim() || parsed.scenarioName,
        description: parsed.description ?? "",
        createdAt: new Date().toLocaleDateString(),
        assumptions: { ...cloneBaseAssumptions(model), ...scenarioAssumptions },
        changes,
        applyMode,
        aiGenerated: true,
      };
      await onSaveScenario(scenarioObj);
      setSavedName(scenarioObj.name);
      setStep("saved");
    } catch (e) {
      setRunError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-800/60 border border-amber-500/20 rounded-2xl rounded-tl-sm overflow-hidden">
      {/* Header — proposed changes */}
      <div className="px-3 py-2.5 border-b border-slate-700/60">
        <p className="text-amber-300 text-xs font-medium">{parsed.scenarioName}</p>
        {parsed.description && <p className="text-slate-400 text-xs mt-0.5">{parsed.description}</p>}
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {changes.map((c, i) => {
          const keyLabel = c.comboKeys === "all" ? "all combos" : (Array.isArray(c.comboKeys) ? c.comboKeys.join(", ") : c.comboKeys);
          const yrLabel  = c.applyToYears === "all" || !c.applyToYears ? "all years" : c.applyToYears.join(", ");
          // Build a human-readable label for the assumption type + sub-field
          const TYPE_LABELS = {
            epi: "Epi", funnelCut: "Funnel Cut", marketShare: "Market Share",
            persistency: "Persistency", progression: "Progression",
            progressionAssumption: "Progression", operationalAssumption: "Operational",
          };
          const FIELD_LABELS = {
            grossPrice: "Gross Price", gtn: "GTN", compliance: "Compliance",
            access: "Access", abandonment: "Abandonment", vials: "Vials/PM",
          };
          const typeLabel  = TYPE_LABELS[c.assumptionType] ?? c.assumptionType;
          const subLabel   = c.fieldName ? (FIELD_LABELS[c.fieldName] ?? c.fieldName)
                           : c.funnelCutId ? c.funnelCutId : null;
          return (
            <div key={i} className="flex items-start gap-2">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${c.direction === "down" ? "bg-red-400" : "bg-emerald-400"}`} />
              <p className="text-slate-300 text-xs">
                <span className="font-medium text-slate-200">{typeLabel}</span>
                {subLabel && <span className="text-slate-400"> · {subLabel}</span>}
                <span className={c.direction === "down" ? " text-red-400" : " text-emerald-400"}>
                  {" "}{c.direction === "down" ? "▼" : "▲"} {c.deltaPercent}%
                </span>
                <span className="text-slate-500"> · {keyLabel} · {yrLabel}</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Step 1 — apply mode selection */}
      {step === "apply_mode" && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-700/60 pt-2.5">
          {runError && <p className="text-red-400 text-xs">{runError}</p>}
          {hasPercentageChange ? (
            <>
              <p className="text-slate-400 text-xs">How should the {changes[0]?.deltaPercent}% change be applied?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleModeSelect("absolute")}
                  className="px-2 py-2 rounded-lg border border-slate-600 text-xs text-slate-300 hover:border-amber-500/50 hover:text-amber-300 transition-all text-left"
                >
                  <p className="font-medium">Absolute (pp)</p>
                  <p className="text-slate-500 mt-0.5">e.g. 30% → 25%</p>
                </button>
                <button
                  onClick={() => handleModeSelect("relative")}
                  className="px-2 py-2 rounded-lg border border-slate-600 text-xs text-slate-300 hover:border-amber-500/50 hover:text-amber-300 transition-all text-left"
                >
                  <p className="font-medium">Relative (×)</p>
                  <p className="text-slate-500 mt-0.5">e.g. 30% → 28.5%</p>
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => handleModeSelect("relative")}
              className="w-full py-1.5 bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Run Forecast
            </button>
          )}
        </div>
      )}

      {/* Step 2 — running spinner */}
      {step === "running" && (
        <div className="px-3 py-4 flex items-center justify-center gap-2 border-t border-slate-700/60">
          <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-xs">Running forecast…</span>
        </div>
      )}

      {/* Step 3 — preview output delta */}
      {step === "preview" && forecastDelta && (
        <div className="border-t border-slate-700/60">
          {forecastDelta.zeroBaseWarning && (
            <div className="mx-3 mt-2.5 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-amber-400 text-xs leading-relaxed">{forecastDelta.zeroBaseWarning}</p>
            </div>
          )}
          <div className="px-3 py-2.5 grid grid-cols-2 gap-2">
            <div className="bg-slate-900/60 rounded-lg px-2.5 py-2">
              <p className="text-slate-500 text-xs">Revenue Δ (total)</p>
              <p className={`text-sm font-semibold tabular-nums mt-0.5 ${forecastDelta.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtRevDelta(forecastDelta.delta)}
              </p>
              {forecastDelta.deltaPct !== null && (
                <p className={`text-xs ${forecastDelta.delta >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {forecastDelta.delta >= 0 ? "+" : ""}{forecastDelta.deltaPct.toFixed(1)}% vs base
                </p>
              )}
            </div>
            <div className="bg-slate-900/60 rounded-lg px-2.5 py-2">
              <p className="text-slate-500 text-xs">NPS Δ (total)</p>
              <p className={`text-sm font-semibold tabular-nums mt-0.5 ${forecastDelta.scTotalNPS >= forecastDelta.baseTotalNPS ? "text-emerald-400" : "text-red-400"}`}>
                {forecastDelta.scTotalNPS >= forecastDelta.baseTotalNPS ? "+" : ""}
                {Math.round(forecastDelta.scTotalNPS - forecastDelta.baseTotalNPS).toLocaleString()}
              </p>
              <p className="text-slate-500 text-xs">patients</p>
            </div>
          </div>
          <p className="text-slate-600 text-xs px-3 pb-1.5">
            Mode: <span className="text-slate-500">{applyMode === "absolute" ? "Absolute (pp subtracted)" : "Relative (× factor)"}</span>
          </p>

          {/* Name + save */}
          <div className="px-3 pb-3 space-y-2 border-t border-slate-700/40 pt-2.5">
            <p className="text-slate-400 text-xs">Save this scenario?</p>
            <input
              value={scenarioName}
              onChange={e => setScenarioName(e.target.value)}
              placeholder="Scenario name…"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-violet-500 transition-colors placeholder:text-slate-600"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setStep("apply_mode")}
                className="flex-1 py-1.5 border border-slate-600 text-slate-400 hover:text-slate-200 text-xs rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !scenarioName.trim()}
                className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                {saving
                  ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                  : "Save to Scenarios"}
              </button>
            </div>
            {runError && <p className="text-red-400 text-xs">{runError}</p>}
          </div>
        </div>
      )}

      {/* Saved confirmation */}
      {step === "saved" && (
        <div className="px-3 py-3 border-t border-slate-700/60 space-y-1.5">
          <p className="text-emerald-400 text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
            Saved as &ldquo;{savedName}&rdquo;
          </p>
          <p className="text-slate-500 text-xs leading-relaxed pl-5">
            Switch to the <span className="text-violet-400 font-medium">Scenarios tab</span> → click
            &ldquo;{savedName}&rdquo; → <span className="text-violet-400">Compare</span> to see
            revenue and patient count vs the base model.
          </p>
        </div>
      )}
    </div>
  );
}
