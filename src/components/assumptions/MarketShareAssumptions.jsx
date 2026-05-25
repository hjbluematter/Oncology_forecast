import { useState } from "react";
import { useForecast } from "../../store/forecastStore";
import { buildCombos, buildYearlyKeys, buildMonthlyKeys, rateToMonthly, rateToYearly, MultiRowTable, DirectEntryPanel, MONTH_SHORT, num, getSharingForAssumption } from "./shared";
import { apiFetch } from "../../utils/apiFetch";

const API = "http://localhost:3001/api";

export default function MarketShareAssumptions({ model, visibleKeys, readOnly = false }) {
  const { updateModel } = useForecast();
  const combos = buildCombos(model);

  async function handleSave(payload) {
    const marketShareAssumptions = payload;
    await apiFetch(`${API}/models/${model.id}`, {
      method: "PATCH", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ marketShareAssumptions }),
    });
    updateModel(model.id, { marketShareAssumptions });
  }

  // Build totals panel data
  const modelLevel = (model.granularity ?? "Yearly").toLowerCase();
  const isMonthly  = modelLevel === "monthly";
  const allKeys    = isMonthly
    ? buildMonthlyKeys(model.startYear, model.timelineYears)
    : buildYearlyKeys(model.startYear, model.timelineYears);
  const years = Array.from({length:model.timelineYears},(_,i)=>model.startYear+i);
  const saved = model.marketShareAssumptions ?? {};

  return (
    <div className="divide-y divide-slate-800">
      <div className="px-5 py-2 border-b border-slate-800 bg-slate-900/40">
        <p className="text-slate-500 text-xs">
          {combos.length} combination{combos.length!==1?"s":""} · share % per period · rates repeated monthly / averaged yearly on mismatch
        </p>
      </div>
      <DirectEntryPanel
        model={model}
        combos={combos}
        savedValues={saved}
        conversionType="rate"
        showPct={false}
        excelFilename={`${model.assetName||"model"}_shares.xlsx`}
        onSave={handleSave}
        sharingGroups={getSharingForAssumption(model, "marketShare")}
        visibleKeys={visibleKeys}
        readOnly={readOnly}
      />
      <TotalsPanel model={model} combos={combos} savedValues={saved} allKeys={allKeys} years={years} isMonthly={isMonthly} />
    </div>
  );
}

// Shows sum of product shares per geo × LOT × segment group to validate they sum to 100%
function TotalsPanel({ model, combos, savedValues, allKeys, years, isMonthly }) {
  const lotCount = model.linesOfTherapy ?? 1;
  const segCount = model.segments ?? 1;
  const geos     = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const saved    = savedValues?.combos ?? {};

  // Get the input-level shares, then convert if needed
  const inputLevel    = savedValues?.inputLevel ?? (model.granularity ?? "Yearly").toLowerCase();
  const modelLevel    = (model.granularity ?? "Yearly").toLowerCase();

  function getComputedVal(comboKey, periodKey) {
    const inputVals = saved[comboKey]?.input ?? {};
    if (inputLevel === modelLevel) return num(inputVals[periodKey] ?? 0);
    // Convert
    const converted = inputLevel === "yearly"
      ? rateToMonthly(inputVals, model.startYear, model.timelineYears)
      : rateToYearly(inputVals, model.startYear, model.timelineYears);
    return num(converted[periodKey] ?? 0);
  }

  // Groups: geo × LOT × segment (sum all products within each group)
  const groups = [];
  for (let g = 0; g < geos.length; g++)
    for (let l = 0; l < lotCount; l++)
      for (let s = 0; s < segCount; s++) {
        const segLabel = model.segmentNames?.[s] || `Seg ${s+1}`;
        const parts = [
          geos.length > 1 ? geos[g] : null,
          lotCount > 1 ? `${l+1}L` : null,
          segCount > 1 ? segLabel : null,
        ].filter(Boolean);
        groups.push({
          label: parts.join(" / ") || "All",
          geoIdx:g, lotIdx:l, segIdx:s,
          isFirstInGeo: l===0 && s===0,
        });
      }

  const hBg = "bg-slate-800/70";

  return (
    <div>
      <p className="px-5 py-2.5 text-slate-500 text-xs italic">
        Note: market share across all products within a segment should sum to 100% per period.
      </p>
    </div>
  );
}
