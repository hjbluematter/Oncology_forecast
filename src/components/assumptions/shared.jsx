// ─── Shared utilities for assumption components ───────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";

export const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function buildYearlyKeys(startYear, n) {
  return Array.from({ length: n }, (_, i) => String(startYear + i));
}
export function buildMonthlyKeys(startYear, n) {
  const keys = [];
  for (let y = startYear; y < startYear + n; y++)
    for (let m = 1; m <= 12; m++)
      keys.push(`${y}-${String(m).padStart(2,"0")}`);
  return keys;
}
export function periodLabel(key, isMonthly) {
  if (!isMonthly) return key;
  const [y, m] = key.split("-");
  return `${MONTH_SHORT[parseInt(m)-1]} ${y}`;
}

// ─── Combo filter ─────────────────────────────────────────────────────────────
// Returns filtered combo keys as a Set. Pass null filterState to get all combos.

function uniqVals(combos, key) { return [...new Set(combos.map(c => c[key]))]; }

export function filterCombos(combos, filterState) {
  if (!filterState) return null; // null = show all
  return new Set(combos.filter(c =>
    filterState.geos.has(c.geoLabel) &&
    filterState.lots.has(c.lotLabel) &&
    filterState.segments.has(c.segLabel) &&
    // productLabel may be absent for asset-only combos — skip that filter
    (c.productLabel === undefined || filterState.products.has(c.productLabel))
  ).map(c => c.key));
}

