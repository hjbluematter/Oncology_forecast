import { useState } from "react";
import { useForecast } from "../../store/forecastStore";
import { buildCombos } from "./shared";
import { apiFetch } from "../../utils/apiFetch";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

function buildCols(model) {
  const cols = [{ id: "epi", label: "Epi" }];
  const cuts = (model.epiFunnel ?? []).filter(f => !f.locked);
  cuts.forEach(f => cols.push({ id: `funnel_${f.id ?? f.name}`, label: f.label ?? f.name ?? String(f.id) }));
  cols.push({ id: "marketShare", label: "Market Share" });
  if ((model.epiType ?? "Incidence") === "Incidence") cols.push({ id: "persistency", label: "Persistency" });
  cols.push(
    { id: "compliance",  label: "Compliance",  assetOnly: true },
    { id: "access",      label: "Access Rate",  assetOnly: true },
    { id: "abandonment", label: "Abandonment",  assetOnly: true },
    { id: "vials",       label: "Vials",        assetOnly: true },
    { id: "grossPrice",  label: "Gross Price",  assetOnly: true },
    { id: "gtn",         label: "GTN",          assetOnly: true },
  );
  if (model.ira || model.enableIRA)   cols.push({ id: "ira",  label: "IRA",  assetOnly: true });
  if (model.ptrs || model.enablePTRS) cols.push({ id: "ptrs", label: "PTRS", assetOnly: true });
  return cols;
}

function groupColor(idx, total) {
  const hue = Math.round((idx / Math.max(total, 1)) * 360);
  return `hsl(${hue},65%,45%)`;
}

let _uid = 0;
function uid() { return `g${Date.now()}_${++_uid}`; }

// ─── Main component ───────────────────────────────────────────────────────────

