import { AssetRow, Scenario } from "@/types";
import { defaultCollectionLogic, normalizeAssetKind } from "@/lib/calculationEngine";

const headers: Record<string, keyof AssetRow> = {
  "业态": "name", "类型": "kind", "建筑面积（平方米）": "buildingArea", "给政府面积（平方米）": "governmentArea", "分配政府面积（平方米）": "governmentArea",
  "得房率": "efficiencyRate", "销售面积（平方米）": "saleArea", "销售单价（元/平方米）": "salePrice", "单方成本（元/平方米）": "unitCost",
  "总套数/客房数": "unitCount", "客房数": "unitCount",
  "管理费用覆盖（万元）": "manualManagementFee", "销售费用覆盖（万元）": "manualSalesFee"
};

export async function exportExcel(scenario: Scenario, calculated: Record<string, unknown>[]) {
  const XLSX = await import("xlsx");
  const governmentMode = scenario.rows.some(row => normalizeAssetKind(row) === "给政府");
  const inputSheet = XLSX.utils.json_to_sheet(scenario.rows.map(row => ({
    "业态": row.name, "类型": normalizeAssetKind(row), "建筑面积（平方米）": row.buildingArea,
    ...(governmentMode ? { "给政府面积（平方米）": normalizeAssetKind(row)==="给政府"?row.buildingArea:0 } : {}),
    "得房率": row.efficiencyRate ?? (row.buildingArea ? row.saleArea / row.buildingArea : 0), "销售面积（平方米）": row.buildingArea * (row.efficiencyRate ?? (row.buildingArea ? row.saleArea / row.buildingArea : 0)), "销售单价（元/平方米）": row.salePrice, "单方成本（元/平方米）": row.unitCost,
    "总套数/客房数": row.unitCount ?? row.collection?.totalUnits ?? row.holding?.roomCount ?? 0,
    "管理费用覆盖（万元）": row.manualManagementFee, "销售费用覆盖（万元）": row.manualSalesFee,
    "首售月": defaultCollectionLogic(row).firstSaleMonth, "总套数": defaultCollectionLogic(row).totalUnits,
    "月去化（套）": defaultCollectionLogic(row).monthlyAbsorptionUnits, "首付款比例": defaultCollectionLogic(row).downPaymentRate,
    "月回款比例": defaultCollectionLogic(row).monthlyCollectionRate, "尾款分期（月）": defaultCollectionLogic(row).tailInstallmentMonths
  })));
  const resultSheet = XLSX.utils.json_to_sheet(calculated);
  const infoSheet = XLSX.utils.json_to_sheet(Object.entries(scenario.project).map(([key, value]) => ({ 字段: key, 数值: value })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, inputSheet, "业态录入");
  XLSX.utils.book_append_sheet(wb, resultSheet, "测算结果");
  XLSX.utils.book_append_sheet(wb, infoSheet, "项目参数");
  XLSX.writeFile(wb, `${scenario.name}-投资测算.xlsx`);
}

export async function importExcel(file: File, current: Scenario): Promise<Scenario> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames.includes("业态录入") ? "业态录入" : workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: 0 });
  const rows = data.filter(item => item["业态"]).map((item, index) => {
    const base = current.rows[index] || current.rows[0];
    const rawKind = String(item["类型"] || "销售");
    const next: AssetRow = { ...base, id: `${Date.now()}-${index}`, name: String(item["业态"]), kind: normalizeAssetKind({ kind: rawKind as AssetRow["kind"], name: String(item["业态"]) }) };
    for (const [label, key] of Object.entries(headers)) if (label in item && key !== "name" && key !== "kind" && key !== "id") (next as unknown as Record<string, unknown>)[key] = item[label] === "" ? null : Number(item[label]);
    if ("得房率" in item) {
      const rawRate = Number(item["得房率"]);
      next.efficiencyRate = rawRate > 1 ? rawRate / 100 : rawRate;
    } else {
      next.efficiencyRate = next.buildingArea ? next.saleArea / next.buildingArea : 0;
    }
    next.saleArea = next.buildingArea * (next.efficiencyRate || 0);
    const fallback = defaultCollectionLogic(next);
    const ratio = (label: string, fallbackValue: number) => label in item ? (Number(item[label]) > 1 ? Number(item[label]) / 100 : Number(item[label])) : fallbackValue;
    next.unitCount = next.unitCount ?? Number(item["总套数"] ?? fallback.totalUnits);
    next.collection = {
      firstSaleMonth: Number(item["首售月"] ?? fallback.firstSaleMonth), deliveryMonth: current.project.deliveryMonth || 24,
      totalUnits: next.unitCount ?? Number(item["总套数"] ?? fallback.totalUnits), monthlyAbsorptionUnits: Number(item["月去化（套）"] ?? fallback.monthlyAbsorptionUnits),
      downPaymentRate: ratio("首付款比例", fallback.downPaymentRate), monthlyCollectionRate: ratio("月回款比例", fallback.monthlyCollectionRate),
      tailInstallmentMonths: Number(item["尾款分期（月）"] ?? fallback.tailInstallmentMonths)
    };
    if (next.kind === "自持酒店") next.holding = { ...(next.holding || { annualRent: 0, annualOperatingIncome: 0, annualOperatingCost: 0, holdingYears: 10, discountRate: .08 }), roomCount: next.unitCount };
    return next;
  });
  if (!rows.length) throw new Error("未找到“业态”列或有效数据");
  return { ...current, rows, allocations: [], updatedAt: new Date().toISOString() };
}
