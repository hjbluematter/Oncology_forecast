import { useState, useEffect } from "react";
import { useForecast } from "../store/forecastStore";
import { useAuth } from "../store/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const STATUS_COLORS = {
  Active: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
  Draft: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
};

const MODEL_TYPE_ICON = {
  "Patient Flow": (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  "Patient Segmentation": (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
    </svg>
  ),
};

const ACCESS_COLOR = {
  READ:  "bg-slate-700/60 text-slate-400",
  WRITE: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  ADMIN: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
};
const ACCESS_LABEL = { READ: "Read Access", WRITE: "Edit Access", ADMIN: "Admin" };

export default function Dashboard() {
  const { models, loading, error, openModel, openEditModel, deleteModel, setView } = useForecast();
  const { user, isAdmin, logout } = useAuth();
  const canCreate = isAdmin;
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [cloudStatus, setCloudStatus] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState(null);
  const [cloudModels, setCloudModels] = useState([]);
  const [cloudModelsLoading, setCloudModelsLoading] = useState(false);
  const [showCloudPanel, setShowCloudPanel] = useState(false);

  useEffect(() => {
    fetch(`${API}/cloud/status`)
      .then(r => r.json())
      .then(s => setCloudStatus(s.state === "connected" ? "connected" : "error"))
      .catch(() => setCloudStatus("error"));
  }, []);

  async function loadCloudModels() {
    setCloudModelsLoading(true);
    try {
      const res = await fetch(`${API}/cloud/models`);
      const data = await res.json();
      setCloudModels(Array.isArray(data) ? data : []);
      setShowCloudPanel(true);
    } catch {
      setCloudModels([]);
    } finally {
      setCloudModelsLoading(false);
    }
  }

  async function importFromCloud(cloudModelId) {
    const res = await fetch(`${API}/cloud/import/${cloudModelId}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Import failed");
    return data;
  }

  async function handleMigrate() {
    setMigrating(true);
    setMigrateMsg(null);
    try {
      const res = await fetch(`${API}/cloud/migrate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Migration failed");
      setCloudStatus("connected");
      setMigrateMsg({ type: "success", text: `${data.uploaded} model${data.uploaded !== 1 ? "s" : ""} uploaded to cloud` });
    } catch (e) {
      setMigrateMsg({ type: "error", text: e.message });
    } finally {
      setMigrating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top nav */}
      <header className="bm-header border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">OncoCast</span>
            <span className="text-blue-300 text-sm opacity-80">Portfolio Forecasting</span>
          </div>
          <div className="flex items-center gap-3">
            {/* User chip */}
            {user && (
              <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5">
                <div className="w-5 h-5 rounded-full bg-violet-600/30 flex items-center justify-center text-violet-400 text-xs font-semibold">
                  {user.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <span className="text-slate-300 text-xs font-medium">{user.name}</span>
                {isAdmin && (
                  <span className="bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30 text-[10px] px-1.5 py-0.5 rounded-full font-medium">Admin</span>
                )}
              </div>
            )}

            {/* Manage Access — admin only */}
            {isAdmin && (
              <button
                onClick={() => setView("user-management")}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
                Manage Access
              </button>
            )}

            {/* Logout */}
            <button
              onClick={logout}
              title="Sign out"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Logout
            </button>

            {/* Cloud status + migrate */}
            <div className="flex items-center gap-2">
              <span
                title={
                  cloudStatus === "connected" ? "MongoDB Atlas connected" :
                  cloudStatus === "error"     ? "Cloud not connected — update MONGODB_URI in backend/.env" :
                  "Checking cloud connection…"
                }
                className={`w-2 h-2 rounded-full shrink-0 ${
                  cloudStatus === "connected" ? "bg-emerald-400" :
                  cloudStatus === "error"     ? "bg-red-500" :
                                               "bg-slate-500 animate-pulse"
                }`}
              />
              <button
                onClick={handleMigrate}
                disabled={migrating || cloudStatus === "error"}
                title={cloudStatus === "error" ? "Cloud not connected" : "Upload all local models to MongoDB Atlas"}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
              >
                {migrating ? (
                  <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.357 5.094" />
                  </svg>
                )}
                {migrating ? "Uploading…" : "Sync All to Cloud"}
              </button>
              {migrateMsg && (
                <span className={`text-xs ${migrateMsg.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                  {migrateMsg.text}
                </span>
              )}
              {/* Load from cloud */}
              <button
                onClick={loadCloudModels}
                disabled={cloudModelsLoading || cloudStatus !== "connected"}
                title={cloudStatus !== "connected" ? "Cloud not connected" : "Browse models saved in cloud"}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
              >
                {cloudModelsLoading ? (
                  <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75v6.75m0 0l-3-3m3 3 3-3m-8.25 6a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.357 5.094" />
                  </svg>
                )}
                {cloudModelsLoading ? "Loading…" : "From Cloud"}
              </button>
            </div>

            <button
              onClick={() => setView("portfolio-select")}
              disabled={models.length === 0}
              title={models.length === 0 ? "Create at least one forecast model first" : "Aggregate and compare all forecast models"}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
              </svg>
              Portfolio Aggregation
            </button>
            {canCreate && (
              <button
                onClick={() => setView("new-model")}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Forecast Model
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Error banner */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-red-300 text-sm">{error}</p>
            <code className="text-red-500 text-xs ml-auto">cd backend && node index.js</code>
          </div>
        )}

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-100">Forecast Models</h1>
          <p className="text-slate-200 mt-1 text-sm">
            {loading ? "Loading…" : `${models.length} model${models.length !== 1 ? "s" : ""} across your oncology pipeline portfolio`}
          </p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          {[
            { label: "Total Assets", value: loading ? "—" : models.length, sub: "across all indications" },
            { label: "Active Models", value: loading ? "—" : models.filter(m => m.status === "Active").length, sub: "live forecasts" },
            { label: "Avg. Forecast Horizon", value: loading || !models.length ? "—" : `${Math.round(models.reduce((s,m) => s + m.timelineYears, 0) / models.length)} yrs`, sub: "weighted by model" },
            { label: "Lines of Therapy", value: loading || !models.length ? "—" : Math.max(...models.map(m => m.linesOfTherapy)), sub: "max across portfolio" },
          ].map(stat => (
            <div key={stat.label} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <p className="text-slate-200 text-xs uppercase tracking-wider mb-1">{stat.label}</p>
              <p className="text-slate-100 text-2xl font-semibold">{stat.value}</p>
              <p className="text-slate-300 text-xs mt-1">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Cloud models panel */}
        {showCloudPanel && (
          <div className="mb-8 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                </svg>
                <span className="text-slate-200 text-sm font-medium">Cloud Models</span>
                <span className="text-slate-500 text-xs">({cloudModels.length} saved)</span>
              </div>
              <button onClick={() => setShowCloudPanel(false)} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
                Dismiss
              </button>
            </div>
            {cloudModels.length === 0 ? (
              <p className="px-5 py-6 text-slate-500 text-sm text-center">No models found in cloud.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {cloudModels.map(cm => {
                  const isLocal = models.some(m => m.id === (cm.id || cm._localId));
                  return (
                    <CloudModelRow
                      key={cm._id || cm.id}
                      model={cm}
                      isLocal={isLocal}
                      onImport={async () => {
                        const data = await importFromCloud(cm.id || cm._localId);
                        if (data.action === "imported") {
                          // refresh the local list from backend
                          window.location.reload();
                        } else {
                          window.location.reload();
                        }
                      }}
                      onOpen={() => openModel(cm.id || cm._localId)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Model cards grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : models.length === 0 ? (
          <EmptyState onNew={() => setView("new-model")} />
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {models.map(model => (
              <ModelCard
                key={model.id}
                model={model}
                onClick={() => openModel(model.id)}
                onEdit={() => openEditModel(model)}
                onDelete={() => setConfirmDelete(model)}
              />
            ))}
            <NewModelCard onClick={() => setView("new-model")} />
          </div>

          {/* Delete confirmation modal */}
          {confirmDelete && (
            <DeleteModal
              model={confirmDelete}
              onConfirm={async () => {
                await deleteModel(confirmDelete.id);
                setConfirmDelete(null);
              }}
              onCancel={() => setConfirmDelete(null)}
            />
          )}
          </>
        )}
      </main>
    </div>
  );
}

function ModelCard({ model, onClick, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const access = model._access ?? "WRITE";

  return (
    <div className="relative bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-violet-500/50 transition-all group">
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <button onClick={onClick} className="flex items-center gap-3 text-left flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
            {MODEL_TYPE_ICON[model.modelType]}
          </div>
          <div className="min-w-0">
            <h3 className="text-slate-100 font-semibold text-sm group-hover:text-violet-300 transition-colors truncate">
              {model.assetName}
            </h3>
            <p className="text-slate-300 text-xs mt-0.5 truncate">{model.indication}</p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[model.status]}`}>
            {model.status}
          </span>
          {ACCESS_COLOR[access] && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACCESS_COLOR[access]}`}>
              {ACCESS_LABEL[access]}
            </span>
          )}

          {/* Three-dot menu */}
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {menuOpen && (
              <>
                {/* Click-outside overlay */}
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-20 w-36 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors text-left"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                    Edit Config
                  </button>
                  <div className="h-px bg-slate-700" />
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-5">
        {[
          { label: "Model Type", value: model.modelType },
          { label: "Epi Basis", value: model.epiType },
          { label: "Start Year", value: model.startYear },
          { label: "Horizon", value: `${model.timelineYears} years` },
          { label: "Lines of Therapy", value: `${model.linesOfTherapy}L` },
          { label: "Segments", value: model.segments },
        ].map(item => (
          <div key={item.label}>
            <p className="text-slate-300 text-xs">{item.label}</p>
            <p className="text-slate-100 text-sm font-medium">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Geographies */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {model.geographies.map(geo => (
          <span key={geo} className="bg-slate-800 text-slate-200 text-xs px-2 py-0.5 rounded">
            {geo}
          </span>
        ))}
        {model.showRestOfWorld && (
          <span className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded">+RoW</span>
        )}
      </div>

      {/* Footer */}
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between pt-4 border-t border-slate-800"
      >
        <span className="text-slate-300 text-xs">Created {model.createdAt}</span>
        <span className="text-violet-400 text-xs font-medium group-hover:text-violet-300 flex items-center gap-1">
          Open model
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </span>
      </button>
    </div>
  );
}

function DeleteModal({ model, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4">
        <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </div>
        <h3 className="text-slate-100 font-semibold mb-1">Delete {model.assetName}?</h3>
        <p className="text-slate-400 text-sm mb-6">
          This will permanently delete the <span className="text-slate-200 font-medium">{model.indication}</span> forecast model and all its saved assumptions. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => { setDeleting(true); await onConfirm(); }}
            disabled={deleting}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {deleting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {deleting ? "Deleting…" : "Delete Model"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewModelCard({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-slate-900/50 border border-dashed border-slate-700 rounded-xl p-6 hover:border-violet-500/50 hover:bg-slate-900 transition-all group flex flex-col items-center justify-center min-h-[280px] gap-4"
    >
      <div className="w-12 h-12 rounded-full bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:bg-violet-600/20 transition-colors">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-slate-300 font-medium text-sm">New Forecast Model</p>
        <p className="text-slate-500 text-xs mt-1">Configure a new asset from scratch</p>
      </div>
    </button>
  );
}

function CloudModelRow({ model, isLocal, onImport, onOpen }) {
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState(null);
  const savedAt = model.cloudSavedAt ? new Date(model.cloudSavedAt).toLocaleString() : "—";

  async function handleImport() {
    setImporting(true);
    setMsg(null);
    try {
      await onImport();
    } catch (e) {
      setMsg(e.message);
      setImporting(false);
    }
  }

  return (
    <div className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-800/30 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 text-sm font-medium truncate">{model.assetName}</p>
        <p className="text-slate-500 text-xs mt-0.5 truncate">
          {model.indication} · {model.epiType} · {model.linesOfTherapy}L · {model.geographies?.length ?? "?"} geo{model.geographies?.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-slate-500 text-xs">Cloud saved</p>
        <p className="text-slate-400 text-xs">{savedAt}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {isLocal ? (
          <>
            <span className="text-emerald-400 text-xs font-medium px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">Local ✓</span>
            <button
              onClick={handleImport}
              disabled={importing}
              className="text-xs text-slate-400 hover:text-violet-300 border border-slate-700 hover:border-violet-500/40 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
            >
              {importing ? "Syncing…" : "Re-sync"}
            </button>
            <button onClick={onOpen} className="text-xs text-violet-400 hover:text-violet-300 border border-violet-500/30 hover:border-violet-400 px-3 py-1.5 rounded-lg transition-all">
              Open →
            </button>
          </>
        ) : (
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition-colors"
          >
            {importing ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
            {importing ? "Importing…" : "Import to Local"}
          </button>
        )}
        {msg && <span className="text-red-400 text-xs">{msg}</span>}
      </div>
    </div>
  );
}

function EmptyState({ onNew }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="w-16 h-16 rounded-full bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-slate-200 font-semibold">No forecast models yet</h3>
        <p className="text-slate-500 text-sm mt-1">Create your first oncology pipeline forecast to get started.</p>
      </div>
      <button
        onClick={onNew}
        className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
      >
        Create First Model
      </button>
    </div>
  );
}
