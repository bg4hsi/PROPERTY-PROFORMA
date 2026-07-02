import { Scenario } from "@/types";

const holding = { annualRent: 0, annualOperatingIncome: 0, annualOperatingCost: 0, holdingYears: 10, discountRate: 0.08 };
const row = (id: string, name: string, kind: "销售" | "给政府" | "自持酒店" | "自持商业", buildingArea: number, governmentArea: number, saleArea: number, salePrice: number, unitCost: number) => ({
  id, name, kind, buildingArea, governmentArea, efficiencyRate: buildingArea ? saleArea / buildingArea : 0, saleArea, salePrice, unitCost,
  manualManagementFee: null, manualSalesFee: null, manualSecondaryAllocation: 0,
  ...(kind.startsWith("自持") ? { holding: { ...holding, ...(kind === "自持酒店" ? { roomCount: Math.round(buildingArea / 50) } : {}) } } : {})
});

const collection = (firstSaleMonth: number, deliveryMonth: number, totalUnits: number, monthlyAbsorptionUnits: number, downPaymentRate: number, monthlyCollectionRate: number, tailInstallmentMonths: number) => ({ firstSaleMonth, deliveryMonth, totalUnits, monthlyAbsorptionUnits, downPaymentRate, monthlyCollectionRate, tailInstallmentMonths });

export const sampleScenario: Scenario = {
  id: "sample-project", name: "商业综合体基准方案", updatedAt: new Date().toISOString(),
  project: {
    name: "城市商业综合体项目", location: "示例城市核心区", landArea: 22550,
    totalBuildingArea: 90200, saleableArea: 18240, heldArea: 53940, governmentArea: 18020,
    vatRate: 0.15, managementRate: 0.02, salesRate: 0.05, shareholderInterestRate: 0.08, deliveryMonth: 24, trialOperationMonths: 3,
    hotelAverageDailyRate: 800, fourStarHotelAverageDailyRate: 600, fiveStarHotelAverageDailyRate: 900,
    commercialMonthlyRent: 150, hotelOccupancyRate: .7, commercialOccupancyRate: .85,
    annualOperatingCostRate: .35,
    currencyUnit: "万元", includeHoldingReturns: false
  },
  rows: [
    { ...row("apt", "公寓（销售）", "销售", 18000, 0, 14040, 19000, 5508), collection: collection(1, 24, 250, 18, .3, .05, 3) },
    row("hotel-a", "酒店A（自持）", "自持酒店", 16400, 0, 0, 0, 6247),
    row("hotel-b-gov", "酒店B（给政府）", "给政府", 8020, 8020, 0, 0, 6247),
    row("hotel-b-hold", "酒店B（自持）", "自持酒店", 4780, 0, 0, 0, 6247),
    row("expo-gov", "会展中心（给政府）", "给政府", 10000, 10000, 0, 0, 7000),
    row("mall", "MALL（自持）", "自持商业", 24600, 0, 0, 0, 7642),
    { ...row("street-sale", "商业街（销售）", "销售", 4200, 0, 4200, 35000, 5933), collection: collection(6, 24, 42, 3, .5, .1, 6) },
    row("street-hold", "商业街（自持）", "自持商业", 4200, 0, 0, 0, 5933),
    row("parking", "车位", "销售", 0, 0, 0, 0, 0)
  ], allocations: []
};
