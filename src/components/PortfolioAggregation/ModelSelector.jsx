import { useState, useEffect } from "react";
import { useForecast } from "../../store/forecastStore";

const API = "http://localhost:3001/api";

function SavedPortfolioCard({ portfolio, onLoad, onDelete, onRename }) {
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(portfolio.name);
  const [deleting, setDeleting] = useState(false);

  const commitRename = async () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== portfolio.name) await onRename(portfolio.id, trimmed);
    setRenaming(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") commitRename();
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
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-slate-50 border border-violet-400 rounded-md px-2 py-1 text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        ) : (
          <button
            onClick={() => setRenaming(true)}
            className="flex-1 text-left text-sm font-semibold text-slate-800 hover:text-violet-700 transition-colors"
            title="Click to rename"
          >
            {portfolio.name}
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 text-slate-400 hover:text-red-500 transition-colors p-1 disabled:opacity-50"
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

      <div className="text-xs text-slate-500 space-y-0.5">
        <div>{modelCount} model{modelCount !== 1 ? "s" : ""}{modelNames ? `: ${modelNames}` : ""}</div>
        <div>{portfolio.startYear} – {portfolio.endYear} · {portfolio.granularity ?? "yearly"}</div>
        {portfolio.updatedAt && (
          <div>Saved {new Date(portfolio.updatedAt).toLocaleDateString()}</div>
        )}
      </div>

      <button
        onClick={() => onLoad(portfolio)}
        className="mt-auto w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium py-1.5 rounded-lg transition-colors"
      >
        Open →
      </button>
    </div>
  );
}

export default function ModelSelector() {
  const { models, setView, setPortfolioConfig } = useForecast();
  const [savedPortfolios, setSavedPortfolios] = useState([]);
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 16 }, (_, i) => currentYear - 2 + i);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [startYear, setStartYear] = useState(String(currentYear));
  const [endYear, setEndYear] = useState(String(currentYear + 9));

  useEffect(() => {
    fetch(`${API}/portfolios`)
      .then((r) => r.json())
      .then((data) => { setSavedPortfolios(data); setLoadingPortfolios(false); })
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
      setSavedPortfolios((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (e) { console.error("Rename portfolio failed", e); }
  };

  const canProceed = selectedIds.size > 0 && parseInt(endYear) > parseInt(startYear);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <button onClick={() => setView("dashboard")} className="hover:text-violet-600 transition-colors font-medium">
            OncoCast
          </button>
          <span>›</span>
          <span className="text-slate-800 font-semibold">Portfolio Aggregation</span>
        </div>
        <button
          onClick={handleProceed}
          disabled={!canProceed}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          New Portfolio View
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">

        {/* Saved portfolios */}
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-4">Saved Portfolio Views</h2>
          {loadingPortfolios ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading saved portfolios…
            </div>
          ) : savedPortfolios.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center">
              <p className="text-slate-400 text-sm">No saved portfolios yet. Configure a view below and save it.</p>
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

        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Configure New View</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Configure new view */}
        <section className="grid grid-cols-3 gap-6">
          {/* Model checklist — spans 2 cols */}
          <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Select Models</h3>
              <div className="flex items-center gap-2">
                <button onClick={selectAll} className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors">
                  Select all
                </button>
                <span className="text-slate-300">|</span>
                <button onClick={clearAll} className="text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors">
                  Clear
                </button>
              </div>
            </div>

            {models.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No forecast models found.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {models.map((m) => (
                  <label key={m.id} className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors group">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleModel(m.id)}
                      className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{m.assetName || "Untitled"}</div>
                      <div className="text-xs text-slate-500 truncate">{m.indication} · {m.modelType} · {m.granularity}</div>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {m.status ?? "Active"}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Right column: year range + summary + CTA */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Time Horizon</h3>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Start Year</label>
                <select
                  value={startYear}
                  onChange={(e) => setStartYear(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">End Year</label>
                <select
                  value={endYear}
                  onChange={(e) => setEndYear(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {yearOptions.filter((y) => y > parseInt(startYear)).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex-1">
              <div className="text-xs text-slate-500 mb-1">Selected</div>
              <div className="text-2xl font-bold text-violet-700">{selectedIds.size}</div>
              <div className="text-xs text-slate-500">model{selectedIds.size !== 1 ? "s" : ""}</div>
              {selectedIds.size > 0 && (
                <ul className="mt-3 space-y-1">
                  {models.filter((m) => selectedIds.has(m.id)).map((m) => (
                    <li key={m.id} className="text-xs text-slate-600 truncate">• {m.assetName}</li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={handleProceed}
              disabled={!canProceed}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              {canProceed ? "Build Portfolio →" : selectedIds.size === 0 ? "Select models to continue" : "Check year range"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
