# OncoCast — Project Context for Claude

AI-native oncology pipeline forecasting platform. Replaces Excel-based models with a structured, assumption-driven UI.

## Running the app

```bash
# Terminal 1 — backend (must be in backend/ directory)
cd "C:\Users\MukulSuri\OneDrive - Blue Matter\Desktop\oncology-forecast\backend"
node index.js
# → http://localhost:3001

# Terminal 2 — frontend
cd "C:\Users\MukulSuri\OneDrive - Blue Matter\Desktop\oncology-forecast"
npm run dev
# → http://localhost:5174
```

## Stack

- React + Vite, Tailwind CSS 3 (dark slate/violet theme)
- Context API (`ForecastContext` in `src/store/forecastStore.jsx`) — no Redux
- Express backend on port 3001, persists to `backend/data/models.json`
- SheetJS (`xlsx`) for Excel download/upload
- Recharts for live epi chart

## Key files

| File | Purpose |
|------|---------|
| `src/store/forecastStore.jsx` | Global state: models, view, activeModel, addModel, saveEditedModel, deleteModel, updateModel |
| `src/components/Dashboard.jsx` | Model card grid with edit/delete per card |
| `src/components/NewModelWizard.jsx` | 7-step wizard (create + edit mode) |
| `src/components/ModelDetail.jsx` | Tabbed model view: Assumptions / Forecast / Scenarios |
| `src/components/assumptions/EpiAssumptions.jsx` | Wide-format epi spreadsheet + live chart |
| `backend/index.js` | Express: GET/POST/PATCH/DELETE /api/models |

## Model object shape

```js
{
  id, createdAt, assetName, indication,
  modelType, epiType, granularity,       // "Yearly"|"Monthly"
  startYear, timelineYears,
  epiFunnel: [
    // Each step: { id, label, description, locked, operator, value }
    // operator: "complement"|"multiply"|"divide"|"add"|"subtract"
    // locked:true step is the anchor (epi pool), operator/value are null
  ],
  geographies, showRestOfEurope, showRestOfWorld,
  linesOfTherapy, segments, competitors, competitorsBySegment,
  applyIRA, iraYear, iraDiscountRate, iraSmallMolecule,
  applyPTRS, ptrsValue,
  epiAssumptions: { method, inputLevel, startValue, growthRate, periodValues, computedValues },
}
```

## Wizard steps

1. Asset & Indication
2. Model Configuration (type, epi type, granularity, timeline)
3. **Epidemiology Funnel** — operator (1−x / × / ÷ / + / −), default value, editable label per cut
4. Geographies (G20, grouped by region)
5. Therapy & Segments (LOT, segments, competitors)
6. Revenue Adjustments (IRA + PTRS)
7. Review & Create

Edit mode: wizard pre-fills from `editingModel`; uses PATCH instead of POST.

## EpiAssumptions notes

- Two methods: Growth Rate or Direct Entry
- Input level can differ from model level — shows TWO separate tables when mismatch (each with own correct period headers)
- `SingleLevelTable` renders one table with correct yearly/monthly headers + one `SpreadsheetRow`
- Save must call both PATCH (backend) and `updateModel()` (in-memory store) or changes appear lost on UI

## Common bugs to avoid

- If Vite shows blank page after rename: delete `node_modules/.vite` and restart
- Ternary branches with 2+ JSX siblings need a `<>` fragment wrapper
- Always call `updateModel()` after a successful PATCH, not just the fetch
- Backend `node index.js` must be run from `backend/` directory, not system32 or project root

## What's still locked / coming soon

- Market Share by Line, Duration of Therapy, Pricing & Gross-to-Net
- Forecast Output tab (revenue waterfall)
- Scenarios tab (natural language scenario runner)
