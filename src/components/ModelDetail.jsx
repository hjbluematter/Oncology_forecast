import { useState } from "react";
import { useForecast } from "../store/forecastStore";
import EpiAssumptions from "./assumptions/EpiAssumptions";
import FunnelCutAssumptions from "./assumptions/FunnelCutAssumptions";
import MarketShareAssumptions from "./assumptions/MarketShareAssumptions";
import PersistencyAssumptions from "./assumptions/PersistencyAssumptions";
import OperationalAssumptions from "./assumptions/OperationalAssumptions";
import InputSharingAssumptions from "./assumptions/InputSharingAssumptions";
import { buildCombos, ComboFilter, filterCombos } from "./assumptions/shared";
import AiChat from "./AiChat";
import ScenariosTab from "./Scenarios";
import ResearchTab from "./ResearchTab";

const TABS = [
  { id: "assumptions", label: "Assumptions" },
  { id: "sharing", label: "Input Sharing" },
  { id: "forecast", label: "Forecast Output" },
  { id: "research", label: "Research" },
  { id: "scenarios", label: "Scenarios" },
];

export default function ModelDetail() {
  const { activeModel, setView, updateModel } = useForecast();
  const [activeTab, setActiveTab] = useState("assumptions");
  const [epiProposal, setEpiProposal] = useState(null);
  const [funnelProposal, setFunnelProposal] = useState(null);

  async function handleSourcesSaved(rows) {
    const newSession = { pulledAt: new Date().toISOString(), rows };
    const epiSources = [...(activeModel.epiSources ?? []), newSession];
    await fetch("http://localhost:3001/api/models/" + activeModel.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epiSources }),
    });
    updateModel(activeModel.id, { epiSources });
  }

  if (!activeModel) return null;

  const endYear = activeModel.startYear + activeModel.timelineYears - 1;
  const totalPeriods =
    activeModel.granularity === "Monthly"
      ? activeModel.timelineYears * 12
      : activeModel.timelineYears;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top bar */}
      <header className="bm-header border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("dashboard")}
              className="text-blue-200 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              All Models
            </button>
            <span className="text-blue-400">/</span>
            <span className="text-white text-sm font-medium">{activeModel.assetName}</span>
            <span className="text-blue-400 text-sm">·</span>
            <span className="text-blue-200 text-sm">{activeModel.indication}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-blue-200 text-xs">{activeModel.granularity} · {totalPeriods} periods</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ring-1 font-medium ${
              activeModel.status === "Active"
                ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
                : "bg-amber-500/15 text-amber-400 ring-amber-500/30"
            }`}>
              {activeModel.status}
            </span>
          </div>
        </div>
      </header>

      {/* Summary strip */}
      <div className="border-b border-slate-800 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6 overflow-x-auto">
          {[
            { label: "Model Type", value: activeModel.modelType },
            { label: "Epi Basis", value: activeModel.epiType },
            { label: "Granularity", value: activeModel.granularity ?? "Yearly" },
            { label: "Period", value: `${activeModel.startYear} – ${endYear}` },
            { label: "LOT", value: `${activeModel.linesOfTherapy}L` },
            { label: "Segments", value: activeModel.segments },
            { label: "Geographies", value: activeModel.geographies?.length ?? "—" },
          ].map(item => (
            <div key={item.label} className="shrink-0">
              <p className="text-slate-600 text-xs">{item.label}</p>
              <p className="text-slate-300 text-sm font-medium">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-violet-500 text-violet-300"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "assumptions" && (
          <AssumptionsTab
            model={activeModel}
            epiProposal={epiProposal}
            onEpiProposalConsumed={() => setEpiProposal(null)}
            funnelProposal={funnelProposal}
            onFunnelProposalConsumed={() => setFunnelProposal(null)}
          />
        )}
        {activeTab === "sharing" && <SharingTab model={activeModel} />}
        {activeTab === "forecast" && <PlaceholderTab label="Forecast Output" description="Revenue waterfall, LOT breakdown, and geography split will render here once assumptions are saved." />}
        {activeTab === "research" && (
          <ResearchTab
            model={activeModel}
            onModelUpdate={(patch) => updateModel(activeModel.id, patch)}
          />
        )}
        {activeTab === "scenarios" && <ScenariosTab model={activeModel} />}
      </main>

      <AiChat
        model={activeModel}
        activeTab={activeTab}
        onEpiProposal={(proposal) => {
          setEpiProposal(proposal);
          setActiveTab("assumptions");
        }}
        onFunnelProposal={(proposal) => {
          setFunnelProposal(proposal);
          setActiveTab("assumptions");
        }}
        onSourcesSaved={handleSourcesSaved}
        onScenarioSaved={(updated) => {
          updateModel(activeModel.id, { scenarios: updated.scenarios });
        }}
      />
    </div>
  );
}

// ─── Assumptions tab ──────────────────────────────────────────────────────────

function SharingTab({ model }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <InputSharingAssumptions model={model} />
    </div>
  );
}

function AssumptionsTab({ model, epiProposal, onEpiProposalConsumed, funnelProposal, onFunnelProposalConsumed }) {
  const allCombos = buildCombos(model);
  const [filterState, setFilterState] = useState(null);
  // Always provide visibleKeys so geo tabs inside DirectEntryPanel never appear —
  // null filterState means "all selected", so we pass a Set of all combo keys.
  const visibleKeys = filterState
    ? filterCombos(allCombos, filterState)
    : new Set(allCombos.map(c => c.key));

  return (
    <div className="space-y-6">
      {/* Global combo filter */}
      <ComboFilter combos={allCombos} onChange={setFilterState} />

      {/* Section: Epidemiology */}
      <AssumptionSection
        title="Epidemiology"
        subtitle={`${model.epiType} — starting patient pool`}
        defaultOpen={!!epiProposal}
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        }
      >
        <EpiAssumptions
          model={model}
          visibleKeys={visibleKeys}
          proposal={epiProposal}
          onProposalConsumed={onEpiProposalConsumed}
        />
      </AssumptionSection>

      {/* Biomarker & Funnel Rates */}
      <AssumptionSection
        title="Biomarker & Funnel Rates"
        subtitle="Period-by-period values for each percentage-based funnel cut"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
          </svg>
        }
      >
        <FunnelCutAssumptions
          model={model}
          visibleKeys={visibleKeys}
          funnelProposal={funnelProposal}
          onProposalConsumed={onFunnelProposalConsumed}
        />
      </AssumptionSection>

      {/* Market Share by Line */}
      <AssumptionSection
        title="Market Share by Line"
        subtitle="Baseline + evented shares per product, LoT and segment"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
          </svg>
        }
      >
        <MarketShareAssumptions model={model} visibleKeys={visibleKeys} />
      </AssumptionSection>

      {/* Persistency — incidence models only */}
      {(model.epiType ?? "Incidence") === "Incidence" && (
        <AssumptionSection
          title="Persistency (Duration of Therapy)"
          subtitle={`Median months on therapy · all products · ${model.linesOfTherapy ?? 1}L × ${model.segments ?? 1} segment${(model.segments??1)>1?"s":""}`}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        >
          <PersistencyAssumptions model={model} visibleKeys={visibleKeys} />
        </AssumptionSection>
      )}

      {/* Operational assumptions */}
      <AssumptionSection
        title="Operational Assumptions"
        subtitle={`Compliance · Access · Abandonment · Vials · Price · GTN${model.enableIRA||model.ira?" · IRA":""}${model.enablePTRS||model.ptrs?" · PTRS":""} · key product only`}
        icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"/><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"/></svg>}
      >
        <OperationalAssumptions model={model} visibleKeys={visibleKeys} />
      </AssumptionSection>
    </div>
  );
}

function AssumptionSection({ title, subtitle, icon, locked, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => !locked && setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left ${locked ? "cursor-default" : "hover:bg-slate-800/40 transition-colors"}`}
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-7 h-7 rounded-lg bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
              {icon}
            </div>
          )}
          <div>
            <p className="text-slate-200 text-sm font-medium flex items-center gap-2">
              {title}
              {locked && <span className="text-slate-600 text-xs font-normal">(coming soon)</span>}
            </p>
            <p className="text-slate-500 text-xs">{subtitle}</p>
          </div>
        </div>
        {!locked && (
          <svg className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>
      {open && <div className="border-t border-slate-800">{children}</div>}
    </div>
  );
}

function PlaceholderTab({ label, description }) {
  return (
    <div className="bg-slate-900 border border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center py-28 gap-4">
      <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-slate-300 font-semibold">{label}</p>
        <p className="text-slate-500 text-sm mt-1 max-w-md">{description}</p>
      </div>
    </div>
  );
}
