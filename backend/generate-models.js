// Run with: node generate-models.js
// Generates backend/data/models.json with 12 realistic oncology forecast models

const fs   = require("fs");
const path = require("path");

const START_YEAR    = 2026;
const TIMELINE      = 10;
const YEARS         = Array.from({ length: TIMELINE }, (_, i) => String(START_YEAR + i));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function growSeries(start, rate, years = YEARS) {
  const out = {};
  years.forEach((y, i) => { out[y] = Math.round(start * Math.pow(1 + rate, i)); });
  return out;
}

function buildCombos(geos, lots, segs, products) {
  const combos = [];
  for (let g = 0; g < geos.length; g++)
    for (let l = 0; l < lots; l++)
      for (let s = 0; s < segs; s++)
        for (let p = 0; p < products.length; p++)
          combos.push({ key4: `${g}-${l}-${s}-${p}`, key3: `${g}-${l}-${s}`, g, l, s, p });
  return combos;
}

function epiCombo(periodValues) {
  return { input: periodValues, computed: periodValues };
}

function rateCombo(value, years = YEARS) {
  const pv = {};
  years.forEach(y => { pv[y] = value; });
  return { input: pv, computed: pv };
}

function makeEpiAssumptions(geos, lots, segs, epiByGeoLot) {
  const combos = {};
  for (let g = 0; g < geos.length; g++) {
    for (let l = 0; l < lots; l++) {
      for (let s = 0; s < segs; s++) {
        const { start, rate } = epiByGeoLot[g]?.[l] ?? { start: 1000, rate: 0.01 };
        const key = `${g}-${l}-${s}-0`;
        combos[key] = epiCombo(growSeries(start, rate));
      }
    }
  }
  return { inputLevel: "combo", combos };
}

function makeFunnelCuts(epiFunnel, n, lots, segs, cutDefaults) {
  const result = {};
  for (const cut of epiFunnel) {
    if (cut.locked) continue;
    const val = cutDefaults[cut.id] ?? 80;
    result[cut.id] = { inputLevel: "single", combos: {} };
    for (let g = 0; g < n; g++)
      for (let l = 0; l < lots; l++)
        for (let s = 0; s < segs; s++)
          result[cut.id].combos[`${g}-${l}-${s}-0`] = rateCombo(val);
  }
  return result;
}

function makeMarketShare(n, lots, segs, products, shareByLot) {
  const combos = {};
  for (let g = 0; g < n; g++)
    for (let l = 0; l < lots; l++)
      for (let s = 0; s < segs; s++)
        for (let p = 0; p < products.length; p++)
          combos[`${g}-${l}-${s}-${p}`] = rateCombo(shareByLot[l]?.[p] ?? 10);
  return { inputLevel: "single", combos };
}

function makePersistency(n, lots, segs, products, dotByLot) {
  const combos = {};
  for (let g = 0; g < n; g++)
    for (let l = 0; l < lots; l++)
      for (let s = 0; s < segs; s++)
        for (let p = 0; p < products.length; p++)
          combos[`${g}-${l}-${s}-${p}`] = String(dotByLot[l]?.[p] ?? 8);
  return { combos };
}

function makeProgression(n, lots, segs, rate) {
  const combos = {};
  for (let g = 0; g < n; g++)
    for (let l = 0; l < lots - 1; l++)
      for (let s = 0; s < segs; s++)
        combos[`${g}-${l}-${s}`] = rateCombo(rate);
  return { inputLevel: "single", combos };
}

// IMPORTANT: ptrs is always set to 100 here — PTRS applied via model.applyPTRS + model.ptrsValue only
function makeOp(n, lots, segs, { compliance, access, abandonment, vials, grossPrice, gtn }) {
  const mk3 = (val) => {
    const c = {};
    for (let g = 0; g < n; g++)
      for (let l = 0; l < lots; l++)
        for (let s = 0; s < segs; s++)
          c[`${g}-${l}-${s}`] = rateCombo(val);
    return { inputLevel: "single", combos: c };
  };

  return {
    compliance:  mk3(compliance),
    access:      mk3(access),
    abandonment: mk3(abandonment),
    vials:       mk3(vials),
    grossPrice:  mk3(grossPrice),
    gtn:         mk3(gtn),
    ptrs:        mk3(100), // no operational-level PTRS; use model.applyPTRS + model.ptrsValue
  };
}

// ─── Shared funnel templates ──────────────────────────────────────────────────

const FUNNEL_SOLID = [
  { id: "f1", label: "Incidence Pool",           locked: true,  operator: null,         value: null },
  { id: "f2", label: "Diagnosed & Staged",        locked: false, operator: "complement", value: 10 },
  { id: "f3", label: "Eligible for Systemic Tx",  locked: false, operator: "complement", value: 15 },
  { id: "f4", label: "Biomarker-Eligible",         locked: false, operator: "multiply",   value: 100 },
];

const FUNNEL_BIOMARKER = [
  { id: "f1", label: "Incidence Pool",           locked: true,  operator: null,         value: null },
  { id: "f2", label: "Diagnosed & Staged",        locked: false, operator: "complement", value: 10 },
  { id: "f3", label: "Eligible for Systemic Tx",  locked: false, operator: "complement", value: 15 },
  { id: "f4", label: "Biomarker-Eligible (%)",    locked: false, operator: "multiply",   value: 14 },
];

