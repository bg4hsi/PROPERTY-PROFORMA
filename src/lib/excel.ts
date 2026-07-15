import { AssetKind, AssetRow, HoldingReturn, ProjectInfo, Scenario } from "@/types";
import { calculateProject, defaultCollectionLogic, normalizeAssetKind } from "@/lib/calculationEngine";

type SheetRow = Record<string, unknown>;

const assetHeaders: Record<string, keyof AssetRow> = {
  "业态": "name",
  "类型": "kind",
  "建筑面积（平方米）": "buildingArea",
  "得房率": "efficiencyRate",
  "销售单价（元/平方米）": "salePrice",
  "单方成本（元/平方米）": "unitCost",
  "总套数/客房数": "unitCount",
  "客房数": "unitCount"
};

const projectLabels: Record<keyof ProjectInfo, string> = {
  name: "项目名称",
  location: "项目地点",
  landArea: "土地面积（㎡）",
  landTotalPrice: "土地总价（万元）",
  totalBuildingArea: "总建筑面积（㎡）",
  saleableArea: "可售面积（㎡）",
  heldArea: "自持面积（㎡）",
  governmentArea: "给政府面积（㎡）",
  vatRate: "增值税税率",
  managementRate: "管理费率",
  salesRate: "销售费率",
  shareholderInterestRate: "股东计息利率",
  collectionDownPaymentRate: "首付款比例",
  collectionMonthlyRate: "月回款比例",
  collectionPreDeliveryPaymentRate: "竣备前支付比例",
  collectionTailInstallmentMonths: "尾款分期（月）",
  fullPaymentRate: "全款比例",
  fullPaymentDiscountRate: "全款优惠比例",
  deliveryMonth: "交付月",
  phase2StartMonth: "二期开始月",
  phase2DeliveryMonth: "二期交付月",
  trialOperationMonths: "试营业（月）",
  hotelAverageDailyRate: "酒店单客房平均每晚房价（旧字段）",
  fourStarHotelAverageDailyRate: "四星级酒店单客房平均每晚房价（元）",
  fiveStarHotelAverageDailyRate: "五星级酒店单客房平均每晚房价（元）",
  fourStarHotelOpeningCost: "四星级酒店开办费（元/建筑㎡）",
  fiveStarHotelOpeningCost: "五星级酒店开办费（元/建筑㎡）",
  mallOpeningCost: "MALL开办费（元/建筑㎡）",
  commercialMonthlyRent: "商业出租每平米每月租金（元）",
  hotelOccupancyRate: "酒店入住率",
  commercialOccupancyRate: "商业出租率",
  annualOperatingCostRate: "年经营成本占比",
  holdingDiscountRate: "自持折现率",
  currencyUnit: "货币单位",
  includeHoldingReturns: "自持经营回报计入项目总收入"
};

const projectLabelToKey = Object.fromEntries(
  Object.entries(projectLabels).map(([key, label]) => [label, key])
) as Record<string, keyof ProjectInfo>;

const projectNumberKeys = new Set<keyof ProjectInfo>([
  "landArea", "landTotalPrice",
  "vatRate", "managementRate", "salesRate", "shareholderInterestRate",
  "collectionDownPaymentRate", "collectionMonthlyRate", "collectionPreDeliveryPaymentRate", "collectionTailInstallmentMonths",
  "fullPaymentRate", "fullPaymentDiscountRate", "deliveryMonth", "phase2StartMonth", "phase2DeliveryMonth", "trialOperationMonths",
  "hotelAverageDailyRate", "fourStarHotelAverageDailyRate", "fiveStarHotelAverageDailyRate",
  "fourStarHotelOpeningCost", "fiveStarHotelOpeningCost", "mallOpeningCost", "commercialMonthlyRent",
  "hotelOccupancyRate", "commercialOccupancyRate", "annualOperatingCostRate", "holdingDiscountRate"
]);
const projectBooleanKeys = new Set<keyof ProjectInfo>(["includeHoldingReturns"]);
const projectStringKeys = new Set<keyof ProjectInfo>(["name", "location", "currencyUnit"]);
const exportProjectKeys: Array<keyof ProjectInfo> = [
  "name",
  "location",
  "vatRate",
  "managementRate",
  "salesRate",
  "shareholderInterestRate",
  "collectionDownPaymentRate",
  "collectionMonthlyRate",
  "collectionPreDeliveryPaymentRate",
  "collectionTailInstallmentMonths",
  "fullPaymentRate",
  "fullPaymentDiscountRate",
  "landTotalPrice",
  "landArea",
  "deliveryMonth",
  "phase2StartMonth",
  "phase2DeliveryMonth",
  "trialOperationMonths",
  "annualOperatingCostRate",
  "holdingDiscountRate",
  "fourStarHotelAverageDailyRate",
  "fiveStarHotelAverageDailyRate",
  "fourStarHotelOpeningCost",
  "fiveStarHotelOpeningCost",
  "mallOpeningCost",
  "commercialMonthlyRent",
  "hotelOccupancyRate",
  "commercialOccupancyRate",
  "includeHoldingReturns"
];

