import { useState, useEffect } from "react";
import { useForecast } from "../../store/forecastStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// ─── Saved portfolio card ─────────────────────────────────────────────────────

function SavedPortfolioCard({ portfolio, onLoad, onDelete, onRename }) {
  const [renaming, setRenaming]   = useState(false);
  const [nameInput, setNameInput] = useState(portfolio.name);
  const [deleting, setDeleting]   = useState(false);

  const commitRename = async () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== portfolio.name) await onRename(portfolio.id, trimmed);
    setRenaming(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter")  commitRename();
    if (e.key === "Escape") { setNameInput(portfolio.name); setRenaming(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(portfolio.id); }
    finally { setDeleting(false); }
  };

  const modelCount = portfolio.modelIds?.length ?? 0;
  const modelNames = portfolio.modelNames?.join(", ") ?? "";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 hover:border-violet-500/40 transition-all">
      {/* Name row */}
      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-slate-800 border border-violet-500/60 rounded-md px-2 py-1 text-sm text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        ) : (
          <button
            onClick={() => setRenaming(true)}
            className="flex-1 text-left text-sm font-semibold text-slate-100 hover:text-violet-400 transition-colors truncate"
            title="Click to rename"
          >
            {portfolio.name}
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors p-1 rounded disabled:opacity-50"
          title="Delete"
        >
          {deleting ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          )}
        </button>
      </div>

      {/* Meta info */}
      <div className="text-xs text-slate-500 space-y-0.5">
        <div className="text-slate-400">
          {modelCount} model{modelCount !== 1 ? "s" : ""}
          {modelNames ? <span className="text-slate-600 ml-1">· {modelNames}</span> : ""}
        </div>
        <div>{portfolio.startYear} – {portfolio.endYear} · <span className="capitalize">{portfolio.granularity ?? "yearly"}</span></div>
        {portfolio.updatedAt && (
          <div>Saved {new Date(portfolio.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
        )}
      </div>

      {/* Open button */}
      <button
        onClick={() => onLoad(portfolio)}
        className="mt-auto w-full flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
      >
        Open View
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}

// ─── Main selector page ───────────────────────────────────────────────────────

export default function ModelSelector() {
  const { models, setView, setPortfolioConfig } = useForecast();
  const [savedPortfolios, setSavedPortfolios]     = useState([]);
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 16 }, (_, i) => currentYear - 2 + i);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [startYear,   setStartYear]   = useState(String(currentYear));
  const [endYear,     setEndYear]     = useState(String(currentYear + 9));

  useEffect(() => {
    fetch(`${API}/portfolios`)
      .then((r) => r.json())
      .then((data) => { setSavedPortfolios(Array.isArray(data) ? data : []); setLoadingPortfolios(false); })
      .catch(() => setLoadingPortfolios(false));
  }, []);

  const toggleModel = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(models.map((m) => m.id)));
  const clearAll  = () => setSelectedIds(new Set());

  const handleProceed = () => {
    setPortfolioConfig({
      modelIds:  Array.from(selectedIds),
      startYear: parseInt(startYear),
      endYear:   parseInt(endYear),
    });
    setView("portfolio");
  };

  const handleLoadPortfolio = (portfolio) => {
    setPortfolioConfig({
      modelIds:  portfolio.modelIds,
      startYear: portfolio.startYear,
      endYear:   portfolio.endYear,
      initialViewState: {
        activeFilters: {
          assets:      new Set(portfolio.activeFilters?.assets      ?? []),
          indications: new Set(portfolio.activeFilters?.indications ?? []),
          lines:       new Set(portfolio.activeFilters?.lines       ?? []),
          geographies: new Set(portfolio.activeFilters?.geographies ?? []),
        },
        primaryDim:   portfolio.primaryDim   ?? "total",
        secondaryDim: portfolio.secondaryDim ?? "none",
        granularity:  portfolio.granularity  ?? "yearly",
        revenueType:  portfolio.revenueType  ?? "adjusted",
      },
    });
    setView("portfolio");
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API}/portfolios/${id}`, { method: "DELETE" });
      setSavedPortfolios((prev) => prev.filter((p) => p.id !== id));
    } catch (e) { console.error("Delete portfolio failed", e); }
  };

  const handleRename = async (id, name) => {
    try {
      const res = await fetch(`${API}/portfolios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const updated = await res.json();
      setSavedPortfolios((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    } catch (e) { console.error("Rename portfolio failed", e); }
  };

  const canProceed = selectedIds.size > 0 && parseInt(endYear) > parseInt(startYear);
  const selectedModels = models.filter((m) => selectedIds.has(m.id));

  return (
    <div className="min-h-screen bg-slate-950">

      {/* ── Header ── */}
      <header className="bm-header border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <button onClick={() => setView("dashboard")} className="text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors">
              OncoCast
            </button>
            <svg className="w-3 h-3 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-slate-200 text-sm font-semibold">Portfolio Aggregation</span>
          </div>

          <button
            onClick={handleProceed}
            disabled={!canProceed}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            New Portfolio View
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">

        {/* ── Saved portfolio views ── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-slate-100 font-semibold text-lg">Saved Portfolio Views</h2>
              <p className="text-slate-500 text-sm mt-0.5">Load a previously configured view to pick up where you left off.</p>
            </div>
            {loadingPortfolios && (
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {!loadingPortfolios && savedPortfolios.length === 0 ? (
            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl py-10 text-center">
              <svg className="w-8 h-8 text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
              </svg>
              <p className="text-slate-500 text-sm">No saved portfolios yet.</p>
              <p className="text-slate-700 text-xs mt-1">Configure a view below and click "Save Portfolio" to store it.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {savedPortfolios.map((p) => (
                <SavedPortfolioCard
                  key={p.id}
                  portfolio={p}
                  onLoad={handleLoadPortfolio}
                  onDelete={handleDelete}
                  onRename={handleRename}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Divider ── */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Configure New View</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* ── New view configuration ── */}
        <section className="grid grid-cols-3 gap-6">

          {/* Model checklist — spans 2 cols */}
          <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="text-slate-100 font-semibold text-sm">Select Models</h3>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={selectAll} className="text-violet-400 hover:text-violet-300 font-medium transition-colors">Select all</button>
                <span className="text-slate-700">·</span>
                <button onClick={clearAll}  className="text-slate-500 hover:text-slate-300 font-medium transition-colors">Clear</button>
              </div>
            </div>

            {models.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-slate-500 text-sm">No forecast models found.</p>
                <button onClick={() => setView("new-model")} className="mt-3 text-violet-400 hover:text-violet-300 text-sm transition-colors">
                  Create your first model →
                </button>
              </div>
            ) : (
              <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                {models.map((m) => {
                  const isSel = selectedIds.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                        isSel
                          ? "bg-violet-600/10 border-violet-500/30"
                          : "border-transparent hover:bg-slate-800/60 hover:border-slate-700/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleModel(m.id)}
                        className="w-4 h-4 rounded accent-violet-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">{m.assetName || "Untitled"}</div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">{m.indication} · {m.modelType} · {m.granularity}</div>
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.status === "Active"
                          ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                          : "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
                      }`}>
                        {m.status ?? "Active"}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {models.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-800 text-xs text-slate-500">
                {selectedIds.size} of {models.length} model{models.length !== 1 ? "s" : ""} selected
              </div>
            )}
          </div>

          {/* Right column: year range + summary + CTA */}
          <div className="flex flex-col gap-4">
            {/* Year range */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-slate-100 font-semibold text-sm">Time Horizon</h3>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">Start Year</label>
                <select
                  value={startYear}
                  onChange={(e) => setStartYear(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">End Year</label>
                <select
                  value={endYear}
                  onChange={(e) => setEndYear(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  {yearOptions.filter((y) => y > parseInt(startYear)).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div className="pt-1 border-t border-slate-800 text-xs text-slate-500">
                <span className="text-slate-300 font-medium">{Math.max(0, parseInt(endYear) - parseInt(startYear))}</span> year range selected
              </div>
            </div>

            {/* Selected summary */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex-1">
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Selected</div>
              <div className="text-2xl font-bold text-violet-400">{selectedIds.size}</div>
              <div className="text-xs text-slate-500">model{selectedIds.size !== 1 ? "s" : ""}</div>
              {selectedModels.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {selectedModels.map((m) => (
                    <li key={m.id} className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                      {m.assetName}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* CTA */}
            <button
              onClick={handleProceed}
              disabled={!canProceed}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              {canProceed
                ? "Build Portfolio →"
                : selectedIds.size === 0
                  ? "Select models to continue"
                  : "Check year range"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
