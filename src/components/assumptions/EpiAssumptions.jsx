import { useForecast } from "../../store/forecastStore";
import { buildCombos, DirectEntryPanel, getSharingForAssumption } from "./shared";
import { apiFetch } from "../../utils/apiFetch";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export default function EpiAssumptions({ model, visibleKeys, readOnly = false }) {
  const { updateModel } = useForecast();
  const isPatientFlow = model.modelType === "Patient Flow";

  // Patient Flow: epi entered at 1L only — downstream lines are derived from patient flow logic.
  // Patient Segmentation: epi entered for every LOT independently.
  const allCombos = buildCombos(model);
  const combos = isPatientFlow ? allCombos.filter(c => c.lotIdx === 0) : allCombos;

  const epiType = model.epiType ?? "Incidence";
  const conversionType = epiType === "Prevalence" ? "stock" : "flow";

  async function handleSave(payload) {
    await apiFetch(`${API}/models/${model.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epiAssumptions: payload }),
    });
    updateModel(model.id, { epiAssumptions: payload });
  }

  return (
    <div>
      <div className="px-5 py-2 border-b border-slate-800 bg-slate-900/40">
        <p className="text-slate-500 text-xs">
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
      </div>
      <DirectEntryPanel
        model={model}
        combos={combos}
        savedValues={model.epiAssumptions}
        saveKey="epiAssumptions"
        conversionType={conversionType}
        showPct={false}
        excelFilename={`${model.assetName || "model"}_epi.xlsx`}
        onSave={handleSave}
        sharingGroups={getSharingForAssumption(model, "epi")}
        visibleKeys={visibleKeys}
        readOnly={readOnly}
      />
    </div>
  );
}
