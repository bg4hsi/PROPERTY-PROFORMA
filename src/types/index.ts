export type CurrencyUnit = "万元" | "元" | "美元";
export type AssetKind = "销售" | "给政府" | "自持酒店" | "自持商业" | "其他自持";
export type AllocationMethod = "buildingArea" | "saleArea" | "revenue" | "manual";

export interface ProjectInfo {
  name: string;
  location: string;
  landArea: number;
  /** 无“给政府”业态时启用的土地总价，单位：万元。 */
  landTotalPrice?: number;
  totalBuildingArea: number;
  saleableArea: number;
  heldArea: number;
  governmentArea: number;
  vatRate: number;
  managementRate: number;
  salesRate: number;
  shareholderInterestRate: number;
  deliveryMonth: number;
  trialOperationMonths: number;
  /** 旧方案兼容字段，新方案使用四星/五星价格。 */
  hotelAverageDailyRate?: number;
  fourStarHotelAverageDailyRate: number;
  fiveStarHotelAverageDailyRate: number;
  /** 酒店及会展类开办费标准，单位：元/建筑平方米。 */
  fourStarHotelOpeningCost?: number;
  fiveStarHotelOpeningCost?: number;
  mallOpeningCost?: number;
  commercialMonthlyRent: number;
  hotelOccupancyRate: number;
  commercialOccupancyRate: number;
  annualOperatingCostRate: number;
  currencyUnit: CurrencyUnit;
  includeHoldingReturns: boolean;
}

export interface HoldingReturn {
  roomCount?: number;
  annualRent: number;
  annualOperatingIncome: number;
  annualOperatingCost: number;
  holdingYears: number;
  discountRate: number;
}

export interface CollectionLogic {
  firstSaleMonth: number;
  deliveryMonth: number;
  totalUnits: number;
  monthlyAbsorptionUnits: number;
  downPaymentRate: number;
  monthlyCollectionRate: number;
  tailInstallmentMonths: number;
}

export interface AssetRow {
  id: string;
  name: string;
  kind: AssetKind;
  buildingArea: number;
  governmentArea: number;
  /** 得房率，使用小数表示（例如 78% = 0.78）。旧方案可缺省并由销售面积反推。 */
  efficiencyRate?: number;
  saleArea: number;
  salePrice: number;
  unitCost: number;
  manualManagementFee: number | null;
  manualSalesFee: number | null;
  manualSecondaryAllocation: number;
  collection?: CollectionLogic;
  holding?: HoldingReturn;
}

export interface AllocationRule {
  id: string;
  sourceIds: string[];
  targetIds: string[];
  method: AllocationMethod;
  amount: number;
}

export interface Scenario {
  id: string;
  name: string;
  updatedAt: string;
  project: ProjectInfo;
  rows: AssetRow[];
  allocations: AllocationRule[];
}

export interface CalculatedRow extends AssetRow {
  revenue: number;
  baseConstructionCost: number;
  governmentConstructionCost: number;
  secondaryAllocation: number;
  totalConstructionCost: number;
  openingCost: number;
  allocatedLandCost: number;
  allocatedLandUnitCost: number;
  managementFee: number;
  salesFee: number;
  vat: number;
  shareholderInterest: number;
  netProfit: number;
  fullUnitCost: number;
  unitProfit: number;
  annualNetCashFlow: number;
  paybackPeriod: number | null;
  cumulativeReturn: number;
  npv: number;
  irr: number | null;
}

export interface ProjectSummary {
  revenue: number;
  holdingReturns: number;
  holdingAnnualNetCashFlow: number;
  includeHoldingReturns: boolean;
  totalIncome: number;
  totalConstructionCost: number;
  openingCost: number;
  /** 土地总价模型计入的土地成本；政府模型下为 0。 */
  landCost: number;
  managementFeeBase: number;
  managementFee: number;
  salesFee: number;
  vat: number;
  shareholderInterest: number;
  totalCost: number;
  netProfit: number;
  roi: number;
  netProfitExcludingHoldingReturns: number;
  netProfitIncludingHoldingReturns: number;
  roiExcludingHoldingReturns: number;
  roiIncludingHoldingReturns: number;
  governmentArea: number;
  governmentRatio: number;
  governmentCost: number;
}
