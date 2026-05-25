import { useRef } from "react";
import { useForecast } from "../../store/forecastStore";
import { buildCombos, DirectEntryPanel, getSharingForAssumption } from "./shared";

const API = "http://localhost:3001/api";

export default function EpiAssumptions({ model, visibleKeys, proposal, onProposalConsumed }) {
  const { updateModel } = useForecast();
  const panelRef = useRef(null);
  const isPatientFlow = model.modelType === "Patient Flow";

  const allCombos = buildCombos(model);
  const combos = isPatientFlow ? allCombos.filter(c => c.lotIdx === 0) : allCombos;

  const epiType = model.epiType ?? "Incidence";
  const conversionType = epiType === "Prevalence" ? "stock" : "flow";

  async function handleSave(payload) {
    await fetch(`${API}/models/${model.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epiAssumptions: payload }),
    });
    updateModel(model.id, { epiAssumptions: payload });
    onProposalConsumed?.();
  }

  // Merge AI proposal into savedValues so DirectEntryPanel pre-fills with AI data
  const savedValuesWithProposal = proposal
    ? {
        ...(model.epiAssumptions ?? {}),
        inputLevel: proposal.inputLevel ?? model.epiAssumptions?.inputLevel ?? "yearly",
        combos: {
          ...(model.epiAssumptions?.combos ?? {}),
          ...proposal.combos,
        },
      }
    : model.epiAssumptions;

  return (
    <div ref={panelRef}>
      <div className="px-5 py-2 border-b border-slate-800 bg-slate-900/40 flex items-center gap-3">
        <p className="text-slate-500 text-xs flex-1">
          <span className="font-medium text-violet-400">{epiType}-based</span>
          {" · "}
          {epiType === "Incidence"
            ? "annual new patients — monthly rolldown divides by 12; yearly rollup sums 12 months"
            : "prevalent patient pool — monthly rolldown repeats the same value; yearly rollup averages 12 months"}
          {" · "}
          {isPatientFlow
            ? <span className="text-amber-400">1L only — Patient Flow model (downstream lines derived from flow)</span>
            : `${combos.length} combination${combos.length !== 1 ? "s" : ""} across all lines`}
        </p>
        {proposal && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI Preview — review values, then Save
            </span>
            <button onClick={onProposalConsumed} className="text-slate-600 hover:text-slate-400 text-xs transition-colors">Dismiss</button>
          </div>
        )}
      </div>
      <DirectEntryPanel
        model={model}
        combos={combos}
        savedValues={savedValuesWithProposal}
        saveKey="epiAssumptions"
        conversionType={conversionType}
        showPct={false}
        excelFilename={`${model.assetName || "model"}_epi.xlsx`}
        onSave={handleSave}
        sharingGroups={getSharingForAssumption(model, "epi")}
        visibleKeys={visibleKeys}
      />
    </div>
  );
}