const asNumber = (value: unknown, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const text = String(value).trim();
  if (!text) return fallback;
  if (text.endsWith("%")) return Number(text.slice(0, -1)) / 100;
  const numeric = Number(text.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : fallback;
};
const asOptionalNumber = (value: unknown) => value === "" || value === null || value === undefined ? undefined : asNumber(value);
const asBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (value === "" || value === null || value === undefined) return fallback;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "是", "已开启", "开启"].includes(text)) return true;
  if (["false", "0", "no", "n", "否", "未开启", "关闭"].includes(text)) return false;
  return fallback;
};
const holdingDefaults: HoldingReturn = { annualRent: 0, annualOperatingIncome: 0, annualOperatingCost: 0, holdingYears: 10, discountRate: .08 };
const defaultProject: ProjectInfo = {
  name: "导入方案",
  location: "",
  landArea: 0,
  landTotalPrice: 0,
  totalBuildingArea: 0,
  saleableArea: 0,
  heldArea: 0,
  governmentArea: 0,
  vatRate: .15,
  managementRate: .02,
  salesRate: .05,
  shareholderInterestRate: .08,
  collectionDownPaymentRate: .3,
  collectionMonthlyRate: .05,
  collectionPreDeliveryPaymentRate: .8,
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
  hotelOccupancyRate: .7,
  commercialOccupancyRate: .85,
  annualOperatingCostRate: .35,
  holdingDiscountRate: .08,
  currencyUnit: "万元",
  includeHoldingReturns: false
};
const blankRow = (index: number): AssetRow => ({
  id: `${Date.now()}-${index}`,
  name: "新业态",
  kind: "销售",
  buildingArea: 0,
  governmentArea: 0,
  efficiencyRate: 0,
  saleArea: 0,
  salePrice: 0,
  unitCost: 0,
  manualManagementFee: null,
  manualSalesFee: null,
  manualSecondaryAllocation: 0
});

function parseProject(workbook: { Sheets: Record<string, unknown> }, XLSX: typeof import("xlsx"), current: Scenario): ProjectInfo {
  const sheet = workbook.Sheets["项目参数"];
  if (!sheet) return current.project;
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" });
  const project = { ...defaultProject };
  for (const row of rows) {
    const rawKey = String(row["字段"] || "").trim();
    const rawLabel = String(row["名称"] || row["参数"] || "").trim();
    const key = (rawKey in projectLabels ? rawKey : projectLabelToKey[rawLabel]) as keyof ProjectInfo | undefined;
    if (!key) continue;
    const value = row["数值"];
    if (projectBooleanKeys.has(key)) {
      (project as unknown as Record<string, unknown>)[key] = asBoolean(value, Boolean(project[key]));
    } else if (projectNumberKeys.has(key)) {
      const parsed = asOptionalNumber(value);
      if (parsed !== undefined) (project as unknown as Record<string, unknown>)[key] = parsed;
    } else if (projectStringKeys.has(key) && value !== "" && value !== undefined && value !== null) {
      (project as unknown as Record<string, unknown>)[key] = String(value);
    }
  }
  return project;
}

function parseScenarioInfo(workbook: { Sheets: Record<string, unknown> }, XLSX: typeof import("xlsx"), fallbackName: string) {
  const sheet = workbook.Sheets["方案信息"];
  if (!sheet) return { name: fallbackName };
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" });
  const get = (label: string) => rows.find(row => String(row["字段"] || row["名称"] || "") === label)?.["数值"];
  const name = String(get("方案名称") || fallbackName);
  return { name };
}

