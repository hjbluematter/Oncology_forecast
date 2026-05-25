import { useState } from "react";
import { useForecast } from "../store/forecastStore";

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Asset & Indication", short: "Asset" },
  { id: 2, label: "Model Configuration", short: "Config" },
  { id: 3, label: "Epidemiology Funnel", short: "Epi Funnel" },
  { id: 4, label: "Geographies", short: "Geos" },
  { id: 5, label: "Therapy & Segments", short: "LOT & Segments" },
  { id: 6, label: "Patient Flow Routing", short: "Flow Rules" },
  { id: 7, label: "Revenue Adjustments", short: "IRA & PTRS" },
  { id: 8, label: "Review & Create", short: "Review" },
];

const CURRENT_YEAR = 2026;

const DEFAULT_EPI_FACTORS = [
  { id: "f1", label: "Diagnosed Incidence / Prevalence", description: "Starting total patient pool", locked: true, operator: null, value: null },
  { id: "f2", label: "", description: "", operator: "complement", value: "" },
  { id: "f3", label: "", description: "", operator: "complement", value: "" },
  { id: "f4", label: "", description: "", operator: "complement", value: "" },
  { id: "f5", label: "", description: "", operator: "complement", value: "" },
];

const AVAILABLE_EPI_FACTORS = [
  { id: "fa1", label: "Stage Distribution (e.g. Stage III/IV)", description: "Filter by disease stage",               operator: "complement", value: "" },
  { id: "fa2", label: "Performance Status (e.g. ECOG 0-1)",     description: "% with adequate PS for treatment",       operator: "complement", value: "" },
  { id: "fa3", label: "Prior Therapy Rate",                     description: "% who received prior systemic therapy",  operator: "complement", value: "" },
  { id: "fa4", label: "Histology Subtype",                      description: "e.g. Adenocarcinoma, Squamous",          operator: "complement", value: "" },
  { id: "fa5", label: "PDL1 Expression Level",                  description: "e.g. ≥50%, 1-49%, <1%",                 operator: "complement", value: "" },
  { id: "fa6", label: "Mutation Co-occurrence Rate",            description: "e.g. co-occurring STK11, KEAP1",         operator: "complement", value: "" },
  { id: "fa7", label: "Organ Function Eligibility",             description: "% with adequate renal/hepatic function", operator: "complement", value: "" },
  { id: "fa8", label: "Age/Comorbidity Exclusion",              description: "% excluded due to age or comorbidities", operator: "subtract",   value: "" },
];

const FUNNEL_OPERATORS = [
  { id: "complement", symbol: "1−x", label: "Complement", hint: "pool × (1 − value%)", pct: true },
  { id: "multiply",   symbol: "×",   label: "Multiply",   hint: "pool × value%",        pct: true },
  { id: "divide",     symbol: "÷",   label: "Divide",     hint: "pool ÷ value%",         pct: true },
  { id: "add",        symbol: "+",   label: "Add",        hint: "pool + absolute value", pct: false },
  { id: "subtract",   symbol: "−",   label: "Subtract",   hint: "pool − absolute value", pct: false },
];

const GEOGRAPHY_OPTIONS = [
  { id: "US", label: "United States", flag: "🇺🇸", region: "Americas" },
  { id: "Canada", label: "Canada", flag: "🇨🇦", region: "Americas" },
  { id: "Brazil", label: "Brazil", flag: "🇧🇷", region: "Americas" },
  { id: "Mexico", label: "Mexico", flag: "🇲🇽", region: "Americas" },
  { id: "Argentina", label: "Argentina", flag: "🇦🇷", region: "Americas" },
  { id: "Germany", label: "Germany", flag: "🇩🇪", region: "Europe" },
  { id: "France", label: "France", flag: "🇫🇷", region: "Europe" },
  { id: "Italy", label: "Italy", flag: "🇮🇹", region: "Europe" },
  { id: "Spain", label: "Spain", flag: "🇪🇸", region: "Europe" },
  { id: "UK", label: "United Kingdom", flag: "🇬🇧", region: "Europe" },
  { id: "Turkey", label: "Turkey", flag: "🇹🇷", region: "Europe" },
  { id: "Russia", label: "Russia", flag: "🇷🇺", region: "Europe" },
  { id: "China", label: "China", flag: "🇨🇳", region: "Asia-Pacific" },
  { id: "Japan", label: "Japan", flag: "🇯🇵", region: "Asia-Pacific" },
  { id: "India", label: "India", flag: "🇮🇳", region: "Asia-Pacific" },
  { id: "South Korea", label: "South Korea", flag: "🇰🇷", region: "Asia-Pacific" },
  { id: "Australia", label: "Australia", flag: "🇦🇺", region: "Asia-Pacific" },
  { id: "Indonesia", label: "Indonesia", flag: "🇮🇩", region: "Asia-Pacific" },
  { id: "Saudi Arabia", label: "Saudi Arabia", flag: "🇸🇦", region: "Middle East & Africa" },
  { id: "South Africa", label: "South Africa", flag: "🇿🇦", region: "Middle East & Africa" },
];

