# OncoCast — Project Context for Claude

AI-native oncology pipeline forecasting platform. Replaces Excel-based models with a structured, assumption-driven UI.

## Running the app

```bash
# Terminal 1 — backend (must be in backend/ directory)
cd "C:\Users\MukulSuri\OneDrive - Blue Matter\Desktop\oncology-forecast\backend"
node index.js
# → http://localhost:3001  (also attempts MongoDB Atlas connection on startup)

# Terminal 2 — frontend
cd "C:\Users\MukulSuri\OneDrive - Blue Matter\Desktop\oncology-forecast"
npm run dev
# → http://localhost:5174
```

## Stack

- React + Vite, Tailwind CSS 3 (light Blue Matter theme — slate/violet palette is fully remapped, see below)
- Context API (`ForecastContext` in `src/store/forecastStore.jsx`) — no Redux
- Express backend on port 3001, persists locally to `backend/data/models.json`
- MongoDB Atlas for cloud persistence (`backend/db/mongodb.js`) — connection string in `backend/.env`
- SheetJS (`xlsx`) for Excel download/upload
- Recharts for live epi chart and forecast bar chart

## Key files

| File | Purpose |
|------|---------|
| `src/store/forecastStore.jsx` | Global state: models, view, activeModel, addModel, saveEditedModel, deleteModel, updateModel |
| `src/components/Dashboard.jsx` | Model card grid with edit/delete; cloud status dot + "Sync All to Cloud" button |
| `src/components/NewModelWizard.jsx` | 8-step wizard (create + edit mode) — step 6 is Patient Flow Routing (skipped for non-PF models) |
| `src/components/ModelDetail.jsx` | Tabbed model view: Assumptions / Input Sharing / Forecast Output / Scenarios; "Save to Cloud" button in header |
| `src/components/ForecastOutput.jsx` | Run Forecast button, summary cards, stacked bar chart, combo detail trace table, detailed results table |
| `src/components/ScenarioManager.jsx` | Scenario create/edit/run UI; ComparisonView with waterfall attribution chart |
| `src/utils/forecastEngine.js` | Pure JS forecast engine — `runForecast(model)` returns all computed outputs incl. roeByLot/rowByLot |
| `src/components/assumptions/EpiAssumptions.jsx` | Wide-format epi spreadsheet + live chart |
| `src/components/assumptions/FunnelCutAssumptions.jsx` | Per-cut time-series tables for each funnel step |
| `src/components/assumptions/MarketShareAssumptions.jsx` | Market share % per product/combo |
| `src/components/assumptions/PersistencyAssumptions.jsx` | Median DoT (months) per product/combo — scalar entry |
| `src/components/assumptions/ProgressionAssumptions.jsx` | % progressing per period per LOT transition (g-l-s key, 3-part) |
| `src/components/assumptions/OperationalAssumptions.jsx` | Compliance, Access, Abandonment, Vials/PM, Price, GTN, IRA, PTRS |
| `src/components/assumptions/InputSharingAssumptions.jsx` | Share assumption values across combos |
| `src/components/assumptions/RoeRowAssumptions.jsx` | Period-level NPS/Revenue scaling factors for RoE (from EU5) and RoW (from US); Excel download/upload |
| `src/components/assumptions/shared.jsx` | DirectEntryPanel, MultiRowTable, buildCombos, buildAssetCombos, ComboFilter, convertValues |
| `backend/index.js` | Express: local CRUD + cloud endpoints (/api/cloud/status, /api/cloud/save/:id, /api/cloud/migrate, /api/cloud/models) |
| `backend/db/mongodb.js` | MongoDB Atlas connection helper — lazy connect, getStatus(), getDb() |
| `backend/.env` | MONGODB_URI, MONGODB_DB, PORT |

## Tailwind theme — critical (light palette)

The app uses a **fully inverted** Tailwind slate/violet palette in `tailwind.config.js`. Dark-theme class names in JSX render as a **light** UI:

