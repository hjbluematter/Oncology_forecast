import { useState, useEffect, useCallback } from "react";
import { useForecast } from "../store/forecastStore";
import EpiAssumptions from "./assumptions/EpiAssumptions";
import FunnelCutAssumptions from "./assumptions/FunnelCutAssumptions";
import MarketShareAssumptions from "./assumptions/MarketShareAssumptions";
import PersistencyAssumptions from "./assumptions/PersistencyAssumptions";
import ProgressionAssumptions from "./assumptions/ProgressionAssumptions";
import OperationalAssumptions from "./assumptions/OperationalAssumptions";
import InputSharingAssumptions from "./assumptions/InputSharingAssumptions";
import RoeRowAssumptions from "./assumptions/RoeRowAssumptions";
import { buildCombos, ComboFilter, filterCombos } from "./assumptions/shared";
import ForecastOutput from "./ForecastOutput";
import ScenarioManager from "./ScenarioManager";
import AiChat from "./AiChat";
import ResearchTab from "./ResearchTab";

const API = "http://localhost:3001/api";

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

  // Cloud save state
  const [cloudStatus, setCloudStatus] = useState(null); // null | "connected" | "error"
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudMsg, setCloudMsg] = useState(null);

  // Check cloud connectivity once on mount
  useEffect(() => {
    fetch(`${API}/cloud/status`)
      .then(r => r.json())
      .then(s => setCloudStatus(s.state === "connected" ? "connected" : "error"))
      .catch(() => setCloudStatus("error"));
  }, []);

  const handleCloudSave = useCallback(async () => {
    setCloudSaving(true);
    setCloudMsg(null);
    try {
      const res = await fetch(`${API}/cloud/save/${activeModel.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: activeModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setCloudStatus("connected");
      setCloudMsg({ type: "success", text: `Saved to cloud · ${new Date(data.cloudSavedAt).toLocaleTimeString()}` });
    } catch (e) {
      setCloudMsg({ type: "error", text: e.message });
    } finally {
      setCloudSaving(false);
    }
  }, [activeModel]);

  async function handleSourcesSaved(sessionData) {
    // sessionData may be a plain rows array (legacy) or a full session object {rows, derivation, population_by_year, ...}
    const newSession = Array.isArray(sessionData)
      ? { pulledAt: new Date().toISOString(), rows: sessionData }
      : { pulledAt: new Date().toISOString(), ...sessionData };
    const epiSources = [...(activeModel.epiSources ?? []), newSession];
    await fetch(`${API}/models/${activeModel.id}`, {
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
            {/* Cloud save */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                cloudStatus === "connected" ? "bg-emerald-400" :
                cloudStatus === "error" ? "bg-red-400" : "bg-slate-600"
              }`} title={cloudStatus ?? "checking…"} />
              <button
                onClick={handleCloudSave}
                disabled={cloudSaving || cloudStatus !== "connected"}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {cloudSaving
                  ? <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5v-9m0 0l-3.75 3.75M12 7.5l3.75 3.75M3 15a4.5 4.5 0 004.5 4.5h9A4.5 4.5 0 0021 15" /></svg>
                }
                Save to Cloud
              </button>
              {cloudMsg && (
                <span className={`text-xs ${cloudMsg.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                  {cloudMsg.text}
                </span>
              )}
            </div>
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
        {activeTab === "forecast" && <ForecastOutput model={activeModel} />}
        {activeTab === "research" && (
          <ResearchTab
            model={activeModel}
            onModelUpdate={(patch) => updateModel(activeModel.id, patch)}
          />
        )}
        {activeTab === "scenarios" && <ScenarioManager model={activeModel} />}
      </main>

      {/* AI Chat — available on all tabs */}
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
        onScenarioSaved={(scenarioObj) => {
          // AI-created scenario: add to the scenarios array used by ScenarioManager
          const existing = Array.isArray(activeModel.scenarios) ? activeModel.scenarios : [];
          const updated = [...existing, scenarioObj];
          updateModel(activeModel.id, { scenarios: updated });
        }}
      />
    </div>
  );
}

// ─── Sharing tab ──────────────────────────────────────────────────────────────

function SharingTab({ model }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <InputSharingAssumptions model={model} />
    </div>
  );
}

// ─── Assumptions tab ──────────────────────────────────────────────────────────

function AssumptionsTab({ model, epiProposal, onEpiProposalConsumed, funnelProposal, onFunnelProposalConsumed }) {
  const allCombos = buildCombos(model);
  const [filterState, setFilterState] = useState(null);
  const visibleKeys = filterState
    ? filterCombos(allCombos, filterState)
    : new Set(allCombos.map(c => c.key));

  return (
    <div className="space-y-6">
      <ComboFilter combos={allCombos} onChange={setFilterState} />

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

      {(model.epiType ?? "Incidence") === "Incidence" && (
        <AssumptionSection
          title="Persistency (Duration of Therapy)"
          subtitle={`Median months on therapy · all products · ${model.linesOfTherapy ?? 1}L × ${model.segments ?? 1} segment${(model.segments??1)>1?"s":""}`}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        >
          <PersistencyAssumptions model={model} visibleKeys={visibleKeys} />
        </AssumptionSection>
      )}

      {model.modelType === "Patient Flow" && (model.linesOfTherapy ?? 1) > 1 && (
        <AssumptionSection
          title="Progression Rates"
          subtitle={`% of patients progressing to next line · ${
            Array.from({ length: (model.linesOfTherapy ?? 1) - 1 }, (_, i) => `${i + 1}L→${i + 2}L`).join(", ")
          } · ${model.segments ?? 1} segment${(model.segments ?? 1) > 1 ? "s" : ""}`}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
            </svg>
          }
        >
          <ProgressionAssumptions model={model} visibleKeys={visibleKeys} />
        </AssumptionSection>
      )}

      <AssumptionSection
        title="Operational Assumptions"
        subtitle={`Compliance · Access · Abandonment · Vials · Price · GTN${model.applyIRA?" · IRA":""}${model.applyPTRS?" · PTRS":""} · key product only`}
        icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"/><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"/></svg>}
      >
        <OperationalAssumptions model={model} visibleKeys={visibleKeys} />
      </AssumptionSection>

      {(model.showRestOfEurope || model.showRestOfWorld) && (
        <AssumptionSection
          title="Rest of Europe & Rest of World Scaling"
          subtitle="NPS and revenue multipliers applied to EU5 (RoE) and US (RoW)"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          }
        >
          <RoeRowAssumptions model={model} />
        </AssumptionSection>
      )}
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
              {locked && <span className="text-slate-500 text-xs font-normal">(coming soon)</span>}
            </p>
            <p className="text-slate-300 text-xs">{subtitle}</p>
          </div>
        </div>
        {!locked && (
          <svg className={`w-4 h-4 text-slate-300 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>
      {open && <div className="border-t border-slate-800">{children}</div>}
    </div>
  );
}