const FUNNEL_HEM = [
  { id: "f1", label: "Incidence Pool",            locked: true,  operator: null,         value: null },
  { id: "f2", label: "Diagnosed",                 locked: false, operator: "complement", value: 5  },
  { id: "f3", label: "Eligible for Systemic Tx",  locked: false, operator: "complement", value: 10 },
  { id: "f4", label: "Histologic Subtype Filter",  locked: false, operator: "multiply",   value: 100 },
];

// ─── EU5 geo scale factors relative to US ────────────────────────────────────

const EU5_SCALE = { DE: 0.22, FR: 0.19, IT: 0.17, ES: 0.13, UK: 0.20 };

function eu5Epi(usStart, rate) {
  return [
    { start: usStart,                                      rate },
    { start: Math.round(usStart * EU5_SCALE.DE), rate: rate - 0.005 },
    { start: Math.round(usStart * EU5_SCALE.FR), rate: rate - 0.005 },
    { start: Math.round(usStart * EU5_SCALE.IT), rate: rate - 0.005 },
    { start: Math.round(usStart * EU5_SCALE.ES), rate: rate - 0.005 },
    { start: Math.round(usStart * EU5_SCALE.UK), rate: rate - 0.005 },
  ];
}

function eu5JpEpi(usStart, rate, jpScale = 0.45) {
  return [
    ...eu5Epi(usStart, rate),
    { start: Math.round(usStart * jpScale), rate: rate - 0.005 },
  ];
}

// ─── Model base ───────────────────────────────────────────────────────────────

function model(overrides) {
  return {
    createdAt: "2026-05-20",
    status: "Active",
    granularity: "Yearly",
    startYear: START_YEAR,
    timelineYears: TIMELINE,
    showRestOfEurope: false,
    showRestOfWorld: false,
    applyIRA: false,
    applyPTRS: true,
    scenarios: [],
    ...overrides,
  };
}

const GEO_US_EU5    = ["US", "Germany", "France", "Italy", "Spain", "UK"];
const GEO_US_EU5_JP = ["US", "Germany", "France", "Italy", "Spain", "UK", "Japan"];
const GEO_US_JP     = ["US", "Japan"];

const models = [];

