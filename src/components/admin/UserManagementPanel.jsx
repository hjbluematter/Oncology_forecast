import { useState, useEffect, useCallback } from "react";
import { useForecast } from "../../store/forecastStore";
import { useAuth }     from "../../store/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const ROLE_OPTIONS = [
  { value: "NONE",  label: "No Access"   },
  { value: "READ",  label: "Read Access" },
  { value: "WRITE", label: "Edit Access" },
  { value: "ADMIN", label: "Admin"       },
];

const ROLE_COLOR = {
  NONE:  "bg-slate-800 text-slate-600",
  READ:  "bg-slate-700/60 text-slate-400",
  WRITE: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  ADMIN: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
};

function roleLabel(role) {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

const EMPTY_FORM = { name: "", email: "", password: "" };

export default function UserManagementPanel() {
  const { models, setView } = useForecast();
  const { user, token, logout } = useAuth();

  const [users,         setUsers]         = useState([]);
  const [allPerms,      setAllPerms]      = useState([]);
  const [selectedId,    setSelectedId]    = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(null);   // modelId being saved

  // Add-user form
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [formError,     setFormError]     = useState(null);
  const [adding,        setAdding]        = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(null);  // user object
  const [deleting,      setDeleting]      = useState(false);

  const headers = useCallback(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token]
  );

  async function load() {
    setLoading(true);
    const [uRes, pRes] = await Promise.all([
      fetch(`${API}/admin/users`,       { headers: headers() }),
      fetch(`${API}/admin/permissions`, { headers: headers() }),
    ]);
    const usersData = uRes.ok ? await uRes.json() : [];
    const permsData = pRes.ok ? await pRes.json() : [];
    const nonAdmins = usersData.filter((u) => u.globalRole !== "admin");
    setUsers(nonAdmins);
    setAllPerms(permsData);
    if (nonAdmins.length > 0) {
      setSelectedId((prev) => nonAdmins.find((u) => u.id === prev) ? prev : nonAdmins[0].id);
    } else {
      setSelectedId(null);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedUser = users.find((u) => u.id === selectedId);

  function getRoleForModel(userId, modelId) {
    return allPerms.find((p) => p.userId === userId && p.modelId === modelId)?.role ?? "NONE";
  }

  async function handleRoleChange(modelId, newRole) {
    setSaving(modelId);
    if (newRole === "NONE") {
      await fetch(`${API}/admin/permissions/${modelId}/users/${selectedId}`, {
        method: "DELETE", headers: headers(),
      });
    } else {
      await fetch(`${API}/admin/permissions/${modelId}`, {
        method: "PUT", headers: headers(),
        body: JSON.stringify({ userId: selectedId, role: newRole }),
      });
    }
    await load();
    setSaving(null);
  }

  async function handleAddUser(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setFormError("All fields are required.");
      return;
    }
    setAdding(true);
    const res = await fetch(`${API}/admin/users`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), password: form.password, globalRole: "user" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFormError(data.error ?? "Failed to create user.");
      setAdding(false);
      return;
    }
    setForm(EMPTY_FORM);
    setShowAddForm(false);
    setAdding(false);
    await load();
    setSelectedId(data.id);
  }

  async function handleDeleteUser() {
    if (!confirmDelete) return;
    setDeleting(true);
    await fetch(`${API}/admin/users/${confirmDelete.id}`, {
      method: "DELETE", headers: headers(),
    });
    setConfirmDelete(null);
    setDeleting(false);
    await load();
  }

  function accessCount(userId) {
    return allPerms.filter((p) => p.userId === userId).length;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bm-header border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">OncoCast</span>
            <span className="text-slate-600 text-sm">·</span>
            <span className="text-slate-400 text-sm font-medium">Access Management</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("dashboard")}
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back to Models
            </button>
            <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5">
              <div className="w-5 h-5 rounded-full bg-violet-600/30 flex items-center justify-center text-violet-400 text-xs font-semibold">
                {user?.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <span className="text-slate-300 text-xs font-medium">{user?.name}</span>
              <span className="text-violet-400 text-xs bg-violet-500/10 px-1.5 py-0.5 rounded">Admin</span>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-100">User Access Management</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Add or remove users, and set their access level per model.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex gap-6 items-start">

            {/* ── Left: user list ── */}
            <div className="w-64 shrink-0">
              {/* List header with Add button */}
              <div className="flex items-center justify-between mb-3 px-1">
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">
                  Users ({users.length})
                </p>
                <button
                  onClick={() => { setShowAddForm((v) => !v); setFormError(null); setForm(EMPTY_FORM); }}
                  className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 px-2.5 py-1 rounded-lg transition-colors font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add User
                </button>
              </div>

              {/* Add-user form */}
              {showAddForm && (
                <form
                  onSubmit={handleAddUser}
                  className="mb-3 bg-slate-900 border border-violet-500/30 rounded-xl p-4 space-y-3"
                >
                  <p className="text-slate-300 text-xs font-semibold">New User</p>
                  <input
                    type="text" placeholder="Full name" value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                  />
                  <input
                    type="email" placeholder="Email address" value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                  />
                  <input
                    type="password" placeholder="Password" value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                  />
                  {formError && <p className="text-red-400 text-xs">{formError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="flex-1 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 border border-slate-700 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={adding}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      {adding && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                      {adding ? "Creating…" : "Create"}
                    </button>
                  </div>
                </form>
              )}

              {/* User cards */}
              <div className="space-y-2">
                {users.length === 0 && (
                  <p className="text-slate-600 text-xs text-center py-6">No users yet. Add one above.</p>
                )}
                {users.map((u) => {
                  const count  = accessCount(u.id);
                  const active = u.id === selectedId;
                  return (
                    <div
                      key={u.id}
                      className={`rounded-xl border transition-all ${
                        active
                          ? "bg-violet-600/10 border-violet-500/40 ring-1 ring-violet-500/20"
                          : "bg-slate-900 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <button
                        onClick={() => setSelectedId(u.id)}
                        className="w-full text-left p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                            active ? "bg-violet-600/30 text-violet-300" : "bg-slate-800 text-slate-400"
                          }`}>
                            {u.name[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${active ? "text-slate-100" : "text-slate-300"}`}>
                              {u.name}
                            </p>
                            <p className="text-slate-500 text-xs truncate">{u.email}</p>
                          </div>
                        </div>
                        <p className="text-slate-600 text-xs mt-2 pl-0.5">
                          {count === 0
                            ? "No models assigned"
                            : `${count} of ${models.length} model${models.length !== 1 ? "s" : ""} accessible`}
                        </p>
                      </button>

                      {/* Remove user button */}
                      <div className="px-4 pb-3 flex justify-end border-t border-slate-800/60 pt-2">
                        <button
                          onClick={() => setConfirmDelete(u)}
                          className="flex items-center gap-1 text-xs text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                          Remove user
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Right: model permissions for selected user ── */}
            {selectedUser ? (
              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-violet-600/20 flex items-center justify-center text-violet-300 text-sm font-semibold">
                    {selectedUser.name[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-slate-100 font-semibold">{selectedUser.name}</p>
                    <p className="text-slate-500 text-xs">{selectedUser.email}</p>
                  </div>
                  <p className="text-slate-600 text-xs ml-auto">Changes take effect immediately</p>
                </div>

                <div className="grid grid-cols-[1fr_auto] items-center px-6 py-2 bg-slate-800/40 border-b border-slate-800">
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Model</span>
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wider w-44 text-center">Access Level</span>
                </div>

                {models.length === 0 ? (
                  <div className="px-6 py-10 text-center text-slate-600 text-sm">
                    No models exist yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {models.map((m) => {
                      const currentRole = getRoleForModel(selectedUser.id, m.id);
                      const busy = saving === m.id;
                      return (
                        <div key={m.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-800/20 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <p className="text-slate-200 text-sm font-medium truncate">{m.assetName}</p>
                              <p className="text-slate-500 text-xs truncate">{m.indication}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium w-28 text-center ${ROLE_COLOR[currentRole]}`}>
                              {roleLabel(currentRole)}
                            </span>
                            {busy ? (
                              <div className="w-36 flex items-center justify-center py-1.5">
                                <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                              </div>
                            ) : (
                              <select
                                value={currentRole}
                                onChange={(e) => handleRoleChange(m.id, e.target.value)}
                                className="w-36 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-300 px-2.5 py-1.5 focus:outline-none focus:border-violet-500"
                              >
                                {ROLE_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center py-24 text-slate-600 text-sm">
                {users.length === 0 ? "Add a user to get started." : "Select a user to manage their access."}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4">
            <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </div>
            <h3 className="text-slate-100 font-semibold mb-1">Remove {confirmDelete.name}?</h3>
            <p className="text-slate-400 text-sm mb-6">
              This will permanently delete{" "}
              <span className="text-slate-200 font-medium">{confirmDelete.email}</span> and revoke all their model permissions. They will no longer be able to log in.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {deleting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {deleting ? "Removing…" : "Remove User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