| Class | Resolved color | Used for |
|-------|---------------|---------|
| `bg-slate-900` | `#ffffff` | White card backgrounds |
| `bg-slate-950` | `#f0f4f8` | Off-white page background |
| `text-slate-100` | `#1e293b` | Primary body text |
| `text-slate-200` | `#1e293b` | Primary body text (alias) |
| `text-slate-300` | `#334155` | Secondary labels |
| `text-slate-400` | `#334155` | Secondary labels (alias) |
| `text-slate-500` | `#475569` | Hint/descriptive text — 5.9:1 WCAG AA |
| `text-slate-600` | `#52637a` | Subtle text — 5.1:1 WCAG AA |
| `slate-700` | `#94a3b8` | Borders/dividers only — NOT for text |
| `violet-300` | `#1d4ed8` | Dark blue — readable on light bg |
| `violet-600` | `#1d56c4` | Primary button / active tab |

**Never use `text-violet-100`, `text-violet-200`, `text-emerald-300` or similar light variants** — these fall back to default Tailwind values (near-white) and are invisible on white card backgrounds.

## Model object shape

```js
{
  id, createdAt, assetName, indication,
  modelType,        // "Patient Flow" | "Patient Segmentation"
  epiType,          // "Incidence" | "Prevalence"
  granularity,      // "Yearly" | "Monthly"
  startYear, timelineYears,
  epiFunnel: [
    // Each step: { id, label, description, locked, operator, value }
    // operator: "complement"|"multiply"|"divide"|"add"|"subtract"
    // locked:true step is the anchor (epi pool), operator/value are null
    // complement: pool*(1-v/100), multiply: pool*(v/100), divide: pool/(v/100)
  ],
  geographies, showRestOfEurope, showRestOfWorld,
  linesOfTherapy, segments,
  competitors, competitorNames, competitorsBySegment,
  segmentNames,
  applyIRA, iraYear, iraDiscountRate, iraSmallMolecule,
  applyPTRS, ptrsValue,
  patientFlowRules,     // { "2L": { "Seg A": { "Enhertu": "Seg B" } } } — routing matrix
  epiAssumptions:       { method, inputLevel, startValue, growthRate, periodValues, computedValues },
  funnelCutValues:      { [cutId]: { inputLevel, combos: { [g-l-s-p]: { input, computed } } } },
  marketShareAssumptions: { inputLevel, combos: { [g-l-s-p]: { input, computed } } },
  persistencyAssumptions: { combos: { [g-l-s-p]: "medianMonths" } },  // scalar
  progressionAssumptions: { inputLevel, combos: { [g-l-s]: { input, computed } } },  // 3-part key
  operationalAssumptions: {
    compliance, access, abandonment, vials, grossPrice, gtn,
    ptrs,  // scalar per combo
    ira    // optional period-by-period override
    // each: { inputLevel, combos: { [g-l-s]: { input, computed } } }
  },
  roeAssumptions: { [period]: { nps: "pct", revenue: "pct" } },  // % of EU5 output
  rowAssumptions: { [period]: { nps: "pct", revenue: "pct" } },  // % of US output
  scenarios: [{ id, name, description, assumptions: { ... partial model overrides ... } }],
}
```

## Wizard steps (8 total)

1. Asset & Indication
2. Model Configuration (type, epi type, granularity, timeline)
3. **Epidemiology Funnel** — operator (1−x / × / ÷ / + / −), default value, editable label per cut
4. Geographies (G20, grouped by region) — includes RoE / RoW aggregate roll-up toggles
5. Therapy & Segments (LOT, segments, competitors, segmentNames)
6. **Patient Flow Routing** — rules matrix (rows=segments, cols=products, cells=target segment dropdowns) — **skipped for non-Patient-Flow models**
7. Revenue Adjustments (IRA + PTRS)
8. Review & Create

Edit mode: wizard pre-fills from `editingModel`; uses PATCH instead of POST.
Step 6 is skipped in `next()`/`back()` when `form.modelType !== "Patient Flow"`.

## Forecast engine (`src/utils/forecastEngine.js`)

`runForecast(model)` — pure ES module, no React.

