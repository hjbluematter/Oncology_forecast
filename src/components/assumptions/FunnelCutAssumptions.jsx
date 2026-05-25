import { useState, useEffect } from "react";
import { useForecast } from "../../store/forecastStore";
import { buildCombos, DirectEntryPanel, getSharingForAssumption } from "./shared";

const API = "http://localhost:3001/api";

export default function FunnelCutAssumptions({ model, visibleKeys, funnelProposal, onProposalConsumed }) {
  const { updateModel } = useForecast();
  const combos  = buildCombos(model);
  const allCuts = (model.epiFunnel ?? []).filter(f => !f.locked);

  if (allCuts.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-slate-600 text-sm">
        No funnel cuts configured — add steps in model setup.
      </div>
    );
  }

  const hasProposal = funnelProposal && Object.keys(funnelProposal).length > 0;

  async function saveForCut(cutId, payload) {
    const funnelCutValues = {
      ...(model.funnelCutValues ?? {}),
      [cutId]: payload,
    };
    await fetch(`${API}/models/${model.id}`, {
      method: "PATCH", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ funnelCutValues }),
    });
    updateModel(model.id, { funnelCutValues });
  }

  return (
    <div className="divide-y divide-slate-800">
      <div className="px-5 py-2 bg-slate-900/60 flex items-center gap-3">
        <p className="text-slate-500 text-xs flex-1">
          {allCuts.length} funnel cut{allCuts.length!==1?"s":""} · {combos.length} combination{combos.length!==1?"s":""} per cut
        </p>
        {hasProposal && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI Preview — review values, then Save each cut
            </span>
            <button onClick={onProposalConsumed} className="text-slate-600 hover:text-slate-400 text-xs transition-colors">Dismiss</button>
          </div>
        )}
      </div>
      {allCuts.map((cut, idx) => (
        <CutSection
          key={cut.id}
          cut={cut} idx={idx}
          combos={combos}
          model={model}
          savedValues={(model.funnelCutValues ?? {})[cut.id]}
          onSave={payload => saveForCut(cut.id, payload)}
          visibleKeys={visibleKeys}
          proposalCombos={funnelProposal?.[cut.label]?.combos}
          autoOpen={!!(funnelProposal?.[cut.label])}
        />
      ))}
    </div>
  );
}

function CutSection({ cut, idx, combos, model, savedValues, onSave, visibleKeys, proposalCombos, autoOpen }) {
  const [open, setOpen] = useState(autoOpen || false);

  // Auto-open when proposal arrives for this cut
  useEffect(() => {
    if (proposalCombos) setOpen(true);
  }, [proposalCombos]);

  const isAbsolute = cut.operator === "add" || cut.operator === "subtract";
  const opSymbol   = { complement:"1−x", multiply:"×", divide:"÷", add:"+", subtract:"−" }[cut.operator] ?? cut.operator;
  const opColor    = isAbsolute ? "text-amber-400" : "text-violet-400";

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-slate-500 text-xs flex items-center justify-center shrink-0">
            {idx + 2}
          </span>
          <div>
            <p className="text-slate-200 text-sm font-medium flex items-center gap-2">
              {cut.label || `Funnel Cut ${idx+1}`}
              {proposalCombos && (
                <span className="text-cyan-400 text-xs font-normal">· AI values loaded</span>
              )}
            </p>
            <p className="text-slate-600 text-xs">
              {cut.description}
              {" "}· operator: <span className={`font-mono ${opColor}`}>{opSymbol}</span>
              {" "}· {isAbsolute ? "absolute patients" : "rate (%)"}
            </p>
          </div>
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
            showPct={!isAbsolute}
            excelFilename={`${cut.label||"cut"}_values.xlsx`}
            onSave={onSave}
            sharingGroups={getSharingForAssumption(model, `funnel_${cut.id ?? cut.name}`)}
            visibleKeys={visibleKeys}
            proposalCombos={proposalCombos}
          />
        </div>
      )}
    </div>
  );
}
