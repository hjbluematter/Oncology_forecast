import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../store/authStore";

const API = "http://localhost:3001/api";

const ROLE_COLOR = {
  READ:  "bg-slate-700 text-slate-300",
  WRITE: "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30",
  ADMIN: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30",
};

export default function PermissionsPanel({ model }) {
  const { token } = useAuth();
  const [permissions, setPermissions] = useState([]);
  const [allUsers,    setAllUsers]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(null); // userId being saved
  const [addUserId,   setAddUserId]   = useState("");
  const [addRole,     setAddRole]     = useState("READ");
  const [adding,      setAdding]      = useState(false);
  const [error,       setError]       = useState(null);

  const headers = useCallback(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token]
  );

  async function load() {
    setLoading(true);
    try {
      const [permsRes, usersRes] = await Promise.all([
        fetch(`${API}/admin/permissions/${model.id}`, { headers: headers() }),
        fetch(`${API}/admin/users`,                   { headers: headers() }),
      ]);
      if (permsRes.ok) setPermissions(await permsRes.json());
      if (usersRes.ok) setAllUsers(await usersRes.json());
    } catch {
      setError("Failed to load permissions");
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [model.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateRole(userId, role) {
    setSaving(userId);
    const res = await fetch(`${API}/admin/permissions/${model.id}`, {
      method:  "PUT",
      headers: headers(),
      body:    JSON.stringify({ userId, role }),
    });
    if (res.ok) await load();
    setSaving(null);
  }

  async function removeAccess(userId) {
    setSaving(userId);
    const res = await fetch(`${API}/admin/permissions/${model.id}/users/${userId}`, {
      method: "DELETE", headers: headers(),
    });
    if (res.ok) await load();
    setSaving(null);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!addUserId) return;
    setAdding(true);
    await updateRole(addUserId, addRole);
    setAddUserId(""); setAddRole("READ");
    setAdding(false);
  }

  const assignedIds = new Set(permissions.map((p) => p.userId));
  const unassigned  = allUsers.filter((u) => u.globalRole !== "admin" && !assignedIds.has(u.id));

  return (
    <div className="divide-y divide-slate-800">
      {/* Header note */}
      <div className="px-5 py-3 bg-slate-900/40">
        <p className="text-slate-500 text-xs">
          Global admins always have full access and are not listed here. Changes take effect immediately.
        </p>
      </div>

      {loading ? (
        <div className="px-5 py-10 flex justify-center">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Current permissions */}
          {permissions.length === 0 ? (
            <div className="px-5 py-8 text-center text-slate-600 text-sm">
              No users assigned yet. Add one below.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {permissions.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-semibold">
                      {(p.user?.name || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-slate-200 text-sm font-medium">{p.user?.name ?? "Unknown"}</p>
                      <p className="text-slate-500 text-xs">{p.user?.email ?? p.userId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={p.role}
                      disabled={saving === p.userId}
                      onChange={(e) =>
                        e.target.value === "NONE"
                          ? removeAccess(p.userId)
                          : updateRole(p.userId, e.target.value)
                      }
                      className="bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                    >
                      <option value="NONE">No Access</option>
                      <option value="READ">Read Access</option>
                      <option value="WRITE">Edit Access</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[p.role]}`}>
                      {p.role === "READ" ? "Read" : p.role === "WRITE" ? "Edit" : "Admin"}
                    </span>
                    <button
                      onClick={() => removeAccess(p.userId)}
                      disabled={saving === p.userId}
                      title="Remove access"
                      className="text-slate-600 hover:text-red-400 disabled:opacity-30 transition-colors ml-1"
                    >
                      {saving === p.userId ? (
                        <div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add user form */}
          {unassigned.length > 0 && (
            <div className="px-5 py-4 bg-slate-900/20">
              <p className="text-slate-400 text-xs font-medium mb-3">Grant access to a user</p>
              <form onSubmit={handleAdd} className="flex items-center gap-2 flex-wrap">
                <select
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  required
                  className="flex-1 min-w-[160px] bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-300 px-2.5 py-1.5 focus:outline-none focus:border-violet-500"
                >
                  <option value="">Select user…</option>
                  {unassigned.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-300 px-2.5 py-1.5 focus:outline-none focus:border-violet-500"
                >
                  <option value="READ">Read Access</option>
                  <option value="WRITE">Edit Access</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button
                  type="submit"
                  disabled={!addUserId || adding}
                  className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                >
                  {adding ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                  {adding ? "Adding…" : "Add"}
                </button>
              </form>
              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