**Four model type combinations:**
- **Patient Flow × Incidence**: 1L epi from epiAssumptions; 2L+ epi = `progressionInjection` from previous lot same period. Lots processed in ascending order within each period so injection is available immediately.
- **Patient Flow × Prevalence**: Each LOT reads its own epi from epiAssumptions (separate inputs per lot).
- **Patient Segmentation × Incidence/Prevalence**: Each LOT reads its own epi. No progression cascade.

**Key flows per period per (g, l, s) combo:**
1. EPI base → apply funnel cuts (via `applyFunnelOp`) → `eligiblePool`
2. `eligiblePool × marketShare%` → `nps` per product
3. DoT exponential decay (Incidence): `pm = (activeStart + nps) × (1/λ) × (1−e^(−λ×periodMonths))`; `activeEnd = (activeStart+nps) × e^(−λ×periodMonths)`
4. Progression (Patient Flow Incidence): `progressingOut = activeEnd × progressionRate`; injected into next lot's `progressionInjection[nextK3][period]`
5. Revenue (asset p=0 only): `vialsDispensed = pm × compliance × access × (1−abandonment) × vialsPerPM`; `revenue = vialsDispensed × netPrice × ptrs`

**Derived geographies (post-loop):**
- `roeByLot[lotLabel][period] = { nps, revenue }` — EU5 output × `roeAssumptions[period].nps/revenue` factors
- `rowByLot[lotLabel][period] = { nps, revenue }` — US output × `rowAssumptions[period].nps/revenue` factors
- Only computed when `model.showRestOfEurope` / `model.showRestOfWorld` are true and the source geo exists

**Funnel cut normalization:** Values stored as 0–1 decimals are auto-normalized to 0–100 scale: `if (cutVal > 0 && cutVal < 1) cutVal *= 100`. `applyFunnelOp` always divides by 100 internally.

**Returns:** `{ periods, years, combos, eligible, nps, pm, vials, revenue, progressing, totalRevenue, totalNPS, totalPM, totalVials, revenueByLot, revenueByGeo, roeByLot, rowByLot, traceData }`

**traceData:** `{ [g-l-s]: { [period]: { epiBase, funnelSteps[], eligible, shareRaw, nps, activeStart, medianMonths, pm, activeEnd, progRatePct, progressingOut, compliance, access, abandonment, vialsPerPM, vialsDispensed, grossPrice, gtn, netPrice, iraApplied, iraDiscountApplied, ptrs, revenue } } }`

## Forecast Output tab (`src/components/ForecastOutput.jsx`)

- **Run Forecast** button → calls `runForecast(model)` synchronously (deferred via setTimeout for spinner)
- **Summary cards**: Total Revenue, Peak Revenue, Total New Patients, Total Vials Dispensed
- **Revenue chart**: Recharts stacked bar by LOT; metric toggle (Revenue / New Patients / Vials); granularity toggle (Yearly / Monthly, monthly models only); monthly models aggregated to yearly by default
- **Combo Detail trace**: Dropdown (asset combos only, g-l-s keys); step-by-step funnel table with explicit `aggregate` per row (`"sum"` for counts/flows, `"avg"` for rates/prices, `"first"` for static values like DoT)
- **Detailed results table**: Periods as **columns**, LOTs as row groups; metric toggle (Revenue / NPS / Vials); yearly/monthly granularity toggle; RoE/RoW appear as normal geo rows; light color scheme (`bg-[#dbe8f8]` header, `bg-[#dbeafe]` LOT totals, `bg-[#ede9fe]` grand total)

## Scenario Manager (`src/components/ScenarioManager.jsx`)