export default function InputSharingAssumptions({ model, readOnly = false }) {
  const { updateModel } = useForecast();
  const combos = buildCombos(model);
  const cols   = buildCols(model);
  const saved  = model.inputSharing ?? {};

  const [groups,  setGroups]  = useState(saved.groups ?? []);
  const [editing, setEditing] = useState(null); // null | "new" | groupId
  const [saving,  setSaving]  = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [dirty,   setDirty]   = useState(false);

  // Draft state lives here so it survives re-renders of child panels
  const [draft, setDraft] = useState({ label: "", combos: [], assumptions: [] });

  function openNew() {
    setDraft({ label: `Group ${groups.length + 1}`, combos: [], assumptions: cols.map(c => c.id) });
    setEditing("new");
  }

  function openEdit(g) {
    setDraft({ label: g.label, combos: [...g.combos], assumptions: [...g.assumptions] });
    setEditing(g.id);
  }

  function cancelEdit() { setEditing(null); }

  function lockGroup() {
    if (draft.combos.length < 2 || draft.assumptions.length < 1) return;
    if (editing === "new") {
      setGroups(prev => [...prev, { id: uid(), ...draft }]);
    } else {
      setGroups(prev => prev.map(g => g.id === editing ? { ...g, ...draft } : g));
    }
    setEditing(null);
    setDirty(true);
  }

  function deleteGroup(id) {
    setGroups(prev => prev.filter(g => g.id !== id));
    setDirty(true);
  }

  function patchDraft(patch) { setDraft(prev => ({ ...prev, ...patch })); }

  function toggleCombo(key) {
    setDraft(prev => ({
      ...prev,
      combos: prev.combos.includes(key) ? prev.combos.filter(k => k !== key) : [...prev.combos, key],
    }));
  }

  function toggleAssumption(id) {
    setDraft(prev => ({
      ...prev,
      assumptions: prev.assumptions.includes(id) ? prev.assumptions.filter(x => x !== id) : [...prev.assumptions, id],
    }));
  }

  function setAllAssumptions(all) {
    setDraft(prev => ({ ...prev, assumptions: all ? cols.map(c => c.id) : [] }));
  }

  async function handleSave() {
    setSaving(true);
    const inputSharing = { groups };
    await apiFetch(`${API}/models/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputSharing }),
    });
    updateModel(model.id, { inputSharing });
    setSaving(false); setDirty(false);
    setSavedAt(new Date().toLocaleTimeString());
  }

  return (
    <div className="divide-y divide-slate-800">
      {/* Toolbar */}
      <div className="px-5 py-3 flex items-center justify-between gap-4 bg-slate-900/60">
        <p className="text-slate-500 text-xs">
          Define groups of combinations that share input values. The first combination in each group is the editable primary; others mirror it.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs">
            {dirty ? <span className="text-amber-500">Unsaved</span> : savedAt ? <span className="text-slate-400">Saved {savedAt}</span> : null}
          </span>
          <button onClick={handleSave} disabled={saving || !dirty}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            {saving
              ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Group list + editor */}
      <div className="px-5 py-4 space-y-3">
        {groups.length === 0 && !editing && (
          <p className="text-slate-400 text-sm text-center py-8">No sharing groups yet — create one to link combinations together.</p>
        )}

        {groups.map((g, gi) => (
          editing === g.id
            ? <EditPanel
                key={g.id}
                draft={draft}
                combos={combos}
                cols={cols}
                color={groupColor(gi, groups.length)}
                onLabelChange={v => patchDraft({ label: v })}
                onToggleCombo={toggleCombo}
                onToggleAssumption={toggleAssumption}
                onSetAllAssumptions={setAllAssumptions}
                onLock={lockGroup}
                onCancel={cancelEdit}
              />
            : <GroupCard
                key={g.id}
                group={g}
                color={groupColor(gi, groups.length)}
                combos={combos}
                cols={cols}
                onEdit={() => openEdit(g)}
                onDelete={() => deleteGroup(g.id)}
              />
        ))}

        {editing === "new" && (
          <EditPanel
            draft={draft}
            combos={combos}
            cols={cols}
            color={groupColor(groups.length, groups.length + 1)}
            onLabelChange={v => patchDraft({ label: v })}
            onToggleCombo={toggleCombo}
            onToggleAssumption={toggleAssumption}
            onSetAllAssumptions={setAllAssumptions}
            onLock={lockGroup}
            onCancel={cancelEdit}
          />
        )}

        {!editing && (
          <button onClick={openNew}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-700 hover:border-violet-500/50 rounded-xl py-3 text-slate-500 hover:text-violet-400 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Group
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Locked group card ────────────────────────────────────────────────────────

function GroupCard({ group, color, combos, cols, onEdit, onDelete }) {
  const allCombos = group.combos.map(k => combos.find(c => c.key === k)).filter(Boolean);
  const primary   = allCombos[0];
  const rest      = allCombos.slice(1);

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/50">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-slate-200 text-sm font-medium flex-1">{group.label}</span>
        <span className="text-slate-400 text-xs">
          {group.combos.length} combination{group.combos.length !== 1 ? "s" : ""} · {group.assumptions.length} assumption{group.assumptions.length !== 1 ? "s" : ""}
        </span>
        <button onClick={onEdit}
          className="ml-2 p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
          title="Edit group"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </button>
        <button onClick={onDelete}
          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
          title="Delete group"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Combinations */}
      <div className="px-4 py-2.5 flex flex-wrap gap-1.5 bg-slate-900/50">
        {primary && (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-600 font-medium">
            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            {primary.label}
          </span>
        )}
        {rest.map(c => (
          <span key={c.key} className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-500 border border-slate-800">
            {c.label}
          </span>
        ))}
      </div>

      {/* Assumptions */}
      <div className="px-4 py-2 flex flex-wrap gap-1.5 border-t border-slate-800/60">
        {group.assumptions.map(aId => {
          const col = cols.find(c => c.id === aId);
          return col ? (
            <span key={aId} className="text-xs px-2 py-0.5 rounded bg-violet-600/10 text-violet-400 border border-violet-500/20">
              {col.label}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}

// ─── Create / edit panel ──────────────────────────────────────────────────────

// Extract unique sorted values for a dimension
function uniq(arr) { return [...new Set(arr)]; }

function EditPanel({ draft, combos, cols, color, onLabelChange, onToggleCombo, onToggleAssumption, onSetAllAssumptions, onLock, onCancel }) {
  const canLock     = draft.combos.length >= 2 && draft.assumptions.length >= 1;
  const allSelected = draft.assumptions.length === cols.length;

  // Dimension filter state — null means "all values selected"
  const geos     = uniq(combos.map(c => c.geoLabel));
  const lots     = uniq(combos.map(c => c.lotLabel));
  const segments = uniq(combos.map(c => c.segLabel));
  const products = uniq(combos.map(c => c.productLabel));

  const [selGeos,     setSelGeos]     = useState(new Set(geos));
  const [selLots,     setSelLots]     = useState(new Set(lots));
  const [selSegments, setSelSegments] = useState(new Set(segments));
  const [selProducts, setSelProducts] = useState(new Set(products));

  // Combos that pass ALL four dimension filters
  const filteredCombos = combos.filter(c =>
    selGeos.has(c.geoLabel) &&
    selLots.has(c.lotLabel) &&
    selSegments.has(c.segLabel) &&
    selProducts.has(c.productLabel)
  );

  function toggleDim(setter, current, value) {
    setter(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  function toggleAll(setter, all) {
    setter(new Set(all));
  }

  function clearAll(setter) { setter(new Set()); }

  // Add all currently filtered combos to the draft selection
  function addFiltered() {
    filteredCombos.forEach(c => { if (!draft.combos.includes(c.key)) onToggleCombo(c.key); });
  }

  // Remove all currently filtered combos from the draft selection
  function removeFiltered() {
    filteredCombos.forEach(c => { if (draft.combos.includes(c.key)) onToggleCombo(c.key); });
  }

  const allFilteredSelected = filteredCombos.length > 0 && filteredCombos.every(c => draft.combos.includes(c.key));

  return (
    <div className="rounded-xl border border-violet-500/30 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-violet-600/10 border-b border-violet-500/20">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
        <input
          value={draft.label}
          onChange={e => onLabelChange(e.target.value)}
          className="flex-1 bg-transparent text-slate-200 text-sm font-medium focus:outline-none placeholder-slate-600"
          placeholder="Group name…"
        />
        <span className="text-slate-500 text-xs shrink-0">
          {draft.combos.length < 2 ? "select ≥ 2 combinations" : `${draft.combos.length} selected`}
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-800 bg-slate-900">

        {/* ── Left: dimension filters + combo result ── */}
        <div className="flex flex-col divide-y divide-slate-800">

          {/* Dimension filter rows */}
          {[
            { label: "Geography", values: geos,     sel: selGeos,     set: setSelGeos },
            { label: "LoT",       values: lots,     sel: selLots,     set: setSelLots },
            { label: "Segment",   values: segments, sel: selSegments, set: setSelSegments },
            { label: "Product",   values: products, sel: selProducts, set: setSelProducts },
          ].map(dim => (
            <div key={dim.label} className="px-4 py-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-slate-500 text-xs font-medium w-16 shrink-0">{dim.label}</span>
                <div className="flex flex-wrap gap-1">
                  {dim.values.map(v => {
                    const active = dim.sel.has(v);
                    return (
                      <button
                        key={v}
                        onClick={() => toggleDim(dim.set, dim.sel, v)}
                        style={active ? { background: color, color: "#fff" } : {}}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                          active ? "" : "bg-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        {v}
                      </button>
                    );
                  })}
                  {dim.sel.size !== dim.values.length && (
                    <button
                      onClick={() => toggleAll(dim.set, dim.values)}
                      className="px-2 py-0.5 rounded text-xs text-slate-400 hover:text-white transition-colors"
                    >All</button>
                  )}
                  {dim.sel.size > 0 && dim.sel.size === dim.values.length && dim.values.length > 1 && (
                    <button
                      onClick={() => clearAll(dim.set)}
                      className="px-2 py-0.5 rounded text-xs text-slate-400 hover:text-white transition-colors"
                    >Clear</button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Filtered result */}
          <div className="px-4 py-3 flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-500 text-xs">
                {filteredCombos.length} combination{filteredCombos.length !== 1 ? "s" : ""} match
              </span>
              <div className="flex items-center gap-2">
                <button onClick={addFiltered} disabled={filteredCombos.length === 0}
                  className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-30 transition-colors"
                >+ Add all</button>
                <span className="text-slate-500">·</span>
                <button onClick={removeFiltered} disabled={filteredCombos.length === 0}
                  className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
                >− Remove all</button>
              </div>
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
              {filteredCombos.length === 0 && (
                <p className="text-slate-400 text-xs">No combinations match the selected filters.</p>
              )}
              {filteredCombos.map(c => {
                const checked   = draft.combos.includes(c.key);
                const isPrimary = draft.combos[0] === c.key;
                return (
                  <label key={c.key} className="flex items-center gap-2 cursor-pointer group py-0.5">
                    <input type="checkbox" checked={checked} onChange={() => onToggleCombo(c.key)}
                      className="w-3.5 h-3.5 rounded shrink-0" style={{ accentColor: color }}
                    />
                    <span className={`text-xs flex-1 leading-tight transition-colors ${checked ? "text-slate-200" : "text-slate-500 group-hover:text-slate-300"}`}>
                      {c.label}
                    </span>
                    {isPrimary && <span className="text-slate-400 text-xs shrink-0">primary</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {/* All selected combos summary */}
          {draft.combos.length > 0 && (
            <div className="px-4 py-2.5 bg-slate-900/60">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-500 text-xs font-medium">Selected ({draft.combos.length})</span>
                <button onClick={() => [...draft.combos].forEach(k => onToggleCombo(k))}
                  className="text-slate-400 hover:text-white text-xs transition-colors"
                >Clear all</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {draft.combos.map(k => {
                  const c = combos.find(x => x.key === k);
                  const isPrimary = draft.combos[0] === k;
                  return c ? (
                    <span key={k}
                      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${isPrimary ? "bg-slate-700 text-slate-200" : "bg-slate-800 text-slate-500"}`}
                    >
                      {isPrimary && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>}
                      {c.label}
                      <button onClick={() => onToggleCombo(k)} className="ml-0.5 text-slate-400 hover:text-white">×</button>
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: assumption picker ── */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400 text-xs font-medium">Applies to assumptions</p>
            <button onClick={() => onSetAllAssumptions(!allSelected)}
              className="text-slate-400 hover:text-white text-xs transition-colors"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="space-y-1.5">
            {cols.map(col => {
              const checked = draft.assumptions.includes(col.id);
              return (
                <label key={col.id} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
                  <input type="checkbox" checked={checked} onChange={() => onToggleAssumption(col.id)}
                    className="w-3.5 h-3.5 rounded shrink-0" style={{ accentColor: color }}
                  />
                  <span className={`text-xs flex-1 transition-colors ${checked ? "text-slate-200" : "text-slate-500 group-hover:text-slate-300"}`}>
                    {col.label}
                    {col.assetOnly && <span className="text-slate-400 ml-1">(asset)</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-900/60">
        <p className="text-slate-400 text-xs">First selected combination is the editable primary; all others mirror its values.</p>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-200 transition-colors">
            Cancel
          </button>
          <button onClick={onLock} disabled={!canLock}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Lock Group
          </button>
        </div>
      </div>
    </div>
  );
}
