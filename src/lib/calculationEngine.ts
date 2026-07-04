import { AllocationRule, AssetKind, AssetRow, CalculatedRow, ProjectInfo, ProjectSummary } from "@/types";

const safe = (n: number) => (Number.isFinite(n) ? n : 0);
const round = (n: number) => Math.round((safe(n) + Number.EPSILON) * 10000) / 10000;
export const PROJECTION_MONTHS = 60;

/** 地库、地下空间、车位和停车业态均不参与土地分摊及自持经营回报。 */
export function isBasementOrParking(row: Pick<AssetRow, "name">): boolean {
  return /地库|地下(?:车库|室)?|车位|停车/i.test(row.name);
}

export function normalizeAssetKind(row: Pick<AssetRow, "kind"|"name">): AssetKind {
  const kind = String(row.kind);
  if (["销售","给政府","自持酒店","自持商业","其他自持"].includes(kind)) return kind as AssetKind;
  // 旧方案中的“车位”并入销售分类，确保历史数据仍可正常打开。
  if (kind === "车位") return "销售";
  if (kind === "政府") return "给政府";
  if (kind === "自持") {
    if (row.name.includes("酒店")) return "自持酒店";
    if (row.name.includes("MALL") || row.name.includes("商业") || row.name.includes("商场")) return "自持商业";
    return "其他自持";
  }
  return "其他自持";
}

export function npv(rate: number, cashflows: number[]): number {
  return cashflows.reduce((sum, cashflow, year) => sum + cashflow / Math.pow(1 + rate, year), 0);
}