// ══════════════════════════════════════════════════════════════════════════════
// 1. NEXOLIMAB — NSCLC (Patient Flow, Incidence) 1L+2L  US/EU5
//    Funnel factor: (1-0.10)×(1-0.15)×1.00 = 0.765
//    Target US 1L eligible: ~22,000  → epi input = 22,000/0.765 = 28,758 → 29,000
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_nex_nsclc";
  const geos = GEO_US_EU5; const G = geos.length;
  const lots = 2; const segs = 1; const ptrs = 82;
  const products = ["Nexolimab", "Pembrolizumab+Chemo", "Atezolizumab+Bev", "Chemotherapy"];

  // epi = total NSCLC incidence → funnel whittles to ~22k eligible US 1L
  const epiGeoLot = [
    [{ start: 29000, rate: 0.012 }, { start: 0, rate: 0 }], // US 1L (2L from progression)
    [{ start:  6400, rate: 0.010 }, { start: 0, rate: 0 }],
    [{ start:  5500, rate: 0.010 }, { start: 0, rate: 0 }],
    [{ start:  4930, rate: 0.010 }, { start: 0, rate: 0 }],
    [{ start:  3770, rate: 0.010 }, { start: 0, rate: 0 }],
    [{ start:  5800, rate: 0.010 }, { start: 0, rate: 0 }],
  ];

  const funnel = JSON.parse(JSON.stringify(FUNNEL_SOLID));
  funnel[3].value = 100;

  const shareByLot = [
    [28, 35, 20, 17],  // 1L
    [22, 30, 18, 30],  // 2L
  ];
  const dotByLot = [
    [16, 14, 13, 6],
    [10,  9,  8, 4],
  ];

  models.push(model({
    id, assetName: "Nexolimab", indication: "Non-Small Cell Lung Cancer (NSCLC)",
    modelType: "Patient Flow", epiType: "Incidence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    competitors: products.length - 1, competitorNames: products.slice(1),
    applyIRA: true, iraYear: 2028, iraDiscountRate: 13, iraSmallMolecule: false,
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: makeEpiAssumptions(geos, lots, segs, epiGeoLot),
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 10, f3: 15, f4: 100 }),
    marketShareAssumptions: makeMarketShare(G, lots, segs, products, shareByLot),
    persistencyAssumptions: makePersistency(G, lots, segs, products, dotByLot),
    progressionAssumptions: makeProgression(G, lots, segs, 62),
    operationalAssumptions: makeOp(G, lots, segs, {
      compliance: 90, access: 82, abandonment: 8, vials: 1, grossPrice: 14500, gtn: 14,
    }),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. NEXOLIMAB — TNBC (Patient Segmentation, Incidence) 2L+3L  US/EU5
//    Funnel factor: 0.15×(1-0.08)×(1-0.12) = 0.1214
//    Target US 2L eligible: ~9,500 → epi input = 78,000
//    Target US 3L eligible: ~4,500 → epi input = 37,000
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_nex_tnbc";
  const geos = GEO_US_EU5; const G = geos.length;
  const lots = 2; const segs = 1; const ptrs = 74;
  const products = ["Nexolimab", "Sacituzumab Govitecan", "Pembrolizumab", "Capecitabine"];

  const epiGeoLot = [
    [{ start: 78000, rate: 0.005 }, { start: 37000, rate: 0.005 }],
    [{ start: 17160, rate: 0.003 }, { start:  8140, rate: 0.003 }],
    [{ start: 14820, rate: 0.003 }, { start:  7030, rate: 0.003 }],
    [{ start: 13260, rate: 0.003 }, { start:  6290, rate: 0.003 }],
    [{ start: 10140, rate: 0.003 }, { start:  4810, rate: 0.003 }],
    [{ start: 15600, rate: 0.003 }, { start:  7400, rate: 0.003 }],
  ];

  const funnel = [
    { id: "f1", label: "Incidence Pool",         locked: true,  operator: null,         value: null },
    { id: "f2", label: "TNBC Subtype",            locked: false, operator: "multiply",   value: 15 },
    { id: "f3", label: "Diagnosed & Staged",      locked: false, operator: "complement", value: 8  },
    { id: "f4", label: "Eligible for Tx",         locked: false, operator: "complement", value: 12 },
  ];

  const shareByLot = [
    [20, 32, 18, 30],
    [18, 25, 20, 37],
  ];
  const dotByLot = [
    [9, 8, 7, 3],
    [6, 5, 5, 2],
  ];

  models.push(model({
    id, assetName: "Nexolimab", indication: "Triple-Negative Breast Cancer (TNBC)",
    modelType: "Patient Segmentation", epiType: "Incidence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    competitors: products.length - 1, competitorNames: products.slice(1),
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: makeEpiAssumptions(geos, lots, segs, epiGeoLot),
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 15, f3: 8, f4: 12 }),
    marketShareAssumptions: makeMarketShare(G, lots, segs, products, shareByLot),
    persistencyAssumptions: makePersistency(G, lots, segs, products, dotByLot),
    operationalAssumptions: makeOp(G, lots, segs, {
      compliance: 87, access: 78, abandonment: 10, vials: 1, grossPrice: 16200, gtn: 15,
    }),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. NEXOLIMAB — Gastric/GEJ (Patient Flow, Incidence) 1L+2L  US/EU5/JP
//    Funnel factor: (1-0.10)×(1-0.18)×1.00 = 0.738
//    Target US 1L eligible: ~9,000 → epi input = 12,200
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_nex_gastric";
  const geos = GEO_US_EU5_JP; const G = geos.length;
  const lots = 2; const segs = 1; const ptrs = 69;
  const products = ["Nexolimab", "Nivolumab+FOLFOX4", "FOLFOX", "Ramucirumab+Paclitaxel"];

  const epiGeoLot = [
    [{ start: 12200, rate: 0.008 }, { start: 0, rate: 0 }], // US
    [{ start:  2680, rate: 0.006 }, { start: 0, rate: 0 }],
    [{ start:  2320, rate: 0.006 }, { start: 0, rate: 0 }],
    [{ start:  2070, rate: 0.006 }, { start: 0, rate: 0 }],
    [{ start:  1590, rate: 0.006 }, { start: 0, rate: 0 }],
    [{ start:  2440, rate: 0.006 }, { start: 0, rate: 0 }],
    [{ start:  5490, rate: 0.004 }, { start: 0, rate: 0 }], // JP: higher gastric incidence
  ];

  const funnel = JSON.parse(JSON.stringify(FUNNEL_SOLID));
  funnel[2] = { id: "f3", label: "Eligible for Systemic Tx", locked: false, operator: "complement", value: 18 };
  funnel[3].value = 100;

  const shareByLot = [
    [24, 32, 28, 16],
    [20, 24, 22, 34],
  ];
  const dotByLot = [
    [13, 12, 6, 5],
    [ 8,  7, 5, 3],
  ];

  models.push(model({
    id, assetName: "Nexolimab", indication: "Gastric / GEJ Cancer",
    modelType: "Patient Flow", epiType: "Incidence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    competitors: products.length - 1, competitorNames: products.slice(1),
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: makeEpiAssumptions(geos, lots, segs, epiGeoLot),
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 10, f3: 18, f4: 100 }),
    marketShareAssumptions: makeMarketShare(G, lots, segs, products, shareByLot),
    persistencyAssumptions: makePersistency(G, lots, segs, products, dotByLot),
    progressionAssumptions: makeProgression(G, lots, segs, 58),
    operationalAssumptions: makeOp(G, lots, segs, {
      compliance: 88, access: 75, abandonment: 11, vials: 1, grossPrice: 13800, gtn: 16,
    }),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. VERATOSIN — TNBC (Patient Flow, Incidence) 2L+3L  US/EU5
//    Funnel: 0.15×(1-0.08)×0.70 = 0.0966
//    Target US 2L eligible: ~4,500 → epi input = 47,000
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_ver_tnbc";
  const geos = GEO_US_EU5; const G = geos.length;
  const lots = 2; const segs = 1; const ptrs = 79;
  const products = ["Veratosin", "Sacituzumab Govitecan", "T-DXd (Enhertu)", "Pembrolizumab"];

  const epiGeoLot = [
    [{ start: 47000, rate: 0.005 }, { start: 0, rate: 0 }],
    [{ start: 10340, rate: 0.003 }, { start: 0, rate: 0 }],
    [{ start:  8930, rate: 0.003 }, { start: 0, rate: 0 }],
    [{ start:  7990, rate: 0.003 }, { start: 0, rate: 0 }],
    [{ start:  6110, rate: 0.003 }, { start: 0, rate: 0 }],
    [{ start:  9400, rate: 0.003 }, { start: 0, rate: 0 }],
  ];

  const funnel = [
    { id: "f1", label: "Incidence Pool",              locked: true,  operator: null,         value: null },
    { id: "f2", label: "TNBC Subtype (15%)",           locked: false, operator: "multiply",   value: 15 },
    { id: "f3", label: "Diagnosed & Staged",           locked: false, operator: "complement", value: 8  },
    { id: "f4", label: "HER2-low / TROP-2 positive",   locked: false, operator: "multiply",   value: 70 },
  ];

  const shareByLot = [
    [25, 30, 28, 17],
    [22, 24, 26, 28],
  ];
  const dotByLot = [
    [10, 9, 8, 3],
    [ 6, 6, 5, 2],
  ];

  models.push(model({
    id, assetName: "Veratosin", indication: "Triple-Negative Breast Cancer (TNBC)",
    modelType: "Patient Flow", epiType: "Incidence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    competitors: products.length - 1, competitorNames: products.slice(1),
    applyIRA: false,
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: makeEpiAssumptions(geos, lots, segs, epiGeoLot),
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 15, f3: 8, f4: 70 }),
    marketShareAssumptions: makeMarketShare(G, lots, segs, products, shareByLot),
    persistencyAssumptions: makePersistency(G, lots, segs, products, dotByLot),
    progressionAssumptions: makeProgression(G, lots, segs, 55),
    operationalAssumptions: makeOp(G, lots, segs, {
      compliance: 88, access: 80, abandonment: 9, vials: 1, grossPrice: 18200, gtn: 12,
    }),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. VERATOSIN — Ovarian Cancer (Patient Segmentation, Prevalence) 2L+3L  US/EU5
//    Two segments: BRCA-Mutant (~25%) / BRCA-Wildtype (~75%)
//    Funnel: (1-0.20)×(1-0.15) = 0.68
//    Target US 2L BRCA-mut eligible: ~2,500 → epi input = 3,700
//    BRCA-wt: 3× mutant epi
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_ver_ovarian";
  const geos = GEO_US_EU5; const G = geos.length;
  const lots = 2; const segs = 2; const ptrs = 71;
  const segNames = ["BRCA-Mutant", "BRCA-Wildtype"];
  const products = ["Veratosin", "Olaparib (Lynparza)", "Bevacizumab+Carbo/Pac"];
  const P = products.length;

  // BRCA-mutant base epi per geo per lot
  const epiMut = [
    [{ start: 3700, rate: 0.008 }, { start: 1800, rate: 0.008 }],
    [{ start:  814, rate: 0.006 }, { start:  396, rate: 0.006 }],
    [{ start:  703, rate: 0.006 }, { start:  342, rate: 0.006 }],
    [{ start:  629, rate: 0.006 }, { start:  306, rate: 0.006 }],
    [{ start:  481, rate: 0.006 }, { start:  234, rate: 0.006 }],
    [{ start:  740, rate: 0.006 }, { start:  360, rate: 0.006 }],
  ];
  // BRCA-wildtype: ~3× mutant
  const epiWt = epiMut.map(gl => gl.map(({ start, rate }) => ({ start: Math.round(start * 3), rate })));

  const epiCombos = {};
  for (let g = 0; g < G; g++) {
    for (let l = 0; l < lots; l++) {
      epiCombos[`${g}-${l}-0-0`] = epiCombo(growSeries(epiMut[g][l].start, epiMut[g][l].rate));
      epiCombos[`${g}-${l}-1-0`] = epiCombo(growSeries(epiWt[g][l].start,  epiWt[g][l].rate));
    }
  }

  const funnel = [
    { id: "f1", label: "Prevalence Pool",               locked: true,  operator: null,         value: null },
    { id: "f2", label: "Active Treatment",              locked: false, operator: "complement", value: 20 },
    { id: "f3", label: "Performance Status Eligible",   locked: false, operator: "complement", value: 15 },
  ];

  const shareByLot_s0 = [[35, 40, 25], [28, 35, 37]]; // BRCA-mutant
  const shareByLot_s1 = [[22, 28, 50], [18, 22, 60]]; // BRCA-wildtype

  const msCombos = {};
  for (let g = 0; g < G; g++)
    for (let l = 0; l < lots; l++)
      for (let p = 0; p < P; p++) {
        msCombos[`${g}-${l}-0-${p}`] = rateCombo(shareByLot_s0[l][p]);
        msCombos[`${g}-${l}-1-${p}`] = rateCombo(shareByLot_s1[l][p]);
      }

  const dotByLot = [[14, 16, 6], [9, 12, 4]];
  const persCombos = {};
  for (let g = 0; g < G; g++)
    for (let l = 0; l < lots; l++)
      for (let s = 0; s < segs; s++)
        for (let p = 0; p < P; p++)
          persCombos[`${g}-${l}-${s}-${p}`] = String(dotByLot[l][p]);

  const mk3 = (val) => {
    const c = {};
    for (let g = 0; g < G; g++)
      for (let l = 0; l < lots; l++)
        for (let s = 0; s < segs; s++)
          c[`${g}-${l}-${s}`] = rateCombo(val);
    return { inputLevel: "single", combos: c };
  };

  models.push(model({
    id, assetName: "Veratosin", indication: "Ovarian Cancer",
    modelType: "Patient Segmentation", epiType: "Prevalence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    segmentNames: segNames,
    competitors: P - 1, competitorNames: products.slice(1),
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: { inputLevel: "combo", combos: epiCombos },
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 20, f3: 15 }),
    marketShareAssumptions: { inputLevel: "combo", combos: msCombos },
    persistencyAssumptions: { combos: persCombos },
    operationalAssumptions: {
      compliance: mk3(85), access: mk3(79), abandonment: mk3(10),
      vials: mk3(1), grossPrice: mk3(19500), gtn: mk3(11),
      ptrs: mk3(100), // no operational-level PTRS
    },
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. VERATOSIN — NSCLC (Patient Segmentation, Incidence) 2L+3L  US/JP
//    Funnel: (1-0.10)×0.45×0.22 = 0.0891
//    Target US 2L eligible: ~7,000 → epi input = 79,000
//    Target US 3L eligible: ~3,500 → epi input = 39,000
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_ver_nsclc";
  const geos = GEO_US_JP; const G = geos.length;
  const lots = 2; const segs = 1; const ptrs = 67;
  const products = ["Veratosin", "Docetaxel", "Ramucirumab+Docetaxel", "Pembrolizumab (2L)"];

  const epiGeoLot = [
    [{ start: 79000, rate: 0.012 }, { start: 39000, rate: 0.010 }],
    [{ start: 35500, rate: 0.008 }, { start: 17500, rate: 0.007 }],
  ];

  const funnel = [
    { id: "f1", label: "Incidence Pool",          locked: true,  operator: null,         value: null },
    { id: "f2", label: "Diagnosed & Staged",       locked: false, operator: "complement", value: 10 },
    { id: "f3", label: "2L+ Eligible",             locked: false, operator: "multiply",   value: 45 },
    { id: "f4", label: "HER2-mut / TROP-2 high",   locked: false, operator: "multiply",   value: 22 },
  ];

  const shareByLot = [
    [26, 28, 30, 16],
    [20, 22, 30, 28],
  ];
  const dotByLot = [
    [9, 5, 7, 7],
    [6, 3, 5, 5],
  ];

  models.push(model({
    id, assetName: "Veratosin", indication: "Non-Small Cell Lung Cancer (NSCLC)",
    modelType: "Patient Segmentation", epiType: "Incidence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    competitors: products.length - 1, competitorNames: products.slice(1),
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: makeEpiAssumptions(geos, lots, segs, epiGeoLot),
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 10, f3: 45, f4: 22 }),
    marketShareAssumptions: makeMarketShare(G, lots, segs, products, shareByLot),
    persistencyAssumptions: makePersistency(G, lots, segs, products, dotByLot),
    operationalAssumptions: makeOp(G, lots, segs, {
      compliance: 85, access: 76, abandonment: 12, vials: 1, grossPrice: 17500, gtn: 13,
    }),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. CIBRAFENIB — CRC KRAS G12C (Patient Flow, Incidence) 2L+3L  US/EU5
//    Funnel: (1-0.10)×(1-0.15)×0.14 = 0.1071
//    Target US 2L eligible: ~8,200 → epi input = 77,000
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_cib_crc";
  const geos = GEO_US_EU5; const G = geos.length;
  const lots = 2; const segs = 1; const ptrs = 77;
  const products = ["Cibrafenib", "Sotorasib+Cetuximab", "FOLFIRI+Bevacizumab", "Regorafenib"];

  const epiGeoLot = [
    [{ start: 77000, rate: 0.005 }, { start: 0, rate: 0 }],
    [{ start: 16940, rate: 0.003 }, { start: 0, rate: 0 }],
    [{ start: 14630, rate: 0.003 }, { start: 0, rate: 0 }],
    [{ start: 13090, rate: 0.003 }, { start: 0, rate: 0 }],
    [{ start: 10010, rate: 0.003 }, { start: 0, rate: 0 }],
    [{ start: 15400, rate: 0.003 }, { start: 0, rate: 0 }],
  ];

  const funnel = JSON.parse(JSON.stringify(FUNNEL_BIOMARKER));
  funnel[3] = { id: "f4", label: "KRAS G12C Mutant (~14%)", locked: false, operator: "multiply", value: 14 };

  const shareByLot = [
    [30, 28, 28, 14],
    [25, 22, 32, 21],
  ];
  const dotByLot = [
    [10, 9, 5, 3],
    [ 7, 7, 4, 2],
  ];

  models.push(model({
    id, assetName: "Cibrafenib", indication: "Colorectal Cancer (CRC) — KRAS G12C",
    modelType: "Patient Flow", epiType: "Incidence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    competitors: products.length - 1, competitorNames: products.slice(1),
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: makeEpiAssumptions(geos, lots, segs, epiGeoLot),
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 10, f3: 15, f4: 14 }),
    marketShareAssumptions: makeMarketShare(G, lots, segs, products, shareByLot),
    persistencyAssumptions: makePersistency(G, lots, segs, products, dotByLot),
    progressionAssumptions: makeProgression(G, lots, segs, 60),
    operationalAssumptions: makeOp(G, lots, segs, {
      compliance: 86, access: 80, abandonment: 9, vials: 1, grossPrice: 13200, gtn: 18,
    }),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. CIBRAFENIB — NSCLC KRAS G12C (Patient Segmentation, Incidence) 2L  US/EU5/JP
//    Funnel: (1-0.10)×(1-0.15)×0.13 = 0.0994
//    Target US eligible: ~11,000 → epi input = 111,000
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_cib_nsclc";
  const geos = GEO_US_EU5_JP; const G = geos.length;
  const lots = 1; const segs = 1; const ptrs = 81;
  const products = ["Cibrafenib", "Sotorasib", "Adagrasib", "Docetaxel"];

  const epiGeoLot = [
    [{ start: 111000, rate: 0.012 }],
    [{ start:  24420, rate: 0.010 }],
    [{ start:  21090, rate: 0.010 }],
    [{ start:  18870, rate: 0.010 }],
    [{ start:  14430, rate: 0.010 }],
    [{ start:  22200, rate: 0.010 }],
    [{ start:  50000, rate: 0.008 }],
  ];

  const funnel = JSON.parse(JSON.stringify(FUNNEL_BIOMARKER));
  funnel[3] = { id: "f4", label: "KRAS G12C Mutant (~13%)", locked: false, operator: "multiply", value: 13 };

  const shareByLot = [
    [34, 28, 22, 16],
  ];
  const dotByLot = [
    [11, 10, 9, 4],
  ];

  models.push(model({
    id, assetName: "Cibrafenib", indication: "Non-Small Cell Lung Cancer (NSCLC) — KRAS G12C",
    modelType: "Patient Segmentation", epiType: "Incidence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    competitors: products.length - 1, competitorNames: products.slice(1),
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: makeEpiAssumptions(geos, lots, segs, epiGeoLot),
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 10, f3: 15, f4: 13 }),
    marketShareAssumptions: makeMarketShare(G, lots, segs, products, shareByLot),
    persistencyAssumptions: makePersistency(G, lots, segs, products, dotByLot),
    operationalAssumptions: makeOp(G, lots, segs, {
      compliance: 90, access: 83, abandonment: 7, vials: 1, grossPrice: 14000, gtn: 17,
    }),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. CIBRAFENIB — PDAC (Patient Segmentation, Incidence) 2L  US/EU5
//    Niche: KRAS G12C ~2% of PDAC; small but non-zero revenue
//    Funnel: (1-0.25)×(1-0.20)×0.02 = 0.012
//    US eligible: ~720 (niche indication, ~$25-35M US peak)
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_cib_pdac";
  const geos = GEO_US_EU5; const G = geos.length;
  const lots = 1; const segs = 1; const ptrs = 58;
  const products = ["Cibrafenib", "FOLFIRINOX", "Gemcitabine+nab-Paclitaxel", "Olaparib"];

  const epiGeoLot = [
    [{ start: 61000, rate: 0.018 }],
    [{ start: 13420, rate: 0.015 }],
    [{ start: 11590, rate: 0.015 }],
    [{ start: 10370, rate: 0.015 }],
    [{ start:  7930, rate: 0.015 }],
    [{ start: 12200, rate: 0.015 }],
  ];

  const funnel = [
    { id: "f1", label: "Incidence Pool",                      locked: true,  operator: null,         value: null },
    { id: "f2", label: "Diagnosed at 2L-Eligible Stage",      locked: false, operator: "complement", value: 25 },
    { id: "f3", label: "Performance Status ≥1",               locked: false, operator: "complement", value: 20 },
    { id: "f4", label: "KRAS G12C Mutant (~2%)",              locked: false, operator: "multiply",   value: 2  },
  ];

  const shareByLot = [
    [38, 26, 25, 11],
  ];
  const dotByLot = [
    [8, 5, 4, 10],
  ];

  models.push(model({
    id, assetName: "Cibrafenib", indication: "Pancreatic Ductal Adenocarcinoma (PDAC)",
    modelType: "Patient Segmentation", epiType: "Incidence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    competitors: products.length - 1, competitorNames: products.slice(1),
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: makeEpiAssumptions(geos, lots, segs, epiGeoLot),
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 25, f3: 20, f4: 2 }),
    marketShareAssumptions: makeMarketShare(G, lots, segs, products, shareByLot),
    persistencyAssumptions: makePersistency(G, lots, segs, products, dotByLot),
    operationalAssumptions: makeOp(G, lots, segs, {
      compliance: 82, access: 72, abandonment: 14, vials: 1, grossPrice: 12800, gtn: 21,
    }),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. ELOTUZAVIR — DLBCL (Patient Flow, Incidence) 2L+3L  US/EU5
//     Funnel: (1-0.05)×(1-0.10)×1.00 = 0.855
//     Target US 2L eligible: ~15,000 → epi input = 17,500
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_elo_dlbcl";
  const geos = GEO_US_EU5; const G = geos.length;
  const lots = 2; const segs = 1; const ptrs = 72;
  const products = ["Elotuzavir", "R-CHOP Salvage", "Polatuzumab+BR", "Axicabtagene (CAR-T)"];

  const epiGeoLot = [
    [{ start: 17500, rate: 0.006 }, { start: 0, rate: 0 }],
    [{ start:  3850, rate: 0.004 }, { start: 0, rate: 0 }],
    [{ start:  3325, rate: 0.004 }, { start: 0, rate: 0 }],
    [{ start:  2975, rate: 0.004 }, { start: 0, rate: 0 }],
    [{ start:  2275, rate: 0.004 }, { start: 0, rate: 0 }],
    [{ start:  3500, rate: 0.004 }, { start: 0, rate: 0 }],
  ];

  const funnel = JSON.parse(JSON.stringify(FUNNEL_HEM));
  funnel[3] = { id: "f4", label: "DLBCL Histologic Subtype", locked: false, operator: "multiply", value: 100 };

  const shareByLot = [
    [22, 28, 32, 18],
    [26, 20, 26, 28],
  ];
  const dotByLot = [
    [7, 4, 6, 0],
    [5, 3, 4, 0],
  ];

  models.push(model({
    id, assetName: "Elotuzavir", indication: "Diffuse Large B-Cell Lymphoma (DLBCL)",
    modelType: "Patient Flow", epiType: "Incidence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    competitors: products.length - 1, competitorNames: products.slice(1),
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: makeEpiAssumptions(geos, lots, segs, epiGeoLot),
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 5, f3: 10, f4: 100 }),
    marketShareAssumptions: makeMarketShare(G, lots, segs, products, shareByLot),
    persistencyAssumptions: makePersistency(G, lots, segs, products, dotByLot),
    progressionAssumptions: makeProgression(G, lots, segs, 50),
    operationalAssumptions: makeOp(G, lots, segs, {
      compliance: 89, access: 77, abandonment: 10, vials: 2, grossPrice: 22000, gtn: 10,
    }),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. ELOTUZAVIR — TNBC (Patient Segmentation, Incidence) 1L+2L  US/EU5
//     Two segments: PD-L1 Positive (40%) / PD-L1 Negative (60%)
//     Funnel: 0.15×(1-0.10) = 0.135
//     Target US 1L PD-L1+ eligible: ~3,100 → PD-L1+ epi pool = 22,963 → base = 57,000
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_elo_tnbc";
  const geos = GEO_US_EU5; const G = geos.length;
  const lots = 2; const segs = 2; const ptrs = 75;
  const segNames = ["PD-L1 Positive (CPS≥10)", "PD-L1 Negative (CPS<10)"];
  const products = ["Elotuzavir", "Pembrolizumab+Chemo", "T-DXd (Enhertu)", "Sacituzumab Govitecan"];
  const P = products.length;

  // epiBase: total TNBC incidence. Combos will be split 40%/60% for PD-L1+/-
  const epiBase = [
    [{ start: 57000, rate: 0.005 }, { start: 33000, rate: 0.005 }],
    [{ start: 12540, rate: 0.003 }, { start:  7260, rate: 0.003 }],
    [{ start: 10830, rate: 0.003 }, { start:  6270, rate: 0.003 }],
    [{ start:  9690, rate: 0.003 }, { start:  5610, rate: 0.003 }],
    [{ start:  7410, rate: 0.003 }, { start:  4290, rate: 0.003 }],
    [{ start: 11400, rate: 0.003 }, { start:  6600, rate: 0.003 }],
  ];

  const epiCombos = {};
  for (let g = 0; g < G; g++) {
    for (let l = 0; l < lots; l++) {
      const { start, rate } = epiBase[g][l];
      epiCombos[`${g}-${l}-0-0`] = epiCombo(growSeries(Math.round(start * 0.4), rate)); // PD-L1+
      epiCombos[`${g}-${l}-1-0`] = epiCombo(growSeries(Math.round(start * 0.6), rate)); // PD-L1-
    }
  }

  const funnel = [
    { id: "f1", label: "Incidence Pool",        locked: true,  operator: null,         value: null },
    { id: "f2", label: "TNBC Subtype (15%)",     locked: false, operator: "multiply",   value: 15 },
    { id: "f3", label: "Fit for Systemic Tx",    locked: false, operator: "complement", value: 10 },
  ];

  const msComboS0 = [[32, 38, 18, 12], [24, 28, 26, 22]]; // PD-L1+
  const msComboS1 = [[15, 22, 32, 31], [12, 18, 30, 40]]; // PD-L1-

  const msCombos = {};
  for (let g = 0; g < G; g++)
    for (let l = 0; l < lots; l++)
      for (let p = 0; p < P; p++) {
        msCombos[`${g}-${l}-0-${p}`] = rateCombo(msComboS0[l][p]);
        msCombos[`${g}-${l}-1-${p}`] = rateCombo(msComboS1[l][p]);
      }

  const dotBase = [[14, 13, 11, 5], [9, 8, 8, 3]];
  const persCombos = {};
  for (let g = 0; g < G; g++)
    for (let l = 0; l < lots; l++)
      for (let s = 0; s < segs; s++)
        for (let p = 0; p < P; p++)
          persCombos[`${g}-${l}-${s}-${p}`] = String(dotBase[l][p]);

  const mk3 = (val) => {
    const c = {};
    for (let g = 0; g < G; g++)
      for (let l = 0; l < lots; l++)
        for (let s = 0; s < segs; s++)
          c[`${g}-${l}-${s}`] = rateCombo(val);
    return { inputLevel: "single", combos: c };
  };

  models.push(model({
    id, assetName: "Elotuzavir", indication: "Triple-Negative Breast Cancer (TNBC)",
    modelType: "Patient Segmentation", epiType: "Incidence",
    geographies: geos, linesOfTherapy: lots, segments: segs, segmentNames: segNames,
    competitors: P - 1, competitorNames: products.slice(1),
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: { inputLevel: "combo", combos: epiCombos },
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 15, f3: 10 }),
    marketShareAssumptions: { inputLevel: "combo", combos: msCombos },
    persistencyAssumptions: { combos: persCombos },
    operationalAssumptions: {
      compliance: mk3(88), access: mk3(81), abandonment: mk3(9),
      vials: mk3(2), grossPrice: mk3(24500), gtn: mk3(10),
      ptrs: mk3(100), // no operational-level PTRS
    },
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. ELOTUZAVIR — Ovarian Cancer (Patient Flow, Prevalence) 1L+2L  US/EU5
//     Funnel: (1-0.25)×(1-0.12) = 0.66
//     Target US 1L eligible: ~18,000 → epi input = 27,000
//     2L: ~9,000 → epi input = 13,500
// ══════════════════════════════════════════════════════════════════════════════
{
  const id = "m_elo_ovarian";
  const geos = GEO_US_EU5; const G = geos.length;
  const lots = 2; const segs = 1; const ptrs = 66;
  const products = ["Elotuzavir", "Bevacizumab+Carbo/Pac", "Olaparib (PARP)", "Carboplatin+Paclitaxel"];

  const epiGeoLot = [
    [{ start: 27000, rate: 0.009 }, { start: 13500, rate: 0.009 }],
    [{ start:  5940, rate: 0.007 }, { start:  2970, rate: 0.007 }],
    [{ start:  5130, rate: 0.007 }, { start:  2565, rate: 0.007 }],
    [{ start:  4590, rate: 0.007 }, { start:  2295, rate: 0.007 }],
    [{ start:  3510, rate: 0.007 }, { start:  1755, rate: 0.007 }],
    [{ start:  5400, rate: 0.007 }, { start:  2700, rate: 0.007 }],
  ];

  const funnel = [
    { id: "f1", label: "Prevalence Pool",              locked: true,  operator: null,         value: null },
    { id: "f2", label: "Receiving Active Treatment",   locked: false, operator: "complement", value: 25 },
    { id: "f3", label: "Performance Status Eligible",  locked: false, operator: "complement", value: 12 },
  ];

  const shareByLot = [
    [20, 35, 30, 15],
    [28, 26, 28, 18],
  ];
  const dotByLot = [
    [18, 14, 18, 8],
    [12, 10, 14, 5],
  ];

  models.push(model({
    id, assetName: "Elotuzavir", indication: "Ovarian Cancer",
    modelType: "Patient Flow", epiType: "Prevalence",
    geographies: geos, linesOfTherapy: lots, segments: segs,
    competitors: products.length - 1, competitorNames: products.slice(1),
    ptrsValue: ptrs,
    epiFunnel: funnel,
    epiAssumptions: makeEpiAssumptions(geos, lots, segs, epiGeoLot),
    funnelCutValues: makeFunnelCuts(funnel, G, lots, segs, { f2: 25, f3: 12 }),
    marketShareAssumptions: makeMarketShare(G, lots, segs, products, shareByLot),
    persistencyAssumptions: makePersistency(G, lots, segs, products, dotByLot),
    progressionAssumptions: makeProgression(G, lots, segs, 48),
    operationalAssumptions: makeOp(G, lots, segs, {
      compliance: 86, access: 78, abandonment: 11, vials: 2, grossPrice: 26000, gtn: 10,
    }),
  }));
}

// ─── Write output ─────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, "data", "models.json");
fs.writeFileSync(outPath, JSON.stringify(models, null, 2), "utf-8");
console.log(`✓ Written ${models.length} models to ${outPath}`);
models.forEach(m => console.log(`  · ${m.id}: ${m.assetName} — ${m.indication}`));
