"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AllocationRule, AssetRow, ProjectInfo, Scenario } from "@/types";
import { sampleScenario } from "@/lib/sampleData";
import { defaultCollectionLogic, normalizeAssetKind, PROJECTION_MONTHS } from "@/lib/calculationEngine";

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const createBlankScenario = (): Scenario => ({
  id: uid(),
  name: "空白方案",
  updatedAt: new Date().toISOString(),
  project: {
    name: "空白方案",
    location: "",
    landArea: 0,
    landTotalPrice: 0,
    totalBuildingArea: 0,
    saleableArea: 0,
    heldArea: 0,
    governmentArea: 0,
    vatRate: 0.15,
    managementRate: 0.02,
    salesRate: 0.05,
    shareholderInterestRate: 0.08,
    collectionDownPaymentRate: 0.3,
    collectionMonthlyRate: 0.05,
    collectionPreDeliveryPaymentRate: 0.8,
    collectionTailInstallmentMonths: 3,
    fullPaymentRate: 0,
    fullPaymentDiscountRate: 0,
    deliveryMonth: 24,
    phase2StartMonth: 25,
    phase2DeliveryMonth: 48,
    trialOperationMonths: 3,
    hotelAverageDailyRate: 800,
    fourStarHotelAverageDailyRate: 600,
    fiveStarHotelAverageDailyRate: 900,
    fourStarHotelOpeningCost: 0,
    fiveStarHotelOpeningCost: 0,
    mallOpeningCost: 0,
    commercialMonthlyRent: 150,
    hotelOccupancyRate: 0.7,
    commercialOccupancyRate: 0.85,
    annualOperatingCostRate: 0.35,
    holdingDiscountRate: 0.08,
    currencyUnit: "万元",
    includeHoldingReturns: false
  },
  rows: [],
  allocations: []
});
type UndoSnapshot = { scenarios: Scenario[]; activeId: string };
interface Store {
  scenarios: Scenario[]; activeId: string;
  undoStack: UndoSnapshot[];
  active: () => Scenario;
  updateProject: (patch: Partial<ProjectInfo>) => void;
  updateRow: (id: string, patch: Partial<AssetRow>) => void;
  addRow: () => void; duplicateRow: (id: string) => void; deleteRow: (id: string) => void; reorderRow: (sourceId: string, targetId: string) => void;
  addAllocation: (rule: Omit<AllocationRule, "id">) => void; deleteAllocation: (id: string) => void;
  createScenario: () => void; duplicateScenario: () => void; deleteScenario: () => void;
  renameScenario: (name: string) => void; setActive: (id: string) => void; replaceActive: (scenario: Scenario) => void; importScenario: (scenario: Scenario) => void;
  undo: () => void;
}

const snapshot = (state: Pick<Store, "scenarios" | "activeId">): UndoSnapshot => ({
  scenarios: structuredClone(state.scenarios),
  activeId: state.activeId
});
const pushUndo = (state: Store) => [...state.undoStack, snapshot(state)].slice(-50);
const projectDefaults: ProjectInfo = createBlankScenario().project;
const normalizeProject = (project: ProjectInfo): ProjectInfo => ({ ...projectDefaults, ...project });
const uniqueScenarioName = (baseName: string, scenarios: Scenario[]) => {
  const cleanName = baseName.trim() || "导入方案";
  const used = new Set(scenarios.flatMap(scenario => [scenario.name, scenario.project.name].filter(Boolean)));
  if (!used.has(cleanName)) return cleanName;
  let index = 2;
  while (used.has(`${cleanName} (${index})`)) index += 1;
  return `${cleanName} (${index})`;
};
const normalizeScenario = (scenario: Scenario): Scenario => ({
  ...scenario,
  project: normalizeProject(scenario.project),
  rows: scenario.rows.map(row => {
    const project = normalizeProject(scenario.project);
    return {
      ...row,
      manualManagementFee: null,
      manualSalesFee: null,
      collection: row.collection ? {
        ...row.collection,
        downPaymentRate: project.collectionDownPaymentRate ?? .3,
        monthlyCollectionRate: project.collectionMonthlyRate ?? .05,
        tailInstallmentMonths: project.collectionTailInstallmentMonths ?? 3
      } : row.collection
    };
  })
});
const updateActive = (state: Store, fn: (scenario: Scenario) => Scenario) => ({
  scenarios: state.scenarios.map(s => s.id === state.activeId ? { ...fn(s), updatedAt: new Date().toISOString() } : s),
  undoStack: pushUndo(state)
});