export async function exportExcel(scenario: Scenario) {
  const XLSX = await import("xlsx");
  const calculatedRows = calculateProject(scenario.rows, scenario.project, []).rows;
  const scenarioSheet = XLSX.utils.json_to_sheet([
    { 字段: "方案名称", 数值: scenario.name },
    { 字段: "项目名称", 数值: scenario.project.name },
    { 字段: "项目地点", 数值: scenario.project.location },
    { 字段: "导出时间", 数值: new Date().toISOString() }
  ]);
  const infoSheet = XLSX.utils.json_to_sheet(exportProjectKeys.map(key => ({
    字段: key,
    名称: projectLabels[key],
    数值: scenario.project[key] ?? ""
  })));
  const inputSheet = XLSX.utils.json_to_sheet(calculatedRows.map(row => {
    const kind = normalizeAssetKind(row);
    const efficiencyRate = row.efficiencyRate ?? (row.buildingArea ? row.saleArea / row.buildingArea : 0);
    const saleArea = kind === "销售" ? row.buildingArea * efficiencyRate : 0;
    const normalizedRow = { ...row, kind, efficiencyRate, saleArea };
    const logic = defaultCollectionLogic(normalizedRow, scenario.project);
    const isOtherHolding = kind === "其他自持";
    const areaInput = saleArea > 0
      ? { "销售面积（平方米）": saleArea }
      : { "得房率": efficiencyRate };
    return {
      "业态": row.name,
      "类型": kind,
      "建筑面积（平方米）": row.buildingArea,
      ...areaInput,
      "销售单价（元/平方米）": row.salePrice,
      "单方成本（元/平方米）": row.unitCost,
      "总套数/客房数": row.unitCount ?? "",
      "首售月": kind === "销售" ? logic.firstSaleMonth : "",
      "月去化（套）": kind === "销售" ? logic.monthlyAbsorptionUnits : "",
      "持有年限": row.holding?.holdingYears ?? "",
      "年租金收入（万元）": isOtherHolding ? row.holding?.annualRent ?? "" : "",
      "年经营收入（万元）": isOtherHolding ? row.holding?.annualOperatingIncome ?? "" : ""
    };
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, scenarioSheet, "方案信息");
  XLSX.utils.book_append_sheet(wb, infoSheet, "项目参数");
  XLSX.utils.book_append_sheet(wb, inputSheet, "业态录入");
  XLSX.writeFile(wb, `${scenario.name}-投资测算.xlsx`);
}

export async function importExcel(file: File, current: Scenario): Promise<Scenario> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const info = parseScenarioInfo(workbook, XLSX, current.name);
  const project = parseProject(workbook, XLSX, current);
  const sheet = workbook.Sheets[workbook.SheetNames.includes("业态录入") ? "业态录入" : workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" });
  const rows = data.filter(item => item["业态"]).map((item, index) => {
    const base = blankRow(index);
    const name = String(item["业态"]);
    const rawKind = String(item["类型"] || "销售");
    const next: AssetRow = { ...base, id: `${Date.now()}-${index}`, name, kind: normalizeAssetKind({ kind: rawKind as AssetKind, name }) };
    for (const [label, key] of Object.entries(assetHeaders)) {
      if (!(label in item) || key === "name" || key === "kind" || key === "id") continue;
      const raw = item[label];
      if (key === "unitCount") {
        next.unitCount = asOptionalNumber(raw);
      } else {
        (next as unknown as Record<string, unknown>)[key] = asNumber(raw);
      }
    }
    const rawRate = "得房率" in item ? asNumber(item["得房率"]) : undefined;
    const inputSaleArea = asNumber(item["销售面积（平方米）"]);
    const normalizedRate = rawRate === undefined ? undefined : rawRate > 1 ? rawRate / 100 : rawRate;
    const hasPositiveRate = (normalizedRate ?? 0) > 0;
    if (next.kind === "销售" && inputSaleArea > 0 && next.buildingArea > 0) {
      next.efficiencyRate = inputSaleArea / next.buildingArea;
      next.saleArea = next.buildingArea * next.efficiencyRate;
    } else if (hasPositiveRate) {
      next.efficiencyRate = normalizedRate;
      next.saleArea = next.kind === "销售" ? next.buildingArea * (next.efficiencyRate || 0) : 0;
    } else {
      next.saleArea = 0;
      next.efficiencyRate = 0;
    }
    const fallback = defaultCollectionLogic(next, project);
    next.collection = next.kind === "销售" ? {
      firstSaleMonth: asNumber(item["首售月"], fallback.firstSaleMonth),
      deliveryMonth: project.deliveryMonth || 24,
      totalUnits: next.unitCount ?? 0,
      monthlyAbsorptionUnits: asNumber(item["月去化（套）"], fallback.monthlyAbsorptionUnits),
      downPaymentRate: project.collectionDownPaymentRate ?? fallback.downPaymentRate,
      monthlyCollectionRate: project.collectionMonthlyRate ?? fallback.monthlyCollectionRate,
      tailInstallmentMonths: project.collectionTailInstallmentMonths ?? fallback.tailInstallmentMonths
    } : undefined;
    if (next.kind.startsWith("自持") || next.kind === "其他自持") {
      next.holding = {
        ...holdingDefaults,
        ...(next.holding || {}),
        annualRent: asNumber(item["年租金收入（万元）"], next.holding?.annualRent ?? holdingDefaults.annualRent),
        annualOperatingIncome: asNumber(item["年经营收入（万元）"], next.holding?.annualOperatingIncome ?? holdingDefaults.annualOperatingIncome),
        annualOperatingCost: holdingDefaults.annualOperatingCost,
        holdingYears: asNumber(item["持有年限"], next.holding?.holdingYears ?? holdingDefaults.holdingYears),
        discountRate: project.holdingDiscountRate ?? holdingDefaults.discountRate,
        ...(next.kind === "自持酒店" ? { roomCount: next.unitCount } : {})
      };
    } else {
      next.holding = undefined;
    }
    return next;
  });
  if (!rows.length) throw new Error("未找到“业态”列或有效数据");
  return {
    id: `${Date.now()}-imported`,
    name: info.name,
    project: { ...project, name: project.name || info.name },
    rows,
    allocations: [],
    updatedAt: new Date().toISOString()
  };
}