export function irr(cashflows: number[]): number | null {
  if (!cashflows.some(v => v < 0) || !cashflows.some(v => v > 0)) return null;
  let low = -0.9999, high = 10;
  for (let i = 0; i < 160; i++) {
    const mid = (low + high) / 2;
    if (npv(mid, cashflows) > 0) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

export function calculateRows(rows: AssetRow[], project: ProjectInfo, _allocations: AllocationRule[]): CalculatedRow[] {
  // 兼容旧方案：首次计算时用历史销售面积反推得房率；此后销售面积始终由公式生成。
  const normalizedRows = rows.map(row => {
    const kind = normalizeAssetKind(row);
    const efficiencyRate = row.efficiencyRate ?? (row.buildingArea ? row.saleArea / row.buildingArea : 0);
    const saleArea = kind === "销售" ? round(row.buildingArea * efficiencyRate) : 0;
    const governmentArea = kind === "给政府" ? round(row.buildingArea) : 0;
    return { ...row, kind, efficiencyRate, saleArea, governmentArea };
  });
  const revenues = new Map(normalizedRows.map(row => [row.id, round(row.saleArea * row.salePrice / 10000)]));
  const governmentMode = normalizedRows.some(row => row.kind === "给政府");
  const governmentCostPool = round(normalizedRows.reduce((total, row) => total + (row.kind === "给政府" ? row.buildingArea * row.unitCost / 10000 : 0), 0));
  const saleableBuildingArea = normalizedRows.reduce((total, row) => total + (row.kind === "销售" ? row.buildingArea : 0), 0);
  const landTotalPrice = Math.max(0, project.landTotalPrice ?? 0);
  // 土地总价先按各业态建筑面积分摊；地库、车位不参与。
  const landAllocationBasis = new Map(normalizedRows.map(row => [row.id,
    isBasementOrParking(row) || row.kind === "给政府" ? 0 : row.buildingArea
  ]));
  const totalLandAllocationBasis = [...landAllocationBasis.values()].reduce((total, value) => total + value, 0);

  return normalizedRows.map(row => {
    const revenue = revenues.get(row.id) || 0;
    const baseConstructionCost = round(row.buildingArea * row.unitCost / 10000);
    const governmentConstructionCost = round(row.governmentArea * row.unitCost / 10000);
    const secondaryAllocation = 0;
    // 建筑面积已包含政府面积时，基础成本中扣除政府面积，避免重复计算。
    const saleAndHoldCost = round(Math.max(0, row.buildingArea - row.governmentArea) * row.unitCost / 10000);
    const totalConstructionCost = round(saleAndHoldCost + governmentConstructionCost + secondaryAllocation);
    const isHotelAsset = row.kind === "自持酒店" || /酒店/.test(row.name);
    const usesFiveStarOpeningCost = /五星|5\s*星/i.test(row.name) || /会展|会议|展览|会务/.test(row.name);
    const openingCostRate = usesFiveStarOpeningCost
      ? (project.fiveStarHotelOpeningCost ?? 0)
      : isHotelAsset ? (project.fourStarHotelOpeningCost ?? 0) : 0;
    const openingCost = round(row.buildingArea * openingCostRate / 10000);
    const isSaleable = row.saleArea > 0;
    const rowLandAllocationBasis = landAllocationBasis.get(row.id) || 0;
    const allocatedLandCost = governmentMode
      ? row.kind === "销售" && saleableBuildingArea > 0 ? round(governmentCostPool * row.buildingArea / saleableBuildingArea) : 0
      : totalLandAllocationBasis > 0 ? round(landTotalPrice * rowLandAllocationBasis / totalLandAllocationBasis) : 0;
    // 可售业态按销售面积折单方，非可售业态按建筑面积折单方。
    const rowLandUnitBasis = governmentMode || row.kind === "销售" ? row.saleArea : row.buildingArea;
    const allocatedLandUnitCost = rowLandUnitBasis > 0 ? round(allocatedLandCost * 10000 / rowLandUnitBasis) : 0;
    const managementBase = isSaleable ? revenue : totalConstructionCost;
    const managementFee = round(row.manualManagementFee ?? managementBase * project.managementRate);
    const salesFee = isSaleable ? round(row.manualSalesFee ?? revenue * project.salesRate) : 0;
    const vat = round(project.vatRate > 0 ? revenue / (1 + project.vatRate) * project.vatRate : 0);
    // 股东计息依赖项目逐月资金缺口，在 calculateProject 中统一计算后再分摊到各业态。
    const shareholderInterest = 0;
    const netProfit = isSaleable ? round(revenue - totalConstructionCost - allocatedLandCost - openingCost - managementFee - salesFee - vat) : 0;
    const fullUnitCost = row.buildingArea ? round((totalConstructionCost + allocatedLandCost + openingCost + managementFee + salesFee) * 10000 / row.buildingArea) : 0;
    const unitProfit = isSaleable && row.saleArea > 0 ? round(netProfit * 10000 / row.saleArea) : 0;
    const eligibleForHoldingReturn = !isBasementOrParking(row);
    const isHotel = eligibleForHoldingReturn && row.kind === "自持酒店";
    const isCommercial = eligibleForHoldingReturn && row.kind === "自持商业";
    const isOtherHolding = eligibleForHoldingReturn && row.kind === "其他自持";
    const holdingBase = (isHotel || isCommercial || isOtherHolding) ? (row.holding || { annualRent: 0, annualOperatingIncome: 0, annualOperatingCost: 0, holdingYears: 10, discountRate: .08 }) : undefined;
    const roomCount = holdingBase?.roomCount || Math.max(1, Math.round(row.buildingArea / 50));
    const isFiveStarHotel = /五星|5\s*星/i.test(row.name);
    const legacyHotelRate = project.hotelAverageDailyRate ?? 800;
    const fourStarHotelRate = project.fourStarHotelAverageDailyRate ?? legacyHotelRate;
    const fiveStarHotelRate = project.fiveStarHotelAverageDailyRate ?? legacyHotelRate;
    const hotelAverageDailyRate = isFiveStarHotel ? fiveStarHotelRate : fourStarHotelRate;
    const rentableArea = round(row.buildingArea * (row.efficiencyRate || 0));
    const holdingIncome = holdingBase ? {
      ...holdingBase,
      ...(isHotel ? { roomCount, annualRent: 0, annualOperatingIncome: round(roomCount * hotelAverageDailyRate * (project.hotelOccupancyRate ?? .7) * 365 / 10000) } : {}),
      ...(isCommercial ? { annualRent: round(rentableArea * (project.commercialMonthlyRent ?? 150) * (project.commercialOccupancyRate ?? .85) * 12 / 10000), annualOperatingIncome: 0 } : {})
    } : undefined;
    const holding = holdingIncome ? { ...holdingIncome, annualOperatingCost: round((holdingIncome.annualRent + holdingIncome.annualOperatingIncome) * (project.annualOperatingCostRate ?? .35)) } : undefined;
    const annualNetCashFlow = holding ? round(holding.annualRent + holding.annualOperatingIncome - holding.annualOperatingCost) : 0;
    const holdingInvestmentCost = round(totalConstructionCost + openingCost + (governmentMode ? 0 : allocatedLandCost));
    const paybackPeriod = holding && annualNetCashFlow > 0 ? round(holdingInvestmentCost / annualNetCashFlow) : null;
    const cumulativeReturn = holding ? round(annualNetCashFlow * holding.holdingYears) : 0;
    const cashflows = holding ? [-holdingInvestmentCost, ...Array(holding.holdingYears).fill(annualNetCashFlow)] : [];
    return { ...row, holding, revenue, baseConstructionCost, governmentConstructionCost, secondaryAllocation,
      totalConstructionCost, openingCost, allocatedLandCost, allocatedLandUnitCost, managementFee, salesFee, vat, shareholderInterest, netProfit, fullUnitCost, unitProfit, annualNetCashFlow, paybackPeriod,
      cumulativeReturn, npv: holding ? round(npv(holding.discountRate, cashflows)) : 0,
      irr: holding ? irr(cashflows) : null };
  });
}

export function calculateSummary(rows: CalculatedRow[], project: ProjectInfo): ProjectSummary {
  const sum = (key: keyof CalculatedRow) => rows.reduce((total, row) => total + (typeof row[key] === "number" ? row[key] as number : 0), 0);
  const governmentMode = rows.some(row => row.kind === "给政府");
  const holdingRows = rows.filter(row => !isBasementOrParking(row) && (row.kind === "自持酒店" || row.kind === "自持商业" || row.kind === "其他自持"));
  const revenue = round(sum("revenue"));
  const holdingReturns = round(sum("cumulativeReturn"));
  const holdingAnnualNetCashFlow = round(holdingRows.reduce((total, row) => total + row.annualNetCashFlow, 0));
  const totalConstructionCost = round(sum("totalConstructionCost"));
  const openingCost = round(sum("openingCost"));
  const landCost = governmentMode ? 0 : round(Math.max(0, project.landTotalPrice ?? 0));
  const managementFeeBase = round(rows.reduce((total, row) => total + (row.saleArea > 0 ? row.revenue : row.totalConstructionCost), 0));
  const managementFee = round(sum("managementFee"));
  const salesFee = round(sum("salesFee"));
  const vat = round(sum("vat"));
  const shareholderInterest = round(sum("shareholderInterest"));
  const totalCost = round(totalConstructionCost + landCost + openingCost + managementFee + salesFee + vat + shareholderInterest);
  const totalIncome = round(revenue + (project.includeHoldingReturns ? holdingReturns : 0));
  const netProfitExcludingHoldingReturns = round(revenue - totalCost);
  const netProfitIncludingHoldingReturns = round(revenue + holdingReturns - totalCost);
  const netProfit = project.includeHoldingReturns ? netProfitIncludingHoldingReturns : netProfitExcludingHoldingReturns;
  const governmentArea = round(sum("governmentArea"));
  return { revenue, holdingReturns, holdingAnnualNetCashFlow, includeHoldingReturns: project.includeHoldingReturns,
    totalIncome, totalConstructionCost, openingCost, landCost, managementFeeBase, managementFee, salesFee, vat, shareholderInterest,
    totalCost, netProfit, roi: totalCost ? netProfit / totalCost : 0,
    netProfitExcludingHoldingReturns, netProfitIncludingHoldingReturns,
    roiExcludingHoldingReturns: totalCost ? netProfitExcludingHoldingReturns / totalCost : 0,
    roiIncludingHoldingReturns: totalCost ? netProfitIncludingHoldingReturns / totalCost : 0, governmentArea,
    governmentRatio: project.totalBuildingArea ? governmentArea / project.totalBuildingArea : 0,
    governmentCost: round(rows.reduce((total,row)=>total+(row.kind==="给政府"?row.governmentConstructionCost+row.openingCost:0),0)) };
}

export function calculateProject(rows: AssetRow[], project: ProjectInfo, allocations: AllocationRule[]) {
  const baseRows = calculateRows(rows, project, allocations);
  const baseSummary = calculateSummary(baseRows, project);
  const months = PROJECTION_MONTHS;
  const collectionSchedule = calculateCollectionSchedule(baseRows, months);
  const cashFlow = calculateCashFlowProjection(baseSummary, months, collectionSchedule, project.deliveryMonth || 24, project.trialOperationMonths ?? 3);
  const monthlyRate = Math.max(0, project.shareholderInterestRate ?? .08) / 12;
  const shareholderInterestTotal = round(cashFlow.reduce((total, point) => total + Math.max(0, -point.cumulativeNetCashFlow) * monthlyRate, 0));
  const interestBase = baseRows.reduce((total, row) => total + row.totalConstructionCost, 0);
  const interestRows = baseRows.filter(row => row.totalConstructionCost > 0);
  let remainingInterest = shareholderInterestTotal;
  const calculatedRows = baseRows.map(row => {
    let shareholderInterest = 0;
    if (interestBase > 0 && row.totalConstructionCost > 0) {
      const isLast = row.id === interestRows[interestRows.length - 1]?.id;
      shareholderInterest = isLast ? remainingInterest : round(shareholderInterestTotal * row.totalConstructionCost / interestBase);
      remainingInterest = round(remainingInterest - shareholderInterest);
    }
    const netProfit = row.kind === "销售" ? round(row.netProfit - shareholderInterest) : 0;
    const unitProfit = row.kind === "销售" && row.saleArea > 0 ? round(netProfit * 10000 / row.saleArea) : 0;
    return { ...row, shareholderInterest, netProfit, unitProfit };
  });
  return { rows: calculatedRows, summary: calculateSummary(calculatedRows, project) };
}

export interface CashFlowPoint {
  month: number;
  monthlySales: number;
  monthlyCollection: number;
  monthlyOperatingCashFlow: number;
  monthlyOutflow: number;
  cumulativeSales: number;
  cumulativeCollection: number;
  cumulativeOutflow: number;
  cumulativeNetCashFlow: number;
}

export interface SimulationRates {
  managementRate: number;
  salesRate: number;
  vatRate: number;
}

export interface RowCollectionProjection {
  rowId: string;
  monthlySales: number[];
  monthlyCollection: number[];
  monthlySoldUnits: number[];
  cumulativeSales: number[];
  cumulativeCollection: number[];
  cumulativeSoldUnits: number[];
}

export interface CollectionSchedule {
  months: number;
  monthlySales: number[];
  monthlyCollection: number[];
  rows: RowCollectionProjection[];
}

export function defaultCollectionLogic(row: AssetRow) {
  if (!row.saleArea || normalizeAssetKind(row) !== "销售") return { firstSaleMonth: 0, deliveryMonth: 0, totalUnits: 0, monthlyAbsorptionUnits: 0, downPaymentRate: 0, monthlyCollectionRate: 0, tailInstallmentMonths: 0 };
  if (row.collection) return row.collection;
  const totalUnits = row.name.includes("公寓") ? Math.max(1, Math.round(row.saleArea / 56.16)) : Math.max(1, Math.round(row.saleArea / 100));
  return { firstSaleMonth: row.name.includes("商业") ? 6 : 1, deliveryMonth: 24, totalUnits, monthlyAbsorptionUnits: Math.max(1, Math.ceil(totalUnits / 18)), downPaymentRate: .3, monthlyCollectionRate: .05, tailInstallmentMonths: 3 };
}

export function calculateCollectionSchedule(rows: CalculatedRow[], months = PROJECTION_MONTHS): CollectionSchedule {
  const totalMonthlySales = Array(months).fill(0) as number[];
  const totalMonthlyCollection = Array(months).fill(0) as number[];
  const projections = rows.map(row => {
    const logic = defaultCollectionLogic(row);
    const monthlySales = Array(months).fill(0) as number[];
    const monthlyCollection = Array(months).fill(0) as number[];
    const monthlySoldUnits = Array(months).fill(0) as number[];
    if (row.revenue > 0 && logic.totalUnits > 0 && logic.monthlyAbsorptionUnits > 0 && logic.firstSaleMonth > 0) {
      let remainingUnits = logic.totalUnits;
      for (let saleMonth = logic.firstSaleMonth; saleMonth <= months && remainingUnits > 0; saleMonth++) {
        const units = Math.min(logic.monthlyAbsorptionUnits, remainingUnits);
        remainingUnits -= units;
        const cohortSales = row.revenue * units / logic.totalUnits;
        monthlySoldUnits[saleMonth - 1] += units;
        monthlySales[saleMonth - 1] += cohortSales;
        let remainingPayment = cohortSales;
        const downPayment = Math.min(remainingPayment, cohortSales * logic.downPaymentRate);
        monthlyCollection[saleMonth - 1] += downPayment;
        remainingPayment -= downPayment;
        const readyMonth = Math.max(saleMonth + 1, logic.deliveryMonth || saleMonth + 1);
        for (let month = saleMonth + 1; month < readyMonth && month <= months && remainingPayment > 0; month++) {
          const progressPayment = Math.min(remainingPayment, cohortSales * logic.monthlyCollectionRate);
          monthlyCollection[month - 1] += progressPayment;
          remainingPayment -= progressPayment;
        }
        if (remainingPayment > 0) {
          const installments = Math.max(1, logic.tailInstallmentMonths || 1);
          const installment = remainingPayment / installments;
          for (let offset = 0; offset < installments; offset++) {
            const month = readyMonth + offset;
            if (month <= months) monthlyCollection[month - 1] += installment;
          }
        }
      }
    }
    const accumulate = (values: number[]) => { let total = 0; return values.map(value => round(total += value)); };
    monthlySales.forEach((value, index) => totalMonthlySales[index] += value);
    monthlyCollection.forEach((value, index) => totalMonthlyCollection[index] += value);
    return { rowId: row.id, monthlySales: monthlySales.map(round), monthlyCollection: monthlyCollection.map(round), monthlySoldUnits, cumulativeSales: accumulate(monthlySales), cumulativeCollection: accumulate(monthlyCollection), cumulativeSoldUnits: accumulate(monthlySoldUnits) };
  });
  return { months, monthlySales: totalMonthlySales.map(round), monthlyCollection: totalMonthlyCollection.map(round), rows: projections };
}

export function calculateSimulationSummary(base: ProjectSummary, rates: SimulationRates) {
  const managementFee = round(base.managementFeeBase * rates.managementRate);
  const salesFee = round(base.revenue * rates.salesRate);
  const vat = round(rates.vatRate > 0 ? base.revenue / (1 + rates.vatRate) * rates.vatRate : 0);
  const preTaxCost = round(base.totalConstructionCost + base.landCost + base.openingCost + managementFee + salesFee + vat + base.shareholderInterest);
  const profitBeforeTax = round(base.totalIncome - preTaxCost);
  const totalCost = preTaxCost;
  const netProfitExcludingHoldingReturns = round(base.revenue - totalCost);
  const netProfitIncludingHoldingReturns = round(base.revenue + base.holdingReturns - totalCost);
  const netProfit = base.includeHoldingReturns ? netProfitIncludingHoldingReturns : netProfitExcludingHoldingReturns;
  return {
    profitBeforeTax,
    summary: {
      ...base, managementFee, salesFee, vat, totalCost, netProfit,
      roi: totalCost ? netProfit / totalCost : 0,
      netProfitExcludingHoldingReturns, netProfitIncludingHoldingReturns,
      roiExcludingHoldingReturns: totalCost ? netProfitExcludingHoldingReturns / totalCost : 0,
      roiIncludingHoldingReturns: totalCost ? netProfitIncludingHoldingReturns / totalCost : 0
    } satisfies ProjectSummary
  };
}

/**
 * 月度推演模型：销售与回款采用业态配置；建安支出按建设期分布。
 * 自持经营净现金流从交付并完成试营业后的下一个月开始进入项目现金流。
 */
export function calculateCashFlowProjection(summary: ProjectSummary, months = PROJECTION_MONTHS, collectionSchedule?: CollectionSchedule, deliveryMonth = months, trialOperationMonths = 0): CashFlowPoint[] {
  const bell = (month: number, start: number, end: number, center: number, spread: number) =>
    month < start || month > end ? 0 : Math.exp(-Math.pow(month - center, 2) / (2 * spread * spread));
  const normalize = (weights: number[]) => {
    const total = weights.reduce((sum, value) => sum + value, 0);
    return weights.map(value => total ? value / total : 0);
  };
  const salesWeights = normalize(Array.from({ length: months }, (_, i) => bell(i + 1, 4, 24, 12, 5.2)));
  const collectionWeights = normalize(Array.from({ length: months }, (_, i) => {
    const month = i + 1;
    const current = salesWeights[i] * 0.2;
    const lagged = month > 2 ? salesWeights[i - 2] * 0.8 : 0;
    return current + lagged;
  }));
  const constructionEndMonth = Math.max(1, Math.min(months, Math.round(deliveryMonth)));
  const effectiveSalesFeeRate = summary.revenue ? summary.salesFee / summary.revenue : 0;
  const effectiveVatRate = summary.revenue ? summary.vat / summary.revenue : 0;
  // 股东计息是利润测算项，不作为实际现金支出进入资金动态曲线。
  const residualCost = Math.max(0, summary.totalCost - summary.totalConstructionCost - summary.landCost - summary.openingCost - summary.managementFee - summary.salesFee - summary.vat - summary.shareholderInterest);
  const managementMonths = constructionEndMonth;
  const operationStartMonth = Math.max(1, Math.round(deliveryMonth) + Math.max(0, Math.round(trialOperationMonths)) + 1);
  const monthlyHoldingCashFlow = summary.includeHoldingReturns ? summary.holdingAnnualNetCashFlow / 12 : 0;
  const constructionPhaseMonths = constructionEndMonth;
  const preDeliveryConstructionCost = round(summary.totalConstructionCost * .88);
  const postDeliveryConstructionCost = round(summary.totalConstructionCost - preDeliveryConstructionCost);
  const preDeliveryMonthlyCost = round(preDeliveryConstructionCost / constructionPhaseMonths);
  const postDeliveryMonthlyCost = round(postDeliveryConstructionCost / 6);
  let cumulativeSales = 0, cumulativeCollection = 0, cumulativeOutflow = 0;
  return Array.from({ length: months }, (_, i) => {
    const monthlySales = round(collectionSchedule?.monthlySales[i] ?? summary.revenue * salesWeights[i]);
    const monthlyOperatingCashFlow = i + 1 >= operationStartMonth ? round(monthlyHoldingCashFlow) : 0;
    const monthlyCollection = round((collectionSchedule?.monthlyCollection[i] ?? summary.revenue * collectionWeights[i]) + monthlyOperatingCashFlow);
    const month = i + 1;
    const constructionOutflow = month <= constructionEndMonth
      ? month === constructionEndMonth
        ? round(preDeliveryConstructionCost - preDeliveryMonthlyCost * (constructionPhaseMonths - 1))
        : preDeliveryMonthlyCost
      : month <= constructionEndMonth + 6
        ? month === constructionEndMonth + 6
          ? round(postDeliveryConstructionCost - postDeliveryMonthlyCost * 5)
          : postDeliveryMonthlyCost
        : 0;
    const openingCostOutflow = month === constructionEndMonth ? summary.openingCost : 0;
    const managementOutflow = i < managementMonths ? summary.managementFee / managementMonths : 0;
    const salesOutflow = monthlySales * effectiveSalesFeeRate;
    const vatOutflow = monthlySales * effectiveVatRate;
    const landOutflow = i === 0 ? summary.landCost : 0;
    const monthlyOutflow = round(landOutflow + constructionOutflow + openingCostOutflow + managementOutflow + salesOutflow + vatOutflow + (i === months - 1 ? residualCost : 0));
    cumulativeSales += monthlySales;
    cumulativeCollection += monthlyCollection;
    cumulativeOutflow += monthlyOutflow;
    return {
      month: i + 1, monthlySales, monthlyCollection, monthlyOperatingCashFlow, monthlyOutflow,
      cumulativeSales: round(cumulativeSales), cumulativeCollection: round(cumulativeCollection),
      cumulativeOutflow: round(cumulativeOutflow), cumulativeNetCashFlow: round(cumulativeCollection - cumulativeOutflow)
    };
  });
}