// Self-contained filter UI. Calls onChange({ geos, lots, segments, products }) — all Sets.
export function ComboFilter({ combos, onChange }) {
  const geos     = uniqVals(combos, "geoLabel");
  const lots     = uniqVals(combos, "lotLabel");
  const segments = uniqVals(combos, "segLabel");
  const products = uniqVals(combos, "productLabel").filter(Boolean);

  const [selGeos,     setSelGeos]     = useState(new Set(geos));
  const [selLots,     setSelLots]     = useState(new Set(lots));
  const [selSegments, setSelSegments] = useState(new Set(segments));
  const [selProducts, setSelProducts] = useState(new Set(products));

  function update(setFn, updater) {
    setFn(prev => {
      const next = updater(prev);
      // Notify parent after state flush
      setTimeout(() => onChange({
        geos: setFn === setSelGeos ? next : selGeos,
        lots: setFn === setSelLots ? next : selLots,
        segments: setFn === setSelSegments ? next : selSegments,
        products: setFn === setSelProducts ? next : selProducts,
      }), 0);
      return next;
    });
  }

  // We need the current values synchronously for the onChange payload
  function toggle(dim, value) {
    const [sel, setSel] = dim;
    const next = new Set(sel);
    next.has(value) ? next.delete(value) : next.add(value);
    setSel(next);
    const s = { geos: selGeos, lots: selLots, segments: selSegments, products: selProducts };
    s[dimKey(dim)] = next;
    onChange(s);
  }

  function setAll(dim, all) {
    const [sel, setSel] = dim;
    const next = new Set(all);
    setSel(next);
    const s = { geos: selGeos, lots: selLots, segments: selSegments, products: selProducts };
    s[dimKey(dim)] = next;
    onChange(s);
  }

  function dimKey([, setSel]) {
    if (setSel === setSelGeos)     return "geos";
    if (setSel === setSelLots)     return "lots";
    if (setSel === setSelSegments) return "segments";
    return "products";
  }

  const dims = [
    { label: "Geography", values: geos,     dim: [selGeos,     setSelGeos] },
    { label: "LoT",       values: lots,     dim: [selLots,     setSelLots] },
    { label: "Segment",   values: segments, dim: [selSegments, setSelSegments] },
    ...(products.length > 1 ? [{ label: "Product", values: products, dim: [selProducts, setSelProducts] }] : []),
  ];

  const totalCombos  = combos.length;
  const matchCount   = filterCombos(combos, { geos: selGeos, lots: selLots, segments: selSegments, products: selProducts })?.size ?? totalCombos;
  const isFiltered   = matchCount < totalCombos;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-4">
      <div className="px-4 py-2.5 border-b border-[#c5d8f0] flex items-center justify-between">
        <span className="text-slate-400 text-xs font-medium">Filter combinations</span>
        {isFiltered && (
          <span className="text-violet-400 text-xs">{matchCount} of {totalCombos} shown</span>
        )}
      </div>
      <div className="divide-y divide-slate-800/60">
        {dims.map(({ label, values, dim }) => {
          const [sel] = dim;
          const allOn = sel.size === values.length;
          return (
            <div key={label} className="flex items-start gap-3 px-4 py-2.5">
              <span className="text-slate-500 text-xs font-medium w-20 shrink-0 pt-0.5">{label}</span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {values.map(v => {
                  const active = sel.has(v);
                  return (
                    <button
                      key={v}
                      onClick={() => toggle(dim, v)}
                      className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-all ${
                        active
                          ? "bg-violet-600 text-white"
                          : "bg-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
                {!allOn && (
                  <button onClick={() => setAll(dim, values)} className="px-2 py-0.5 text-xs text-slate-400 hover:text-white transition-colors">All</button>
                )}
                {allOn && values.length > 1 && (
                  <button onClick={() => setAll(dim, [])} className="px-2 py-0.5 text-xs text-slate-400 hover:text-white transition-colors">Clear</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Input sharing helpers ────────────────────────────────────────────────────

// Derives a { [comboKey]: groupId } map for a specific assumption from the new
// groups-based inputSharing structure. Used by DirectEntryPanel and custom tables.
export function getSharingForAssumption(model, assumptionId) {
  const groups = model.inputSharing?.groups ?? [];
  const map = {};
  groups.forEach(g => {
    if (!g.assumptions?.includes(assumptionId)) return;
    g.combos?.forEach(key => { map[key] = g.id; });
  });
  return Object.keys(map).length ? map : null;
}

// Same but uses 3-part asset keys (geoIdx-lotIdx-segIdx) for asset-only metrics.
// The group's combo keys are 4-part, so we strip the product index.
export function getSharingForAssetAssumption(model, assumptionId) {
  const groups = model.inputSharing?.groups ?? [];
  const map = {};
  groups.forEach(g => {
    if (!g.assumptions?.includes(assumptionId)) return;
    g.combos?.forEach(key => {
      const parts = key.split("-");
      const assetKey = parts.slice(0, 3).join("-"); // drop productIdx
      map[assetKey] = g.id;
    });
  });
  return Object.keys(map).length ? map : null;
}

// ─── Combo builders ───────────────────────────────────────────────────────────

function geoList(model) {
  const g = model.geographies ?? [];
  return g.length > 0 ? g : ["Global"];
}
function productList(model) {
  return [
    model.assetName || "Asset",
    ...Array.from({ length: model.competitors ?? 0 }, (_, i) =>
      model.competitorNames?.[i] || `Competitor ${i + 1}`
    ),
  ];
}
function comboLabel(parts, dims) {
  // Only include a dimension in the label if there are >1 of it
  return parts.filter((_, i) => dims[i] > 1).join(" / ") || parts[parts.length - 1] || "—";
}

// All combinations: geo × LOT × segment × product
export function buildCombos(model) {
  const geos    = geoList(model);
  const lots    = model.linesOfTherapy ?? 1;
  const segs    = model.segments ?? 1;
  const prods   = productList(model);
  const combos  = [];

  for (let g = 0; g < geos.length; g++) {
    for (let l = 0; l < lots; l++) {
      for (let s = 0; s < segs; s++) {
        for (let p = 0; p < prods.length; p++) {
          const segLabel = model.segmentNames?.[s] || `Seg ${s+1}`;
          combos.push({
            key: `${g}-${l}-${s}-${p}`,
            geoIdx:g, lotIdx:l, segIdx:s, productIdx:p,
            geoLabel: geos[g],
            lotLabel: `${l+1}L`,
            segLabel,
            productLabel: prods[p],
            isAsset: p === 0,
            isFirstInGeo: l===0 && s===0 && p===0,
            label: comboLabel(
              [geos[g], `${l+1}L`, segLabel, prods[p]],
              [geos.length, lots, segs, prods.length]
            ),
          });
        }
      }
    }
  }
  // Disambiguate identical labels — happens when two products share the same name
  const seen = {};
  for (const c of combos) {
    if (seen[c.label] === undefined) { seen[c.label] = 0; }
    else { seen[c.label]++; }
  }
  // Second pass: append suffix only to colliding labels
  const count = {};
  for (const c of combos) {
    if (seen[c.label] > 0) {
      count[c.label] = (count[c.label] ?? 0) + 1;
      c.label = `${c.label} (${count[c.label]})`;
    }
  }

  return combos;
}

// Asset-only combinations: geo × LOT × segment (no product dimension)
export function buildAssetCombos(model) {
  const geos  = geoList(model);
  const lots  = model.linesOfTherapy ?? 1;
  const segs  = model.segments ?? 1;
  const combos = [];

  for (let g = 0; g < geos.length; g++) {
    for (let l = 0; l < lots; l++) {
      for (let s = 0; s < segs; s++) {
        const segLabel = model.segmentNames?.[s] || `Seg ${s+1}`;
        combos.push({
          key: `${g}-${l}-${s}`,
          geoIdx:g, lotIdx:l, segIdx:s,
          geoLabel: geos[g],
          lotLabel: `${l+1}L`,
          segLabel,
          isFirstInGeo: l===0 && s===0,
          label: comboLabel(
            [geos[g], `${l+1}L`, segLabel],
            [geos.length, lots, segs]
          ) || (model.assetName || "Asset"),
        });
      }
    }
  }
  return combos;
}

// ─── Rollup / rolldown helpers ────────────────────────────────────────────────

// FLOW (Incidence): yearly = annual count → monthly = yearly ÷ 12; monthly → yearly = sum
export function flowToMonthly(yearlyVals, startYear, n) {
  const out = {};
  for (let y = startYear; y < startYear + n; y++) {
    const v = parseFloat(yearlyVals[String(y)]);
    for (let m = 1; m <= 12; m++)
      out[`${y}-${String(m).padStart(2,"0")}`] = isNaN(v) ? "" : Math.round(v / 12);
  }
  return out;
}
export function flowToYearly(monthlyVals, startYear, n) {
  const out = {};
  for (let y = startYear; y < startYear + n; y++) {
    let sum = 0, count = 0;
    for (let m = 1; m <= 12; m++) {
      const v = parseFloat(monthlyVals[`${y}-${String(m).padStart(2,"0")}`] ?? "");
      if (!isNaN(v)) { sum += v; count++; }
    }
    out[String(y)] = count === 12 ? Math.round(sum) : "";
  }
  return out;
}

// STOCK (Prevalence): yearly = point-in-time count → monthly = same value; monthly → yearly = average
export function stockToMonthly(yearlyVals, startYear, n) {
  const out = {};
  for (let y = startYear; y < startYear + n; y++) {
    const v = yearlyVals[String(y)] ?? "";
    for (let m = 1; m <= 12; m++)
      out[`${y}-${String(m).padStart(2,"0")}`] = v;
  }
  return out;
}
export function stockToYearly(monthlyVals, startYear, n) {
  const out = {};
  for (let y = startYear; y < startYear + n; y++) {
    const vals = Array.from({length:12},(_,m)=>parseFloat(monthlyVals[`${y}-${String(m+1).padStart(2,"0")}`]??"")||NaN).filter(v=>!isNaN(v));
    out[String(y)] = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : "";
  }
  return out;
}

// RATE (percentage, price, etc.): yearly → monthly = same value; monthly → yearly = average
export function rateToMonthly(yearlyVals, startYear, n) {
  return stockToMonthly(yearlyVals, startYear, n); // same logic
}
export function rateToYearly(monthlyVals, startYear, n) {
  return stockToYearly(monthlyVals, startYear, n); // same logic
}

// Generic convert: pick correct function based on epiType and direction
export function convertValues(vals, modelLevel, inputLevel, startYear, n, conversionType) {
  if (inputLevel === modelLevel) return vals;
  const toMonthly = conversionType === "flow" ? flowToMonthly : conversionType === "stock" ? stockToMonthly : rateToMonthly;
  const toYearly  = conversionType === "flow" ? flowToYearly  : conversionType === "stock" ? stockToYearly  : rateToYearly;
  if (modelLevel === "monthly") return toMonthly(vals, startYear, n);
  return toYearly(vals, startYear, n);
}

// ─── Excel helpers ────────────────────────────────────────────────────────────

export function downloadCombosExcel(filename, sheetName, inputKeys, isMonthly, combos, getVal) {
  // Dynamic import to keep bundle lazy — caller must import xlsx
  const headers = ["Period Key", "Label", ...combos.map(c => c.label)];
  const rows = inputKeys.map(k => [
    k, periodLabel(k, isMonthly),
    ...combos.map(c => { const v = getVal(c.key, k); return v !== "" && v !== undefined ? parseFloat(v) || v : ""; }),
  ]);
  return { headers, rows, filename, sheetName };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function fmt(n) {
  if (n === null || n === undefined || n === "") return "";
  const v = parseFloat(String(n).replace(/,/g,""));
  return isNaN(v) ? "" : v % 1 === 0 ? v.toLocaleString("en-US") : v.toFixed(2);
}
export function strip(s) { return String(s ?? "").replace(/,/g,""); }
export function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

// ─── Multi-row wide table ─────────────────────────────────────────────────────
const ROW_H = 36; // px — must match actual rendered row height
const BUFFER = 8; // extra rows above/below viewport

function TableRow({ row, ri, keys, editable, showPct, onCell }) {
  const isEven = ri % 2 === 0;
  const rowBg    = isEven ? "bg-white" : "bg-[#f0f6ff]";
  const stickyBg = isEven ? "bg-white" : "bg-[#e8f0fd]";
  return (
    <tr className={`border-b border-[#d1e0f5] ${rowBg} ${row.groupBreakBefore ? "border-t-2 border-t-blue-300" : ""}`}>
      <td className={`border-r border-[#d1e0f5] px-3 py-2 ${stickyBg}`} style={{minWidth:220}}>
        <div className="flex items-center gap-1.5">
          {row.locked && (
            <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          )}
          <div>
            <p className={`text-xs font-medium leading-tight ${row.locked ? "text-slate-400" : "text-slate-100"}`}>{row.label}</p>
            {(row.lockedLabel || row.sublabel) && (
              <p className="text-slate-400 text-xs">{row.lockedLabel ?? row.sublabel}</p>
            )}
          </div>
        </div>
      </td>
      {keys.map(k => {
        const raw = row.values?.[k];
        const display = raw !== null && raw !== undefined && raw !== "" ? fmt(raw) : "";
        const isEditable = editable && !row.locked;
        return (
          <td key={k} className="border-l border-[#d1e0f5] px-0.5 py-0.5">
            {isEditable ? (
              <div className="relative">
                <input
                  type="text"
                  value={display}
                  onChange={e => onCell(ri, k, e.target.value)}
                  placeholder="—"
                  className={`w-full h-full py-1.5 text-right tabular-nums text-slate-100 text-xs bg-transparent border border-transparent rounded hover:border-slate-500 focus:border-violet-500 focus:bg-white focus:outline-none transition-colors placeholder-slate-500 ${showPct ? "pl-2 pr-5" : "px-2"}`}
                />
                {showPct && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none select-none">%</span>}
              </div>
            ) : (
              <div className={`px-2 py-1.5 text-right tabular-nums text-xs ${display ? (row.locked ? "text-slate-400" : "text-slate-200") : "text-slate-500"}`}>
                {display ? (showPct ? `${display}%` : display) : "—"}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

export function MultiRowTable({ keys, years, isMonthly, rows, editable, showPct = false, onCell }) {
  const hBg   = "bg-[#dbe8f8]";
  const hText = "text-slate-200";
  const containerRef = useRef(null);
  const [range, setRange] = useState({ start: 0, end: 40 });

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, clientHeight } = el;
    const start = Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER);
    const end   = Math.min(rows.length, Math.ceil((scrollTop + clientHeight) / ROW_H) + BUFFER);
    setRange({ start, end });
  }, [rows.length]);

  useEffect(() => {
    onScroll();
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  const paddingTop    = range.start * ROW_H;
  const paddingBottom = (rows.length - range.end) * ROW_H;
  const maxH = Math.min(rows.length * ROW_H + 80, 520);

  return (
    <div
      ref={containerRef}
      className="overflow-auto border-t border-[#c5d8f0]"
      style={{ maxHeight: maxH }}
    >
      <table
        className="w-full border-collapse text-xs"
        style={{ minWidth: isMonthly ? `${220 + years.length*12*64}px` : `${220 + years.length*84}px` }}
      >
        <thead>
          {isMonthly && (
            <tr className={`${hBg} border-b border-[#c5d8f0]`}>
              <th className={`${hBg} border-r border-[#c5d8f0] px-3 py-2 text-left font-semibold ${hText}`} style={{minWidth:220}}>
                Combination
              </th>
              {years.map(y => (
                <th key={y} colSpan={12} className={`${hBg} border-l border-[#c5d8f0] px-3 py-2 text-center font-semibold ${hText}`}>{y}</th>
              ))}
            </tr>
          )}
          <tr className={`${hBg} border-b border-[#c5d8f0]`}>
            <th className={`${hBg} border-r border-[#c5d8f0] px-3 py-2 text-left font-medium ${hText}`} style={{minWidth:220}}>
              {isMonthly ? "Month" : "Year"}
            </th>
            {keys.map(k => (
              <th key={k} className={`${hBg} border-l border-[#c5d8f0] px-2 py-2 text-center font-medium ${hText} whitespace-nowrap`} style={{minWidth:isMonthly?60:80}}>
                {isMonthly ? MONTH_SHORT[parseInt(k.split("-")[1])-1] : k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr style={{height: paddingTop}}><td colSpan={keys.length + 1} /></tr>
          )}
          {rows.slice(range.start, range.end).map((row, i) => (
            <TableRow
              key={range.start + i}
              ri={range.start + i}
              row={row}
              keys={keys}
              editable={editable}
              showPct={showPct}
              onCell={onCell}
            />
          ))}
          {paddingBottom > 0 && (
            <tr style={{height: paddingBottom}}><td colSpan={keys.length + 1} /></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Reusable direct-entry assumption panel ───────────────────────────────────
// A self-contained section with input-level toggle, multi-row table, mismatch table,
// Excel download/upload and save. Used by all time-series assumptions.

export function DirectEntryPanel({
  model,
  combos,             // array of combo objects (full set — used for save/init)
  savedValues,        // { inputLevel, combos: { [comboKey]: { input, computed } } }
  saveKey,
  conversionType,     // "flow" | "stock" | "rate"
  showPct,
  excelFilename,
  onSave,
  sharingGroups,      // optional: { [comboKey]: groupId } — dependents are read-only
  visibleKeys,        // optional Set<comboKey> — if provided, only show those combos
}) {
  const modelLevel   = (model.granularity ?? "Yearly").toLowerCase();
  const isMonthlyModel = modelLevel === "monthly";
  const allKeys = isMonthlyModel
    ? buildMonthlyKeys(model.startYear, model.timelineYears)
    : buildYearlyKeys(model.startYear, model.timelineYears);
  const years = Array.from({length: model.timelineYears}, (_,i) => model.startYear + i);

  const [inputLevel, setInputLevel] = useState(savedValues?.inputLevel ?? modelLevel);
  const [values, setValues] = useState(() => {
    const sv = savedValues?.combos ?? {};
    return Object.fromEntries(combos.map(c => {
      const raw = sv[c.key];
      if (!raw) return [c.key, {}];
      // Saved data is {input: {period: val}, computed: {...}} — extract just the period values
      const flat = raw.input !== undefined ? raw.input : raw;
      return [c.key, flat ?? {}];
    }));
  });
  const [saving, setSaving]       = useState(false);
  const [savedAt, setSavedAt]     = useState(null);
  const [dirty, setDirty]         = useState(false);
  const fileInputRef               = useRef(null);
  const [uploadMsg, setUploadMsg] = useState(null);

  const inputIsMonthly = inputLevel === "monthly";
  const inputKeys = inputIsMonthly
    ? buildMonthlyKeys(model.startYear, model.timelineYears)
    : buildYearlyKeys(model.startYear, model.timelineYears);
  const hasMismatch = inputLevel !== modelLevel;

  // ── Sharing: compute primaries and dependents from all combos ─────────────────
  const { primaryKeys, dependentOf } = (() => {
    if (!sharingGroups) return { primaryKeys: new Set(), dependentOf: {} };
    const groupFirst = {}; // groupNumber -> first comboKey seen in combos array
    const primaryKeys = new Set();
    const dependentOf = {}; // comboKey -> { primaryKey, primaryLabel, group }
    for (const c of combos) {
      const g = sharingGroups[c.key];
      if (!g) continue;
      if (!groupFirst[g]) {
        groupFirst[g] = c.key;
        primaryKeys.add(c.key);
      } else {
        const pk = groupFirst[g];
        const pl = combos.find(x => x.key === pk)?.label ?? pk;
        dependentOf[c.key] = { primaryKey: pk, primaryLabel: pl, group: g };
      }
    }
    return { primaryKeys, dependentOf };
  })();

  function patchCell(comboKey, periodKey, raw) {
    if (dependentOf[comboKey]) return; // blocked — dependent is read-only
    setValues(prev => ({ ...prev, [comboKey]: { ...(prev[comboKey]??{}), [periodKey]: strip(raw) } }));
    setDirty(true);
  }

  function getConverted(comboKey) {
    const v = values[comboKey] ?? {};
    return convertValues(v, modelLevel, inputLevel, model.startYear, model.timelineYears, conversionType);
  }

  const [saveError, setSaveError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      // Propagate primary values into dependent combos before saving
      const finalValues = { ...values };
      for (const [depKey, info] of Object.entries(dependentOf)) {
        finalValues[depKey] = { ...(finalValues[info.primaryKey] ?? {}) };
      }
      const combosPayload = Object.fromEntries(combos.map(c => [
        c.key, {
          input: finalValues[c.key] ?? {},
          computed: convertValues(finalValues[c.key] ?? {}, modelLevel, inputLevel, model.startYear, model.timelineYears, conversionType),
        }
      ]));
      await onSave({ inputLevel, combos: combosPayload });
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setSaveError(e?.message ?? "Save failed — is the backend running?");
    } finally {
      setSaving(false);
    }
  }

  function downloadExcel() {
    const headers = ["Period Key", "Label", ...visibleCombos.map(c => c.label)];
    const rows = inputKeys.map(k => [
      k, periodLabel(k, inputIsMonthly),
      ...visibleCombos.map(c => { const v = (values[c.key]??{})[k]; return v!==""&&v!==undefined?parseFloat(v)||v:""; }),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers,...rows]);
    ws["!cols"] = [{wch:12},{wch:14},...visibleCombos.map(()=>({wch:20}))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, excelFilename || "assumptions.xlsx");
  }

  function handleUpload(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb  = XLSX.read(e.target.result, {type:"array"});
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1,defval:""});
        const hi  = rows.findIndex(r => r.some(c => String(c).trim() === "Period Key"));
        if (hi === -1) { setUploadMsg({type:"error",text:"Cannot find 'Period Key' column."}); return; }
        const hdr = rows[hi];
        const next = {...values};
        let matched = 0;
        for (let i = hi+1; i < rows.length; i++) {
          const key = String(rows[i][0]??"").trim();
          if (!inputKeys.includes(key)) continue;
          for (const c of combos) {
            const ci = hdr.findIndex(h => String(h).trim() === c.label);
            if (ci === -1) continue;
            const val = rows[i][ci];
            next[c.key] = {...(next[c.key]??{}), [key]: val!==""?String(val):""};
          }
          matched++;
        }
        if (matched === 0) { setUploadMsg({type:"error",text:"No matching period keys found."}); return; }
        setValues(next); setDirty(true);
        setUploadMsg({type:"success",text:`${matched} rows imported from "${file.name}"`});
      } catch { setUploadMsg({type:"error",text:"Failed to parse file."}); }
    };
    reader.readAsArrayBuffer(file);
  }

  // Visible combos: use external visibleKeys filter if provided, otherwise fall back to geo tabs
  const geos = model.geographies?.length > 0 ? model.geographies : ["Global"];
  const [activeGeoIdx, setActiveGeoIdx] = useState(0);

  const visibleCombos = visibleKeys
    ? combos.filter(c => visibleKeys.has(c.key))
    : combos.filter(c => (c.geoIdx ?? 0) === activeGeoIdx);

  const inputRows = visibleCombos.map(c => {
    const dep = dependentOf[c.key];
    return {
      label: c.label,
      locked: !!dep,
      lockedLabel: dep ? `Shared with ${dep.primaryLabel}` : undefined,
      // dependents display the primary's live values
      values: dep ? (values[dep.primaryKey] ?? {}) : (values[c.key] ?? {}),
    };
  });
  const convertedRows = visibleCombos.map(c => {
    const dep = dependentOf[c.key];
    const sourceKey = dep ? dep.primaryKey : c.key;
    return {
      label: c.label,
      locked: !!dep,
      sublabel: inputLevel==="yearly" ? `→ monthly (${conversionType==="flow"?"÷12":"same value"})` : `→ yearly (${conversionType==="flow"?"sum":"avg"})`,
      values: getConverted(sourceKey),
    };
  });

  return (
    <div className="divide-y divide-slate-800">
      {/* Toolbar */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-3 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs">Input level</span>
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            {["Yearly","Monthly"].map(lv => (
              <button key={lv} onClick={() => { setInputLevel(lv.toLowerCase()); setDirty(true); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${inputLevel===lv.toLowerCase()?"bg-violet-600 text-white shadow":"text-slate-400 hover:text-slate-200"}`}
              >{lv}</button>
            ))}
          </div>
          {hasMismatch && (
            <span className="text-amber-500 text-xs">
              Input {inputLevel} · model {modelLevel} ·
              {inputLevel==="yearly"
                ? conversionType==="flow" ? " ÷12 per month" : " repeated monthly"
                : conversionType==="flow" ? " summed yearly" : " averaged yearly"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={downloadExcel} className="flex items-center gap-1.5 text-slate-400 hover:text-emerald-300 border border-slate-700 hover:border-emerald-600/50 px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
            Download Excel
          </button>
          <button onClick={() => { setUploadMsg(null); fileInputRef.current?.click(); }} className="flex items-center gap-1.5 text-slate-400 hover:text-violet-300 border border-slate-700 hover:border-violet-600/50 px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
            Upload Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if(f) handleUpload(f); e.target.value=""; }}
          />
          {uploadMsg && <span className={`text-xs ${uploadMsg.type==="success"?"text-emerald-400":"text-red-400"}`}>{uploadMsg.text}</span>}
          {saveError && <span className="text-xs text-red-400">{saveError}</span>}
          <span className="text-xs">{dirty?<span className="text-amber-500">Unsaved</span>:savedAt?<span className="text-slate-400">Saved {savedAt}</span>:null}</span>
          <button onClick={handleSave} disabled={saving||!dirty}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            {saving?<div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>:<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>}
            {saving?"Saving…":"Save"}
          </button>
        </div>
      </div>

      {/* Geography tabs — shown only when no external filter is active */}
      {!visibleKeys && geos.length > 1 && (
        <div className="flex gap-1 px-5 py-2 bg-slate-900/40 overflow-x-auto">
          {geos.map((g, i) => (
            <button
              key={i}
              onClick={() => setActiveGeoIdx(i)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                activeGeoIdx === i
                  ? "bg-violet-600 text-white"
                  : "text-slate-400 hover:text-slate-200 bg-slate-800/60"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Input table — only visible geo */}
      <MultiRowTable
        keys={inputKeys} years={years} isMonthly={inputIsMonthly}
        rows={inputRows} editable showPct={showPct}
        onCell={(ri,k,raw) => patchCell(visibleCombos[ri].key, k, raw)}
      />

      {/* Converted table (when mismatch) */}
      {hasMismatch && (
        <div>
          <p className="px-5 pt-3 pb-1 text-amber-500 text-xs uppercase tracking-wider">
            Converted to {modelLevel} (model granularity)
          </p>
          <MultiRowTable keys={allKeys} years={years} isMonthly={isMonthlyModel}
            rows={convertedRows} editable={false} showPct={showPct}
          />
        </div>
      )}
    </div>
  );
}
