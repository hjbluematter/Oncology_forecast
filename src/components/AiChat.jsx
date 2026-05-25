import { useState, useRef, useEffect } from "react";

const API = "http://localhost:3001/api";

const SUGGESTIONS = [
  "Pull epi cuts for this model",
  "Run scenario: 5% downside in epi",
  "Run scenario: 10% upside in market share",
  "Run scenario: 3% downside in funnel rates",
];

export default function AiChat({ model, onEpiProposal, onScenarioSaved }) {
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
        body: JSON.stringify({ message: msg, model }),
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
              <p className="text-slate-500 text-xs mt-0.5">Powered by Gemini · {model.assetName}</p>
            </div>
            <button onClick={() => setMessages([])} className="ml-auto text-slate-600 hover:text-slate-400 text-xs transition-colors">
              Clear
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-slate-500 text-xs text-center pt-2">What can I help you with?</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 text-xs hover:border-violet-500/40 hover:text-slate-200 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                model={model}
                onApplyEpi={onEpiProposal}
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

function MessageBubble({ msg, model, onApplyEpi, onSaveScenario, onScenarioSaved }) {
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
      return <EpiProposalCard data={data.payload} model={model} onApply={onApplyEpi} />;
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

function EpiProposalCard({ data, model, onApply }) {
  const [applied, setApplied] = useState(false);
  if (!data) return null;

  const startYear = model.startYear || 2025;
  const years = Array.from({ length: model.timelineYears || 5 }, (_, i) => String(startYear + i));
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];

  // Build rows: one per combo key
  const combos = data.combos ?? {};
  const rows = Object.entries(combos).map(([key, vals]) => {
    const [gi, li, si] = key.split("-").map(Number);
    const geo = geos[gi] || `Geo ${gi}`;
    const lot = `${(li ?? 0) + 1}L`;
    const seg = model.segmentNames?.[si] || (model.segments > 1 ? `Seg ${(si ?? 0) + 1}` : null);
    const label = [geo, lot, seg].filter(Boolean).join(" / ");
    return { key, label, vals };
  });

  function handleApply() {
    // Convert to the epiAssumptions.combos shape
    const combosPayload = {};
    for (const [ck, yearVals] of Object.entries(combos)) {
      combosPayload[ck] = { input: yearVals, computed: yearVals };
    }
    onApply?.({ inputLevel: "yearly", combos: combosPayload, _source: data.source });
    setApplied(true);
  }

  return (
    <div className="bg-slate-800/60 border border-violet-500/20 rounded-2xl rounded-tl-sm overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-700/60">
        <p className="text-violet-300 text-xs font-medium">Epi Data Found</p>
        {data.source && <p className="text-slate-500 text-xs mt-0.5 truncate">{data.source}</p>}
      </div>

      {/* Mini table */}
      <div className="overflow-x-auto max-h-48">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800">
              <th className="px-3 py-1.5 text-left text-slate-400 font-medium sticky left-0 bg-slate-800">Combination</th>
              {years.map((y) => (
                <th key={y} className="px-2 py-1.5 text-right text-slate-400 font-medium whitespace-nowrap">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-700/40">
                <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap sticky left-0 bg-slate-800/60">{row.label}</td>
                {years.map((y) => (
                  <td key={y} className="px-2 py-1.5 text-right text-slate-200 tabular-nums">
                    {row.vals?.[y] != null ? Number(row.vals[y]).toLocaleString() : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.methodology && (
        <p className="px-3 py-2 text-slate-500 text-xs border-t border-slate-700/40">{data.methodology}</p>
      )}

      <div className="px-3 py-2.5 border-t border-slate-700/60">
        {applied ? (
          <p className="text-emerald-400 text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
            Applied to Epi Assumptions — review &amp; save
          </p>
        ) : (
          <button
            onClick={handleApply}
            className="w-full py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Apply to Epi Assumptions
          </button>
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