const GEO_REGIONS = ["Americas", "Europe", "Asia-Pacific", "Middle East & Africa"];
const EU5 = ["Germany", "France", "Italy", "Spain", "UK"];

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function NewModelWizard() {
  const { addModel, saveEditedModel, editingModel, setView } = useForecast();
  const isEditing = !!editingModel;
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    assetName:            editingModel?.assetName            ?? "",
    indication:           editingModel?.indication           ?? "",
    startYear:            editingModel?.startYear            ?? CURRENT_YEAR,
    timelineYears:        editingModel?.timelineYears        ?? 10,
    modelType:            editingModel?.modelType            ?? "Patient Flow",
    epiType:              editingModel?.epiType              ?? "Incidence",
    granularity:          editingModel?.granularity          ?? "Yearly",
    epiFunnel:            editingModel?.epiFunnel            ?? DEFAULT_EPI_FACTORS,
    geographies:          editingModel?.geographies          ?? ["US"],
    showRestOfEurope:     editingModel?.showRestOfEurope     ?? false,
    showRestOfWorld:      editingModel?.showRestOfWorld      ?? false,
    linesOfTherapy:       editingModel?.linesOfTherapy       ?? 3,
    segments:             editingModel?.segments             ?? 2,
    segmentNames:         editingModel?.segmentNames         ?? ["", ""],
    competitors:          editingModel?.competitors          ?? 3,
    competitorNames:      editingModel?.competitorNames      ?? ["", "", ""],
    applyIRA:             editingModel?.applyIRA             ?? false,
    iraYear:              editingModel?.iraYear              ?? 2026,
    iraDiscountRate:      editingModel?.iraDiscountRate      ?? 25,
    iraSmallMolecule:     editingModel?.iraSmallMolecule     ?? true,
    applyPTRS:            editingModel?.applyPTRS            ?? false,
    ptrsValue:            editingModel?.ptrsValue            ?? 85,
    patientFlowRules:     editingModel?.patientFlowRules     ?? {},
  });

  function update(patch) {
    setForm(prev => ({ ...prev, ...patch }));
  }

  function next() {
    setStep(s => {
      const n = s + 1;
      if (n === 6 && form.modelType !== "Patient Flow") return n + 1;
      return Math.min(n, STEPS.length);
    });
  }
  function back() {
    setStep(s => {
      const p = s - 1;
      if (p === 6 && form.modelType !== "Patient Flow") return p - 1;
      return Math.max(p, 1);
    });
  }

  function buildPayload() {
    return {
      assetName:            form.assetName,
      indication:           form.indication,
      modelType:            form.modelType,
      epiType:              form.epiType,
      granularity:          form.granularity,
      startYear:            form.startYear,
      timelineYears:        form.timelineYears,
      epiFunnel:            form.epiFunnel,
      geographies:          form.geographies,
      showRestOfEurope:     form.showRestOfEurope,
      showRestOfWorld:      form.showRestOfWorld,
      linesOfTherapy:       form.linesOfTherapy,
      segments:             form.segments,
      segmentNames:         form.segmentNames,
      competitors:          form.competitors,
      competitorNames:      form.competitorNames,
      applyIRA:             form.applyIRA,
      iraYear:              form.iraYear,
      iraDiscountRate:      form.iraDiscountRate,
      iraSmallMolecule:     form.iraSmallMolecule,
      applyPTRS:            form.applyPTRS,
      ptrsValue:            form.ptrsValue,
      patientFlowRules:     form.patientFlowRules,
    };
  }

  function handleCreate() {
    if (isEditing) {
      saveEditedModel(editingModel.id, buildPayload());
    } else {
      addModel(buildPayload());
    }
  }

  const canProceed = stepIsValid(step, form);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("dashboard")}
              className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back to Dashboard
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-violet-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <span className="text-slate-300 font-medium text-sm">
              {isEditing ? `Edit — ${editingModel.assetName}` : "New Forecast Model"}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 w-full flex-1 flex flex-col">
        {/* Step progress */}
        <StepIndicator steps={STEPS} current={step} isPatientFlow={form.modelType === "Patient Flow"} />

        {/* Step content */}
        <div className="flex-1 mt-10">
          {step === 1 && <StepAsset form={form} update={update} />}
          {step === 2 && <StepConfig form={form} update={update} />}
          {step === 3 && <StepEpiFunnel form={form} update={update} />}
          {step === 4 && <StepGeographies form={form} update={update} />}
          {step === 5 && <StepTherapySegments form={form} update={update} />}
          {step === 6 && <StepPatientFlowRouting form={form} update={update} />}
          {step === 7 && <StepRevenueAdjustments form={form} update={update} />}
          {step === 8 && <StepReview form={form} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-slate-800">
          <button
            onClick={back}
            disabled={step === 1}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Previous
          </button>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-sm">Step {step} of {STEPS.length}</span>
          </div>
          {step < STEPS.length ? (
            <button
              onClick={next}
              disabled={!canProceed}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Continue
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {isEditing ? "Save Changes" : "Create Forecast Model"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ steps, current, isPatientFlow }) {
  return (
    <div className="flex items-center">
      {steps.map((s, i) => {
        const skipped = s.id === 6 && !isPatientFlow;
        return (
        <div key={s.id} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                skipped
                  ? "bg-slate-800/50 text-slate-500 ring-1 ring-dashed ring-slate-600"
                  : s.id < current
                  ? "bg-violet-600 text-white"
                  : s.id === current
                  ? "bg-violet-600 text-white ring-4 ring-violet-600/20"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              {s.id < current ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                s.id
              )}
            </div>
            <span className={`text-xs hidden sm:block ${skipped ? "text-slate-500 line-through" : s.id === current ? "text-violet-300 font-medium" : s.id < current ? "text-slate-400" : "text-slate-400"}`}>
              {s.short}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-4 ${s.id < current ? "bg-violet-600" : "bg-slate-800"}`} />
          )}
        </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Asset & Indication ───────────────────────────────────────────────

function StepAsset({ form, update }) {
  return (
    <StepShell
      title="Asset & Indication"
      description="Start by naming the pipeline asset and the oncology indication you're modeling."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Field label="Asset Name" hint="Internal code name or molecule name (e.g. KRAZinib, HER2-ADC-01)">
          <input
            type="text"
            value={form.assetName}
            onChange={e => update({ assetName: e.target.value })}
            placeholder="e.g. KRAZinib"
            className={inputCls}
          />
        </Field>
        <Field label="Indication" hint="Full indication including tumor type and biomarker (e.g. NSCLC KRAS G12C+)">
          <input
            type="text"
            value={form.indication}
            onChange={e => update({ indication: e.target.value })}
            placeholder="e.g. NSCLC (KRAS G12C+)"
            className={inputCls}
          />
        </Field>
      </div>

      {form.assetName && form.indication && (
        <div className="mt-6 bg-violet-600/10 border border-violet-500/20 rounded-lg p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center text-violet-400 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <p className="text-violet-700 text-sm font-medium">{form.assetName}</p>
            <p className="text-violet-600 text-xs">{form.indication}</p>
          </div>
        </div>
      )}
    </StepShell>
  );
}

// ─── Step 2: Model Configuration ─────────────────────────────────────────────

function StepConfig({ form, update }) {
  const endYear = form.startYear + form.timelineYears - 1;

  return (
    <StepShell
      title="Model Configuration"
      description="Define the model type, epidemiology basis, and forecast time horizon."
    >
      <div className="space-y-8">
        {/* Model type */}
        <div>
          <p className="text-slate-300 text-sm font-medium mb-3">Model Type</p>
          <div className="grid grid-cols-2 gap-4">
            {["Patient Flow", "Patient Segmentation"].map(type => (
              <OptionCard
                key={type}
                selected={form.modelType === type}
                onClick={() => update({ modelType: type })}
                title={type}
                description={
                  type === "Patient Flow"
                    ? "Model patients flowing through LOT waterfall (1L → 2L → 3L+)"
                    : "Model discrete patient sub-populations by biomarker or characteristic"
                }
              />
            ))}
          </div>
        </div>

        {/* Epi type */}
        <div>
          <p className="text-slate-300 text-sm font-medium mb-3">Epidemiology Basis</p>
          <div className="grid grid-cols-2 gap-4">
            {["Incidence", "Prevalence"].map(type => (
              <OptionCard
                key={type}
                selected={form.epiType === type}
                onClick={() => update({ epiType: type })}
                title={type}
                description={
                  type === "Incidence"
                    ? "New cases diagnosed per year — typical for solid tumors"
                    : "Total living patients with diagnosis — typical for chronic/maintained cancers"
                }
              />
            ))}
          </div>
        </div>

        {/* Granularity */}
        <div>
          <p className="text-slate-300 text-sm font-medium mb-3">Model Granularity</p>
          <div className="grid grid-cols-2 gap-4">
            <OptionCard
              selected={form.granularity === "Yearly"}
              onClick={() => update({ granularity: "Yearly" })}
              title="Yearly"
              description="Outputs aggregated by year — lower complexity, faster to build, standard for long-range pipeline forecasts"
            />
            <OptionCard
              selected={form.granularity === "Monthly"}
              onClick={() => update({ granularity: "Monthly" })}
              title="Monthly"
              description="Outputs broken into 12 periods per year — captures launch ramp, LOE dynamics, and seasonal uptake patterns"
            />
          </div>
          {form.granularity === "Monthly" && (
            <div className="mt-3 bg-amber-500/8 border border-amber-500/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-amber-400 text-xs">
                Monthly granularity generates {form.timelineYears * 12} periods. Assumption inputs and scenario runs will be more granular but take longer to configure.
              </p>
            </div>
          )}
        </div>

        {/* Time horizon */}
        <div className="grid grid-cols-2 gap-6">
          <Field label="Model Start Year" hint="Year 1 of the forecast (usually launch year or near-term)">
            <input
              type="number"
              value={form.startYear}
              min={2020}
              max={2040}
              onChange={e => update({ startYear: parseInt(e.target.value) || CURRENT_YEAR })}
              className={inputCls}
            />
          </Field>
          <Field label={`Forecast Horizon — ${form.timelineYears} years (${form.startYear}–${endYear})`} hint="Max 50 years">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={50}
                value={form.timelineYears}
                onChange={e => update({ timelineYears: parseInt(e.target.value) })}
                className="flex-1 accent-violet-500"
              />
              <span className="text-slate-200 font-semibold text-sm w-12 text-right">{form.timelineYears} yrs</span>
            </div>
            <div className="flex justify-between text-slate-500 text-xs mt-1">
              <span>{form.startYear}</span>
              <span>{endYear}</span>
            </div>
          </Field>
        </div>
      </div>
    </StepShell>
  );
}

// ─── Step 3: Epi Funnel ───────────────────────────────────────────────────────

function StepEpiFunnel({ form, update }) {
  const [showPicker, setShowPicker] = useState(false);
  const [editIdx, setEditIdx]       = useState(null);

  // Auto-open edit mode for any step with a blank label
  function effectiveEditIdx(idx, factor) {
    return editIdx === idx || (!factor.locked && !factor.label);
  }

  const usedIds   = new Set(form.epiFunnel.map(f => f.id));
  const available = AVAILABLE_EPI_FACTORS.filter(f => !usedIds.has(f.id));

  function patchFactor(idx, changes) {
    const arr = form.epiFunnel.map((f, i) => i === idx ? { ...f, ...changes } : f);
    update({ epiFunnel: arr });
  }

  function addFactor(factor) {
    update({ epiFunnel: [...form.epiFunnel, { ...factor }] });
  }

  function removeFactor(id) {
    update({ epiFunnel: form.epiFunnel.filter(f => f.id !== id) });
  }

  function moveUp(idx) {
    if (idx <= 1) return;
    const arr = [...form.epiFunnel];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    update({ epiFunnel: arr });
  }

  function moveDown(idx) {
    if (idx === 0 || idx >= form.epiFunnel.length - 1) return;
    const arr = [...form.epiFunnel];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    update({ epiFunnel: arr });
  }

  return (
    <StepShell
      title="Epidemiology Funnel"
      description="Define sequential cuts from your starting epi pool. Set the operator and default rate for each step."
    >
      <div className="space-y-1 mb-5">
        {form.epiFunnel.map((factor, idx) => {
          const op     = FUNNEL_OPERATORS.find(o => o.id === factor.operator);
          const isEdit = effectiveEditIdx(idx, factor);

          return (
            <div key={factor.id} className="group">
              {/* Connector with operator label */}
              {idx > 0 && (
                <div className="flex items-center gap-2 pl-3 py-0.5 select-none">
                  <div className="w-px h-3 bg-slate-800 ml-2.5" />
                  {op && (
                    <span className="text-slate-400 text-xs font-mono">
                      {op.symbol}{" "}
                      {factor.value !== null && factor.value !== ""
                        ? (op.pct ? `${factor.value}%` : Number(factor.value).toLocaleString())
                        : "?"}
                    </span>
                  )}
                </div>
              )}

              {/* Card */}
              <div className={`rounded-xl border transition-colors ${
                factor.locked
                  ? "border-violet-500/25 bg-violet-600/5"
                  : isEdit
                  ? "border-violet-500/40 bg-slate-900"
                  : "border-slate-800 bg-slate-900 hover:border-slate-700"
              }`}>
                {/* Top row: dot + label + reorder/remove */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${idx === 0 ? "bg-violet-500" : "bg-slate-600"}`} />

                  <div className="flex-1 min-w-0">
                    {isEdit ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={factor.label}
                          onChange={e => patchFactor(idx, { label: e.target.value })}
                          placeholder="Step label"
                          className={`${inputCls} text-sm py-1`}
                        />
                        <input
                          type="text"
                          value={factor.description}
                          onChange={e => patchFactor(idx, { description: e.target.value })}
                          placeholder="Short description (optional)"
                          className={`${inputCls} text-xs py-1 text-slate-400`}
                        />
                      </div>
                    ) : (
                      <>
                        <p className={`text-sm font-medium ${factor.locked ? "text-violet-300" : "text-slate-200"}`}>
                          {factor.label}
                        </p>
                        {factor.description && (
                          <p className="text-slate-500 text-xs mt-0.5">{factor.description}</p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {factor.locked ? (
                      <span className="text-violet-500 text-xs px-2">Required</span>
                    ) : (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconBtn
                          onClick={() => setEditIdx(isEdit ? null : idx)}
                          title={isEdit ? "Done" : "Edit label"}
                          className={isEdit ? "bg-violet-600/20 text-violet-400" : ""}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </IconBtn>
                        <IconBtn onClick={() => moveUp(idx)} title="Move up" disabled={idx <= 1}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                          </svg>
                        </IconBtn>
                        <IconBtn onClick={() => moveDown(idx)} title="Move down" disabled={idx >= form.epiFunnel.length - 1}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </IconBtn>
                        <IconBtn onClick={() => removeFactor(factor.id)} title="Remove" className="hover:bg-red-500/20 hover:text-red-400">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </IconBtn>
                      </div>
                    )}
                  </div>
                </div>

                {/* Operator + value row (non-anchor steps) */}
                {!factor.locked && (
                  <div className="border-t border-slate-800 px-4 py-2.5 flex flex-wrap items-center gap-3">
                    <span className="text-slate-400 text-xs shrink-0">Apply as</span>

                    {/* Operator pills */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {FUNNEL_OPERATORS.map(o => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => patchFactor(idx, { operator: o.id })}
                          title={o.hint}
                          className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-all ${
                            factor.operator === o.id
                              ? "bg-violet-600 text-white shadow"
                              : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                          }`}
                        >
                          {o.symbol}
                        </button>
                      ))}
                    </div>

                    {op && <span className="text-slate-400 text-xs hidden sm:block">{op.hint}</span>}

                    <div className="flex-1" />

                    {/* Default value */}
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-slate-500 text-xs whitespace-nowrap">
                        Default {op?.pct ? "%" : "value"}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={factor.value ?? ""}
                          min={0}
                          max={op?.pct ? 100 : undefined}
                          step={op?.pct ? 1 : 100}
                          onChange={e => patchFactor(idx, {
                            value: e.target.value === "" ? "" : parseFloat(e.target.value),
                          })}
                          placeholder="—"
                          className="w-20 bg-slate-950 border border-slate-700 rounded-lg pl-2.5 pr-6 py-1 text-slate-200 text-xs text-right focus:outline-none focus:border-violet-500 transition-colors"
                        />
                        {op?.pct && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">%</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Final output indicator */}
        <div className="pl-3 py-0.5">
          <div className="w-px h-3 bg-slate-800 ml-2.5" />
        </div>
        <div className="flex items-center gap-3 bg-emerald-600/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <div>
            <p className="text-emerald-300 text-sm font-medium">Net New Patient Starts</p>
            <p className="text-emerald-600 text-xs">Output of funnel → fed into LOT waterfall</p>
          </div>
        </div>
      </div>

      {/* Add factor */}
      {available.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPicker(p => !p)}
            className="flex items-center gap-2 text-violet-400 hover:text-violet-300 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Funnel Factor
          </button>

          {showPicker && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {available.map(factor => (
                <button
                  key={factor.id}
                  type="button"
                  onClick={() => { addFactor(factor); setShowPicker(false); }}
                  className="text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl px-3 py-2.5 transition-colors"
                >
                  <p className="text-slate-200 text-sm">{factor.label}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{factor.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </StepShell>
  );
}

// ─── Step 4: Geographies ──────────────────────────────────────────────────────

function StepGeographies({ form, update }) {
  function toggleGeo(id) {
    const current = form.geographies;
    if (current.includes(id)) {
      update({ geographies: current.filter(g => g !== id) });
    } else {
      update({ geographies: [...current, id] });
    }
  }

  function toggleEU5() {
    const hasAll = EU5.every(g => form.geographies.includes(g));
    if (hasAll) {
      update({ geographies: form.geographies.filter(g => !EU5.includes(g)) });
    } else {
      const withEU5 = [...new Set([...form.geographies, ...EU5])];
      update({ geographies: withEU5 });
    }
  }

  const eu5Selected = EU5.every(g => form.geographies.includes(g));

  return (
    <StepShell
      title="Geographies"
      description="Select the countries to include as explicit forecast geographies. Rest of Europe and Rest of World can be added as aggregate roll-up columns."
    >
      <div className="space-y-6">
        {/* Quick select EU5 */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleEU5}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              eu5Selected
                ? "bg-violet-600/20 border-violet-500/40 text-violet-700"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
            }`}
          >
            {eu5Selected ? "✓ EU5 selected" : "Quick-select EU5"}
          </button>
          <span className="text-slate-500 text-xs">Germany, France, Italy, Spain, UK</span>
        </div>

        {/* Geography grid grouped by region */}
        <div className="space-y-5">
          {GEO_REGIONS.map(region => {
            const geos = GEOGRAPHY_OPTIONS.filter(g => g.region === region);
            const allSelected = geos.every(g => form.geographies.includes(g.id));
            return (
              <div key={region}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-slate-500 text-xs uppercase tracking-wider">{region}</p>
                  <button
                    onClick={() => {
                      if (allSelected) {
                        update({ geographies: form.geographies.filter(g => !geos.map(x => x.id).includes(g)) });
                      } else {
                        update({ geographies: [...new Set([...form.geographies, ...geos.map(x => x.id)])] });
                      }
                    }}
                    className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {geos.map(geo => (
                    <button
                      key={geo.id}
                      onClick={() => toggleGeo(geo.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                        form.geographies.includes(geo.id)
                          ? "bg-violet-600/15 border-violet-500/40 text-violet-700"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <span>{geo.flag}</span>
                      <span className="truncate text-xs">{geo.label}</span>
                      {form.geographies.includes(geo.id) && (
                        <svg className="w-3 h-3 ml-auto shrink-0 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected count */}
        {form.geographies.length > 0 && (
          <p className="text-slate-400 text-sm">{form.geographies.length} {form.geographies.length === 1 ? "geography" : "geographies"} selected</p>
        )}

        {/* Aggregate roll-ups */}
        <div>
          <p className="text-slate-300 text-sm font-medium mb-3">Aggregate Roll-ups</p>
          <p className="text-slate-500 text-xs mb-4">These are not modeled as separate countries — they appear as aggregate columns in your output to capture remaining market potential.</p>
          <div className="space-y-3">
            {[
              { key: "showRestOfEurope", label: "Include Rest of Europe", description: "Aggregated EU ex-selected countries" },
              { key: "showRestOfWorld", label: "Include Rest of World", description: "All markets outside selected geographies and RoE" },
            ].map(opt => (
              <div
                key={opt.key}
                onClick={() => update({ [opt.key]: !form[opt.key] })}
                className="flex items-start gap-3 cursor-pointer group"
              >
                <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  form[opt.key] ? "bg-violet-600 border-violet-600" : "border-slate-600 group-hover:border-slate-500"
                }`}>
                  {form[opt.key] && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-slate-300 text-sm">{opt.label}</p>
                  <p className="text-slate-500 text-xs">{opt.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </StepShell>
  );
}

// ─── Step 5: LOT & Segments ───────────────────────────────────────────────────

function StepTherapySegments({ form, update }) {
  function setSegmentName(idx, name) {
    const arr = [...form.segmentNames];
    arr[idx] = name;
    update({ segmentNames: arr });
  }

  function updateSegmentCount(n) {
    const count = Math.max(1, Math.min(10, n));
    const names = Array.from({ length: count }, (_, i) => form.segmentNames[i] ?? "");
    update({ segments: count, segmentNames: names });
  }

  function updateCompetitorCount(n) {
    const count = Math.max(1, Math.min(20, n));
    const names = Array.from({ length: count }, (_, i) => form.competitorNames[i] ?? "");
    update({ competitors: count, competitorNames: names });
  }

  function setCompetitorName(idx, name) {
    const arr = [...form.competitorNames];
    arr[idx] = name;
    update({ competitorNames: arr });
  }

  const lotLabels = ["1L", "2L", "3L", "4L", "5L", "6L+"];

  return (
    <StepShell
      title="Lines of Therapy & Patient Segments"
      description="Configure the LOT waterfall depth and any patient sub-populations modeled separately."
    >
      <div className="space-y-8">
        {/* LOT */}
        <div>
          <p className="text-slate-300 text-sm font-medium mb-4">Lines of Therapy</p>
          <div className="flex items-center gap-3 mb-4">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => update({ linesOfTherapy: n })}
                className={`w-12 h-12 rounded-lg border text-sm font-semibold transition-all ${
                  form.linesOfTherapy === n
                    ? "bg-violet-600 border-violet-500 text-white"
                    : n <= form.linesOfTherapy
                    ? "bg-violet-600/10 border-violet-500/30 text-violet-300"
                    : "bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600"
                }`}
              >
                {lotLabels[n - 1]}
              </button>
            ))}
          </div>

          {/* LOT waterfall preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-1">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-3">Waterfall Preview</p>
            {Array.from({ length: form.linesOfTherapy }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-slate-500 text-xs w-4">{i + 1}.</span>
                <div
                  className="h-6 bg-violet-600/20 border border-violet-500/20 rounded flex items-center px-3 transition-all"
                  style={{ width: `${Math.max(20, 100 - i * 18)}%` }}
                >
                  <span className="text-violet-300 text-xs font-medium">{lotLabels[i]}</span>
                </div>
                {i < form.linesOfTherapy - 1 && (
                  <svg className="w-3 h-3 text-slate-400 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                )}
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-slate-800">
              <p className="text-slate-500 text-xs">Patients progress through waterfall; re-treatment modeled at later lines</p>
            </div>
          </div>
        </div>

        {/* Segments */}
        <div>
          <p className="text-slate-300 text-sm font-medium mb-1">Patient Segments</p>
          <p className="text-slate-500 text-xs mb-4">Distinct sub-populations modeled separately (e.g. by biomarker expression level, histology, or prior therapy status)</p>
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => updateSegmentCount(form.segments - 1)} disabled={form.segments <= 1}
              className="w-8 h-8 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" /></svg>
            </button>
            <span className="text-slate-100 font-semibold text-xl w-8 text-center">{form.segments}</span>
            <button onClick={() => updateSegmentCount(form.segments + 1)} disabled={form.segments >= 10}
              className="w-8 h-8 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </button>
            <span className="text-slate-500 text-sm">{form.segments === 1 ? "segment" : "segments"}</span>
          </div>

          <div className="space-y-2 mb-8">
            {Array.from({ length: form.segments }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-slate-400 text-xs w-20 shrink-0">Segment {i + 1}</span>
                <input
                  type="text"
                  value={form.segmentNames[i] ?? ""}
                  onChange={e => setSegmentName(i, e.target.value)}
                  placeholder="e.g. Biomarker+, 1L-naive, ECOG 0-1…"
                  className={`${inputCls} flex-1`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Competitors — single count + names, shared across all segments & LOTs */}
        <div>
          <p className="text-slate-300 text-sm font-medium mb-1">Competitors</p>
          <p className="text-slate-500 text-xs mb-4">Same competitor set applies across all segments and lines of therapy</p>
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => updateCompetitorCount(form.competitors - 1)} disabled={form.competitors <= 1}
              className="w-8 h-8 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" /></svg>
            </button>
            <span className="text-slate-100 font-semibold text-xl w-8 text-center">{form.competitors}</span>
            <button onClick={() => updateCompetitorCount(form.competitors + 1)} disabled={form.competitors >= 20}
              className="w-8 h-8 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </button>
            <span className="text-slate-500 text-sm">{form.competitors === 1 ? "competitor" : "competitors"}</span>
          </div>

          <div className="space-y-2">
            {Array.from({ length: form.competitors }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-slate-400 text-xs w-20 shrink-0">Competitor {i + 1}</span>
                <input
                  type="text"
                  value={form.competitorNames[i] ?? ""}
                  onChange={e => setCompetitorName(i, e.target.value)}
                  placeholder="e.g. Keytruda, Tagrisso, SOC…"
                  className={`${inputCls} flex-1`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </StepShell>
  );
}

// ─── Step 6: Patient Flow Routing Rules ──────────────────────────────────────

function StepPatientFlowRouting({ form, update }) {
  const LOT_LABELS = ["1L", "2L", "3L", "4L", "5L", "6L+"];

  const segments = Array.from({ length: form.segments }, (_, i) =>
    form.segmentNames[i]?.trim() || `Segment ${i + 1}`
  );

  const products = [
    form.assetName?.trim() || "Key Product",
    ...Array.from({ length: form.competitors }, (_, i) =>
      form.competitorNames[i]?.trim() || `Competitor ${String.fromCharCode(88 + i)}`
    ),
  ];

  // Lines 2L and beyond — each line has a matrix showing routing into that line
  const routingLines = Array.from(
    { length: form.linesOfTherapy - 1 },
    (_, i) => ({ intoLine: LOT_LABELS[i + 1], fromLine: LOT_LABELS[i] })
  );

  function getRule(line, segment, product) {
    return form.patientFlowRules?.[line]?.[segment]?.[product] ?? "";
  }

  function setRule(line, segment, product, targetSegment) {
    const rules = { ...(form.patientFlowRules ?? {}) };
    if (!rules[line]) rules[line] = {};
    if (!rules[line][segment]) rules[line][segment] = {};
    rules[line][segment] = { ...rules[line][segment], [product]: targetSegment };
    update({ patientFlowRules: rules });
  }

  if (form.linesOfTherapy < 2) {
    return (
      <StepShell
        title="Patient Flow Routing Rules"
        description="Configure which segment patients flow into at each subsequent line."
      >
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-slate-400 text-sm">No routing rules needed — model has only 1 line of therapy.</p>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell
      title="Patient Flow Routing Rules"
      description="For each subsequent line, define which segment a patient enters based on their prior segment and the product they received."
    >
      <div className="space-y-10">
        {routingLines.map(({ intoLine, fromLine }) => (
          <div key={intoLine}>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-7 h-7 rounded-lg bg-violet-600/20 flex items-center justify-center shrink-0">
                <span className="text-violet-300 text-xs font-bold">{intoLine}</span>
              </div>
              <p className="text-slate-200 text-sm font-semibold">Routing into {intoLine}</p>
            </div>
            <p className="text-slate-500 text-xs mb-4 pl-10">
              Patient was in <span className="text-slate-400">{fromLine}</span> — select which segment they enter at {intoLine} based on their prior segment and product used.
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-slate-500 text-xs font-medium px-4 py-2.5 bg-slate-900 border-b border-r border-slate-800 whitespace-nowrap">
                      Prior Segment
                    </th>
                    {products.map((product, pIdx) => (
                      <th
                        key={pIdx}
                        className="text-center text-slate-400 text-xs font-medium px-3 py-2.5 bg-slate-900 border-b border-r last:border-r-0 border-slate-800 min-w-[140px]"
                      >
                        {product}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {segments.map((segment, sIdx) => (
                    <tr key={sIdx} className="group">
                      <td className="text-slate-300 text-xs font-medium px-4 py-2 bg-slate-900/60 border-b border-r border-slate-800 whitespace-nowrap last-row:border-b-0">
                        {segment}
                      </td>
                      {products.map((product, pIdx) => (
                        <td key={pIdx} className="px-2 py-1.5 border-b border-r last:border-r-0 border-slate-800 bg-slate-950">
                          <select
                            value={getRule(intoLine, segment, product)}
                            onChange={e => setRule(intoLine, segment, product, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-violet-500 transition-colors appearance-none cursor-pointer"
                          >
                            <option value="">— select —</option>
                            {segments.map((seg, i) => (
                              <option key={i} value={seg}>{seg}</option>
                            ))}
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-3 text-slate-500 text-xs">
          Rules can be updated later in the model assumptions. Cells left blank will default to the patient staying in their current segment.
        </div>
      </div>
    </StepShell>
  );
}

// ─── Step 7: Revenue Adjustments (IRA & PTRS) ────────────────────────────────

function StepRevenueAdjustments({ form, update }) {
  return (
    <StepShell
      title="Revenue Adjustments"
      description="Optionally apply IRA price negotiation impact and probability of regulatory success to calculate risk-adjusted revenue."
    >
      <div className="space-y-8">

        {/* IRA */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div
            onClick={() => update({ applyIRA: !form.applyIRA })}
            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${form.applyIRA ? "bg-amber-500/15 text-amber-400" : "bg-slate-800 text-slate-500"}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                </svg>
              </div>
              <div>
                <p className="text-slate-200 text-sm font-medium">Apply IRA Price Negotiation</p>
                <p className="text-slate-500 text-xs">Model Inflation Reduction Act mandatory price negotiation impact on US revenue</p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${form.applyIRA ? "bg-amber-500" : "bg-slate-700"}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.applyIRA ? "left-5" : "left-0.5"}`} />
            </div>
          </div>

          {form.applyIRA && (
            <div className="px-5 pb-5 pt-1 border-t border-slate-800 space-y-5">
              {/* Molecule type */}
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Molecule Type</p>
                <div className="flex gap-3">
                  {[
                    { val: true, label: "Small Molecule", desc: "Eligible after 9 years post-approval" },
                    { val: false, label: "Biologic", desc: "Eligible after 13 years post-approval" },
                  ].map(opt => (
                    <button
                      key={String(opt.val)}
                      onClick={() => update({ iraSmallMolecule: opt.val })}
                      className={`flex-1 text-left p-3 rounded-lg border text-sm transition-all ${
                        form.iraSmallMolecule === opt.val
                          ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      <p className="font-medium">{opt.label}</p>
                      <p className={`text-xs mt-0.5 ${form.iraSmallMolecule === opt.val ? "text-amber-500" : "text-slate-500"}`}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Negotiation start year */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Negotiation Start Year</p>
                  <input
                    type="number"
                    min={2026}
                    max={2040}
                    value={form.iraYear}
                    onChange={e => update({ iraYear: parseInt(e.target.value) || 2026 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                  <p className="text-slate-400 text-xs mt-1">Year IRA negotiated price takes effect</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">
                    Price Discount — <span className="text-amber-400">{form.iraDiscountRate}%</span>
                  </p>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={form.iraDiscountRate}
                    onChange={e => update({ iraDiscountRate: parseInt(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-slate-400 text-xs mt-1">
                    <span>1%</span><span>60%</span>
                  </div>
                </div>
              </div>

              {/* Info banner */}
              <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-4 py-3 text-amber-400 text-xs">
                IRA impact applies to US revenue only. From {form.iraYear} onward, net price is reduced by {form.iraDiscountRate}% in the model. Historical CMS negotiated discounts have ranged from 38–79% for initial cohort drugs.
              </div>
            </div>
          )}
        </div>

        {/* PTRS */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div
            onClick={() => update({ applyPTRS: !form.applyPTRS })}
            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${form.applyPTRS ? "bg-violet-500/15 text-violet-400" : "bg-slate-800 text-slate-500"}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-slate-200 text-sm font-medium">Apply PTRS (Probability to Regulatory Success)</p>
                <p className="text-slate-500 text-xs">Risk-adjust forecast revenue by the probability the asset achieves regulatory approval</p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${form.applyPTRS ? "bg-violet-600" : "bg-slate-700"}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.applyPTRS ? "left-5" : "left-0.5"}`} />
            </div>
          </div>

          {form.applyPTRS && (
            <div className="px-5 pb-5 pt-1 border-t border-slate-800 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-slate-400 text-xs uppercase tracking-wider">PTRS Value</p>
                  <span className="text-violet-300 font-semibold text-lg">{form.ptrsValue}%</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={99}
                  value={form.ptrsValue}
                  onChange={e => update({ ptrsValue: parseInt(e.target.value) })}
                  className="w-full accent-violet-500"
                />
                <div className="flex justify-between text-slate-400 text-xs mt-1">
                  <span>1% (very early)</span><span>99% (near-certain)</span>
                </div>
              </div>

              {/* Benchmark bands */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { phase: "Phase 1", range: "8–15%", color: "text-red-400 bg-red-500/10 border-red-500/20" },
                  { phase: "Phase 2", range: "25–40%", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
                  { phase: "Phase 3", range: "55–75%", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
                  { phase: "NDA/BLA", range: "85–95%", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                ].map(b => (
                  <button
                    key={b.phase}
                    onClick={() => {
                      const mid = parseInt(b.range.split("–")[0]) + Math.round((parseInt(b.range.split("–")[1]) - parseInt(b.range.split("–")[0])) / 2);
                      update({ ptrsValue: mid });
                    }}
                    className={`rounded-lg border px-2 py-2 text-center transition-colors hover:opacity-80 ${b.color}`}
                  >
                    <p className="text-xs font-medium">{b.phase}</p>
                    <p className="text-xs opacity-70 mt-0.5">{b.range}</p>
                  </button>
                ))}
              </div>

              <div className="bg-violet-500/5 border border-violet-500/15 rounded-lg px-4 py-3 text-violet-500 text-xs">
                All forecast revenue will be multiplied by {form.ptrsValue / 100}×. This produces a risk-adjusted (expected value) view. Unadjusted revenue remains available as a toggle in the forecast workspace.
              </div>
            </div>
          )}
        </div>

        {!form.applyIRA && !form.applyPTRS && (
          <p className="text-slate-500 text-sm text-center py-4">
            Both adjustments are optional. You can also configure these after the model is created.
          </p>
        )}
      </div>
    </StepShell>
  );
}

// ─── Step 8: Review ───────────────────────────────────────────────────────────

function StepReview({ form }) {
  const endYear = form.startYear + form.timelineYears - 1;

  const sections = [
    {
      title: "Asset & Indication",
      items: [
        { label: "Asset Name", value: form.assetName },
        { label: "Indication", value: form.indication },
      ],
    },
    {
      title: "Model Configuration",
      items: [
        { label: "Model Type", value: form.modelType },
        { label: "Epi Basis", value: form.epiType },
        { label: "Granularity", value: `${form.granularity} (${form.granularity === "Monthly" ? form.timelineYears * 12 + " periods" : form.timelineYears + " periods"})` },
        { label: "Forecast Period", value: `${form.startYear} – ${endYear} (${form.timelineYears} years)` },
      ],
    },
    {
      title: "Epidemiology Funnel",
      items: form.epiFunnel.map((f, i) => {
        const op = FUNNEL_OPERATORS.find(o => o.id === f.operator);
        const suffix = op && f.value !== null && f.value !== ""
          ? ` (${op.symbol} ${op.pct ? f.value + "%" : Number(f.value).toLocaleString()})`
          : "";
        return { label: `Step ${i + 1}`, value: (f.label || "—") + suffix };
      }),
    },
    {
      title: "Geographies",
      items: [
        { label: "Explicit Markets", value: form.geographies.join(", ") || "None selected" },
        { label: "Rest of Europe", value: form.showRestOfEurope ? "Included" : "Excluded" },
        { label: "Rest of World", value: form.showRestOfWorld ? "Included" : "Excluded" },
      ],
    },
    {
      title: "Therapy & Segments",
      items: [
        { label: "Lines of Therapy", value: `${form.linesOfTherapy}L` },
        {
          label: "Patient Segments",
          value: Array.from({ length: form.segments }, (_, i) =>
            form.segmentNames?.[i] ? `${i + 1}. ${form.segmentNames[i]}` : `Segment ${i + 1}`
          ).join(" · "),
        },
        {
          label: "Competitors",
          value: form.competitors + (
            form.competitorNames?.some(n => n)
              ? ` — ${form.competitorNames.filter(n => n).join(", ")}`
              : ""
          ),
        },
      ],
    },
    ...(form.modelType === "Patient Flow" && form.linesOfTherapy >= 2 ? [{
      title: "Patient Flow Routing",
      items: (() => {
        const LOT_LABELS = ["1L", "2L", "3L", "4L", "5L", "6L+"];
        const segments = Array.from({ length: form.segments }, (_, i) =>
          form.segmentNames[i]?.trim() || `Segment ${i + 1}`
        );
        const products = [
          form.assetName?.trim() || "Key Product",
          ...Array.from({ length: form.competitors }, (_, i) =>
            form.competitorNames[i]?.trim() || `Competitor ${String.fromCharCode(88 + i)}`
          ),
        ];
        const lines = Array.from({ length: form.linesOfTherapy - 1 }, (_, i) => LOT_LABELS[i + 1]);
        const totalCells = lines.length * segments.length * products.length;
        const filledCells = lines.reduce((acc, line) => {
          return acc + segments.reduce((a2, seg) => {
            return a2 + products.filter(p => form.patientFlowRules?.[line]?.[seg]?.[p]).length;
          }, 0);
        }, 0);
        return [{ label: "Routing matrices", value: `${lines.length} (${LOT_LABELS[1]}–${LOT_LABELS[form.linesOfTherapy - 1]})` },
                { label: "Rules configured", value: `${filledCells} / ${totalCells} cells filled` }];
      })(),
    }] : []),
    {
      title: "Revenue Adjustments",
      items: [
        {
          label: "IRA Price Negotiation",
          value: form.applyIRA
            ? `Applied — ${form.iraDiscountRate}% discount from ${form.iraYear} (${form.iraSmallMolecule ? "Small Molecule" : "Biologic"})`
            : "Not applied",
        },
        {
          label: "PTRS",
          value: form.applyPTRS ? `${form.ptrsValue}% probability of regulatory success` : "Not applied",
        },
      ],
    },
  ];

  return (
    <StepShell
      title="Review Your Configuration"
      description="Confirm all settings before creating the model. You can always edit these later."
    >
      <div className="space-y-5">
        {sections.map(section => (
          <div key={section.title} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/50">
              <p className="text-slate-300 text-sm font-medium">{section.title}</p>
            </div>
            <div className="divide-y divide-slate-800">
              {section.items.map(item => (
                <div key={item.label} className="px-5 py-3 flex items-start justify-between gap-4">
                  <span className="text-slate-500 text-sm">{item.label}</span>
                  <span className="text-slate-200 text-sm text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-emerald-300 text-sm font-medium">Ready to create</p>
            <p className="text-emerald-600 text-xs mt-0.5">
              The model scaffold will be generated. You'll then configure assumption values, run scenarios, and build out the full forecast.
            </p>
          </div>
        </div>
      </div>
    </StepShell>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function StepShell({ title, description, children }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold text-slate-100 mb-1">{title}</h2>
      <p className="text-slate-400 text-sm mb-8">{description}</p>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-slate-300 text-sm font-medium mb-1.5">{label}</label>
      {hint && <p className="text-slate-500 text-xs mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function OptionCard({ title, description, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-xl border transition-all ${
        selected
          ? "bg-violet-600/15 border-violet-500/50 ring-1 ring-violet-500/30"
          : "bg-slate-900 border-slate-800 hover:border-slate-700"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-200 text-sm font-medium">{title}</span>
        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected ? "border-violet-500 bg-violet-500" : "border-slate-600"}`}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </div>
      <p className="text-slate-500 text-xs leading-relaxed">{description}</p>
    </button>
  );
}

function IconBtn({ onClick, title, disabled, className = "", children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

const inputCls =
  "w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-colors";

// ─── Validation ───────────────────────────────────────────────────────────────

function stepIsValid(step, form) {
  if (step === 1) return form.assetName.trim() !== "" && form.indication.trim() !== "";
  if (step === 4) return form.geographies.length > 0;
  return true;
}

// effective total steps accounting for the skipped Patient Flow Routing step
function totalSteps(form) {
  return form.modelType === "Patient Flow" ? STEPS.length : STEPS.length - 1;
}
