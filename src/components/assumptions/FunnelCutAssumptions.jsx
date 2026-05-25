import { useState } from "react";
import { useForecast } from "../../store/forecastStore";
import { buildCombos, DirectEntryPanel, getSharingForAssumption } from "./shared";
import { apiFetch } from "../../utils/apiFetch";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export default function FunnelCutAssumptions({ model, visibleKeys, readOnly = false }) {
  const { updateModel } = useForecast();
  const combos  = buildCombos(model);
  const allCuts = (model.epiFunnel ?? []).filter(f => !f.locked);

  if (allCuts.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-slate-400 text-sm">
        No funnel cuts configured — add steps in model setup.
      </div>
    );
  }

  async function saveForCut(cutId, payload) {
    const funnelCutValues = {
      ...(model.funnelCutValues ?? {}),
      [cutId]: payload,
    };
    await apiFetch(`${API}/models/${model.id}`, {
      method: "PATCH", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ funnelCutValues }),
    });
    updateModel(model.id, { funnelCutValues });
  }

  return (
    <div className="divide-y divide-slate-800">
      <div className="px-5 py-2 bg-slate-900/60">
        <p className="text-slate-500 text-xs">
          {allCuts.length} funnel cut{allCuts.length!==1?"s":""} · {combos.length} combination{combos.length!==1?"s":""} per cut
        </p>
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
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

function CutSection({ cut, idx, combos, model, savedValues, onSave, visibleKeys, readOnly }) {
  const [open, setOpen] = useState(false);

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
            <p className="text-slate-200 text-sm font-medium">{cut.label || `Funnel Cut ${idx+1}`}</p>
            <p className="text-slate-400 text-xs">
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
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  );
}