export const useProjectStore = create<Store>()(persist((set, get) => ({
  scenarios: [sampleScenario], activeId: sampleScenario.id, undoStack: [],
  active: () => get().scenarios.find(s => s.id === get().activeId) || get().scenarios[0],
  updateProject: patch => set(state => updateActive(state, s => {
    const nextProject = { ...s.project, ...patch };
    if (patch.deliveryMonth !== undefined) nextProject.deliveryMonth = Math.max(1, Math.min(PROJECTION_MONTHS, Math.round(patch.deliveryMonth)));
    if (patch.phase2StartMonth !== undefined) nextProject.phase2StartMonth = Math.max(1, Math.min(PROJECTION_MONTHS, Math.round(patch.phase2StartMonth)));
    if (patch.phase2DeliveryMonth !== undefined) nextProject.phase2DeliveryMonth = Math.max(1, Math.min(PROJECTION_MONTHS, Math.round(patch.phase2DeliveryMonth)));
    return { ...s, project: nextProject };
  })),
  updateRow: (id, patch) => set(state => updateActive(state, s => ({ ...s, rows: s.rows.map(row => {
    if (row.id !== id) return row;
    const next = { ...row, ...patch };
    if (patch.collection?.totalUnits !== undefined) next.unitCount = patch.collection.totalUnits;
    if (patch.holding?.roomCount !== undefined) next.unitCount = patch.holding.roomCount;
    if (patch.kind === "销售" && normalizeAssetKind(row) !== "销售") {
      next.collection = { ...defaultCollectionLogic(next, s.project), deliveryMonth: s.project.deliveryMonth || 24 };
    }
    return next;
  }) }))),
  addRow: () => set(state => updateActive(state, s => ({ ...s, rows: [...s.rows, { id: uid(), name: "新业态", kind: "销售", buildingArea: 0, governmentArea: 0, efficiencyRate: 0, saleArea: 0, salePrice: 0, unitCost: 0, manualManagementFee: null, manualSalesFee: null, manualSecondaryAllocation: 0, collection: { firstSaleMonth: 1, deliveryMonth: s.project.deliveryMonth || 24, totalUnits: 0, monthlyAbsorptionUnits: 0, downPaymentRate: s.project.collectionDownPaymentRate ?? .3, monthlyCollectionRate: s.project.collectionMonthlyRate ?? .05, tailInstallmentMonths: s.project.collectionTailInstallmentMonths ?? 3 } }] }))),
  duplicateRow: id => set(state => updateActive(state, s => ({ ...s, rows: s.rows.flatMap(r => r.id === id ? [r, { ...r, id: uid(), name: `${r.name} 副本` }] : [r]) }))),
  deleteRow: id => set(state => updateActive(state, s => ({ ...s, rows: s.rows.filter(r => r.id !== id), allocations: s.allocations.filter(a => !a.sourceIds.includes(id) && !a.targetIds.includes(id)) }))),
  reorderRow: (sourceId, targetId) => set(state => updateActive(state, s => {
    const sourceIndex = s.rows.findIndex(row => row.id === sourceId);
    const targetIndex = s.rows.findIndex(row => row.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return s;
    const rows = [...s.rows];
    const [moved] = rows.splice(sourceIndex, 1);
    rows.splice(targetIndex, 0, moved);
    return { ...s, rows };
  })),
  addAllocation: rule => set(state => updateActive(state, s => ({ ...s, allocations: [...s.allocations, { ...rule, id: uid() }] }))),
  deleteAllocation: id => set(state => updateActive(state, s => ({ ...s, allocations: s.allocations.filter(a => a.id !== id) }))),
  createScenario: () => set(state => { const next = createBlankScenario(); return { scenarios: [...state.scenarios, next], activeId: next.id, undoStack: pushUndo(state) }; }),
  duplicateScenario: () => set(state => { const current = get().active(); const next = { ...structuredClone(current), id: uid(), name: `${current.name} 副本`, updatedAt: new Date().toISOString() }; return { scenarios: [...state.scenarios, next], activeId: next.id, undoStack: pushUndo(state) }; }),
  deleteScenario: () => set(state => { if (state.scenarios.length === 1) return state; const list = state.scenarios.filter(s => s.id !== state.activeId); return { scenarios: list, activeId: list[0].id, undoStack: pushUndo(state) }; }),
  renameScenario: name => set(state => updateActive(state, s => ({ ...s, name, project: { ...s.project, name } }))),
  setActive: activeId => set({ activeId }),
  replaceActive: scenario => set(state => ({ scenarios: state.scenarios.map(s => s.id === state.activeId ? { ...scenario, id: state.activeId } : s), undoStack: pushUndo(state) })),
  importScenario: scenario => set(state => {
    const name = uniqueScenarioName(scenario.project.name || scenario.name, state.scenarios);
    const next = normalizeScenario({ ...scenario, id: uid(), name, project: { ...scenario.project, name }, updatedAt: new Date().toISOString() });
    return { scenarios: [...state.scenarios, next], activeId: next.id, undoStack: pushUndo(state) };
  }),
  undo: () => set(state => {
    const previous = state.undoStack[state.undoStack.length - 1];
    if (!previous) return state;
    return { scenarios: previous.scenarios, activeId: previous.activeId, undoStack: state.undoStack.slice(0, -1) };
  })
}), {
  name: "property-investment-scenarios-v1",
  partialize: state => ({ scenarios: state.scenarios, activeId: state.activeId }),
  merge: (persisted, current) => {
    const saved = persisted as Partial<Pick<Store, "scenarios" | "activeId">>;
    const scenarios = (saved.scenarios?.length ? saved.scenarios : current.scenarios).map(normalizeScenario);
    const activeId = scenarios.some(scenario => scenario.id === saved.activeId) ? saved.activeId! : scenarios[0]?.id ?? current.activeId;
    return { ...current, scenarios, activeId };
  }
}));