- Create / edit scenarios — each scenario stores partial assumption overrides (any subset of the model's assumption keys)
- **ComparisonView**: runs base forecast + scenario forecast side-by-side; shows summary delta cards
- **Waterfall attribution chart**: for each scenario, isolates 13 assumption drivers (epi, funnel, marketShare, persistency, progression, compliance, access, abandonment, vials, price, gtn, ptrs, ira); each driver's delta computed by swapping only that group from base → scenario; residual = interactions
  - Period selector: All Periods / individual years / individual months
  - Recharts stacked bar waterfall (cumulative spacer + visible delta bar pattern)
  - Driver table: sorted by absolute impact, shows delta ($), % of base, impact bar

## RoE/RoW Assumptions (`src/components/assumptions/RoeRowAssumptions.jsx`)

- Only renders when `model.showRestOfEurope` or `model.showRestOfWorld` are true
- Two rows per table: **NPS Factor** (%) and **Revenue Factor** (%) — one table per enabled geo
- Excel download: separate "RoE Excel" / "RoW Excel" buttons; sheet columns = Period Key, Label, NPS Factor, Revenue Factor
- Excel upload: "Upload RoE" / "Upload RoW" buttons; matches sheet by name (looks for "roe"/"row"), falls back to first sheet; rows matched by Period Key
- Saves to `model.roeAssumptions` / `model.rowAssumptions`

## DirectEntryPanel (`shared.jsx`) — critical behavior

- Saves as `{ inputLevel, combos: { [key]: { input: {period: val}, computed: {period: val} } } }`
- **Initialization**: extracts `comboData.input ?? comboData` (supports both wrapped and flat legacy formats)
- `conversionType`: `"flow"` (÷12 monthly / ×12 yearly), `"stock"` (repeat monthly / avg yearly), `"rate"` (same value — for percentages and prices)
- `showPct=true`: appends `%` suffix to editable cells; values stored and read as 0–100 scale
- Save button disabled when `!dirty`; errors shown inline in red if save throws
- `visibleKeys`: external Set of combo keys — when provided, geo tabs are hidden and only matching combos shown
- Excel download/upload built in; upload matches rows by Period Key, columns by combo label

## Key combo key formats

- **4-part** `g-l-s-p` (geo-lot-seg-product): used by `buildCombos`, funnelCutValues, marketShareAssumptions, epiAssumptions
- **3-part** `g-l-s` (geo-lot-seg): used by progressionAssumptions, operationalAssumptions, traceData

## MongoDB Atlas integration

- Connection string in `backend/.env`. Uses direct hostnames (not `+srv`) to avoid system DNS issues.
- `backend/db/mongodb.js`: lazy connect on startup, `getStatus()` returns `{ state, error }`, `getDb()` returns the db instance.
- **Cloud endpoints**: all under `/api/cloud/`
  - `GET /status` — connection state
  - `POST /save/:id` — upsert one model (with all assumptions) to `models` collection
  - `POST /migrate` — bulk upsert all local models to Atlas (one-time migration)
  - `GET /models` — list cloud models (metadata only)
- **UI**: green/red dot in Dashboard header + "Sync All to Cloud" button; same dot + "Save to Cloud" button in ModelDetail header
- Cloud save is always **explicit** (button click) — never automatic

## Common bugs to avoid

- If Vite shows blank page after rename: delete `node_modules/.vite` and restart
- Ternary branches with 2+ JSX siblings need a `<>` fragment wrapper
- Always call `updateModel()` after a successful PATCH, not just the fetch
- Backend `node index.js` must be run from `backend/` directory, not system32 or project root
- Funnel cut values must be stored as 0–100 (not 0–1 decimals). Engine normalizes old decimal data but UI now shows `%` on editable cells to guide correct input.
- `progressionAssumptions` uses **3-part keys** (g-l-s), not 4-part. `buildAssetCombos` generates these.
- After killing the backend, always verify old process is dead (`netstat -ano | grep :3001`) before restarting — on Windows use PowerShell `Stop-Process -Id <PID> -Force`.
- **Never use `text-violet-100/200` or `text-emerald-100/200/300`** — these are not in the custom Tailwind config and fall back to default near-white values, making text invisible on white card backgrounds. Use `text-violet-700` / `text-emerald-700` instead.
- `roeByLot` / `rowByLot` are derived post-loop in the engine — they are NOT indexed by combo key, only by `lotLabel` and `period`.
