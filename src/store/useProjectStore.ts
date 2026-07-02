"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AllocationRule, AssetRow, ProjectInfo, Scenario } from "@/types";
import { sampleScenario } from "@/lib/sampleData";

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
interface Store {
  scenarios: Scenario[]; activeId: string;
  active: () => Scenario;
  updateProject: (patch: Partial<ProjectInfo>) => void;
  updateRow: (id: string, patch: Partial<AssetRow>) => void;
  addRow: () => void; duplicateRow: (id: string) => void; deleteRow: (id: string) => void;
  addAllocation: (rule: Omit<AllocationRule, "id">) => void; deleteAllocation: (id: string) => void;
  createScenario: () => void; duplicateScenario: () => void; deleteScenario: () => void;
  renameScenario: (name: string) => void; setActive: (id: string) => void; replaceActive: (scenario: Scenario) => void;
}

const updateActive = (state: Store, fn: (scenario: Scenario) => Scenario) => ({
  scenarios: state.scenarios.map(s => s.id === state.activeId ? { ...fn(s), updatedAt: new Date().toISOString() } : s)
});

export const useProjectStore = create<Store>()(persist((set, get) => ({
  scenarios: [sampleScenario], activeId: sampleScenario.id,
  active: () => get().scenarios.find(s => s.id === get().activeId) || get().scenarios[0],
  updateProject: patch => set(state => updateActive(state, s => ({ ...s, project: { ...s.project, ...patch } }))),
  updateRow: (id, patch) => set(state => updateActive(state, s => ({ ...s, rows: s.rows.map(r => r.id === id ? { ...r, ...patch } : r) }))),
  addRow: () => set(state => updateActive(state, s => ({ ...s, rows: [...s.rows, { id: uid(), name: "新业态", kind: "销售", buildingArea: 0, governmentArea: 0, efficiencyRate: 0, saleArea: 0, salePrice: 0, unitCost: 0, manualManagementFee: null, manualSalesFee: null, manualSecondaryAllocation: 0, collection: { firstSaleMonth: 1, deliveryMonth: 24, totalUnits: 0, monthlyAbsorptionUnits: 0, downPaymentRate: .3, monthlyCollectionRate: .05, tailInstallmentMonths: 3 } }] }))),
  duplicateRow: id => set(state => updateActive(state, s => ({ ...s, rows: s.rows.flatMap(r => r.id === id ? [r, { ...r, id: uid(), name: `${r.name} 副本` }] : [r]) }))),
  deleteRow: id => set(state => updateActive(state, s => ({ ...s, rows: s.rows.filter(r => r.id !== id), allocations: s.allocations.filter(a => !a.sourceIds.includes(id) && !a.targetIds.includes(id)) }))),
  addAllocation: rule => set(state => updateActive(state, s => ({ ...s, allocations: [...s.allocations, { ...rule, id: uid() }] }))),
  deleteAllocation: id => set(state => updateActive(state, s => ({ ...s, allocations: s.allocations.filter(a => a.id !== id) }))),
  createScenario: () => set(state => { const next = { ...sampleScenario, id: uid(), name: "新测算方案", updatedAt: new Date().toISOString(), rows: sampleScenario.rows.map(r => ({ ...r, id: uid() })), allocations: [] }; return { scenarios: [...state.scenarios, next], activeId: next.id }; }),
  duplicateScenario: () => set(state => { const current = get().active(); const next = { ...structuredClone(current), id: uid(), name: `${current.name} 副本`, updatedAt: new Date().toISOString() }; return { scenarios: [...state.scenarios, next], activeId: next.id }; }),
  deleteScenario: () => set(state => { if (state.scenarios.length === 1) return state; const list = state.scenarios.filter(s => s.id !== state.activeId); return { scenarios: list, activeId: list[0].id }; }),
  renameScenario: name => set(state => updateActive(state, s => ({ ...s, name, project: { ...s.project, name } }))),
  setActive: activeId => set({ activeId }),
  replaceActive: scenario => set(state => ({ scenarios: state.scenarios.map(s => s.id === state.activeId ? { ...scenario, id: state.activeId } : s) }))
}), { name: "property-investment-scenarios-v1", partialize: state => ({ scenarios: state.scenarios, activeId: state.activeId }) }));
