import { useForecast } from "../../store/forecastStore";
import { buildAssetCombos, DirectEntryPanel, getSharingForAssetAssumption } from "./shared";
import { apiFetch } from "../../utils/apiFetch";

const API = "http://localhost:3001/api";

const LOT_LABELS = ["1L", "2L", "3L", "4L", "5L", "6L+"];

export default function ProgressionAssumptions({ model, visibleKeys, readOnly = false }) {
  const { updateModel } = useForecast();

  // Combos: geo × fromLine × segment, excluding the last LOT (nothing progresses from it)
  const allAssetCombos = buildAssetCombos(model);
  const combos = allAssetCombos
    .filter(c => c.lotIdx < (model.linesOfTherapy ?? 1) - 1)
    .map(c => {
      const from = LOT_LABELS[c.lotIdx];
      const to   = LOT_LABELS[c.lotIdx + 1];
      return {
        ...c,
        // Replace the bare LOT token in the label with the transition arrow form
        label: c.label.replace(from, `${from}→${to}`),
      };
    });

  // Map the global 4-part visibleKeys (g-l-s-p) down to 3-part (g-l-s) for this panel
  const localVisibleKeys = visibleKeys
    ? new Set(
        combos
          .filter(c => {
            const prefix = `${c.geoIdx}-${c.lotIdx}-${c.segIdx}-`;
            for (const k of visibleKeys) {
              if (k.startsWith(prefix)) return true;
            }
            return false;
          })
          .map(c => c.key)
      )
    : null;

  async function handleSave(payload) {
    await apiFetch(`${API}/models/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progressionAssumptions: payload }),
    });
    updateModel(model.id, { progressionAssumptions: payload });
  }

  if (combos.length === 0) {
    return (
      <div className="px-5 py-6 text-slate-500 text-xs text-center">
        No progression transitions — model has only 1 line of therapy.
      </div>
    );
  }

  const transitions = Array.from(
    new Set(combos.map(c => `${LOT_LABELS[c.lotIdx]}→${LOT_LABELS[c.lotIdx + 1]}`))
  );

  return (
    <div>
      <div className="px-5 py-2 border-b border-slate-800 bg-slate-900/40">
        <p className="text-slate-500 text-xs">
          <span className="font-medium text-violet-400">% progressing per period</span>
          {" · "}
          {transitions.join(", ")}
          {" · "}
          {combos.length} combination{combos.length !== 1 ? "s" : ""}
          {" · "}
          input yearly or monthly, auto-converted to model granularity
        </p>
      </div>
      <DirectEntryPanel
        model={model}
        combos={combos}
        savedValues={model.progressionAssumptions}
        saveKey="progressionAssumptions"
        conversionType="rate"
        showPct={true}
        excelFilename={`${model.assetName || "model"}_progression.xlsx`}
        onSave={handleSave}
        sharingGroups={getSharingForAssetAssumption(model, "progression")}
        visibleKeys={localVisibleKeys}
        readOnly={readOnly}
      />
    </div>
  );
}
