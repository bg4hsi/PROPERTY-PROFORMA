"use client";
import { Settings2 } from "lucide-react";
import { AssetRow, ProjectInfo } from "@/types";
import { PROJECTION_MONTHS } from "@/lib/calculationEngine";

export function ProjectSettings({ project, rows, landModel, updateProject }: {
  project: ProjectInfo;
  rows: Pick<AssetRow, "name">[];
  landModel: boolean;
  updateProject: (patch: Partial<ProjectInfo>) => void;
}) {
  const rateDefault = (key: "vatRate"|"managementRate"|"salesRate"|"shareholderInterestRate"|"annualOperatingCostRate"|"holdingDiscountRate"|"collectionDownPaymentRate"|"collectionMonthlyRate"|"fullPaymentRate"|"fullPaymentDiscountRate") => {
    if (key === "annualOperatingCostRate") return .35;
    if (key === "holdingDiscountRate") return .08;
    if (key === "shareholderInterestRate") return .08;
    if (key === "collectionDownPaymentRate") return .3;
    if (key === "collectionMonthlyRate") return .05;
    return 0;
  };
  const rateField = (label: string, key: "vatRate"|"managementRate"|"salesRate"|"shareholderInterestRate"|"annualOperatingCostRate"|"holdingDiscountRate"|"collectionDownPaymentRate"|"collectionMonthlyRate"|"fullPaymentRate"|"fullPaymentDiscountRate") => <label><span className="label">{label}</span><div className="relative"><input className="field h-11 !pr-10" type="number" min="0" max="100" step="0.1" value={Number(((project[key] ?? rateDefault(key))*100).toFixed(2))} onChange={e=>updateProject({[key]:Math.max(0,Math.min(100,Number(e.target.value)))/100})}/><span className="pointer-events-none absolute right-3 top-1/2 w-3 -translate-y-1/2 text-center text-sm text-slate-400">%</span></div></label>;
  const deliveryMonth = project.deliveryMonth || 24;
  const trialOperationMonths = project.trialOperationMonths ?? 3;
  const hasMall = rows.some(row => /MALL/i.test(row.name));
  return <section className="space-y-4" id="project-settings">
    <div className="card overflow-hidden"><div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><span className="rounded-xl bg-teal-50 p-2 text-teal-700"><Settings2 size={20}/></span><div><h2 className="font-semibold text-slate-900">项目基础设置</h2><p className="mt-1 text-xs text-slate-500">统一管理税费、交付节点、销售回款及推演时间</p></div></div>
      <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-5">{rateField("增值税税率","vatRate")}{rateField("管理费率","managementRate")}{rateField("销售费率","salesRate")}
        {rateField("股东计息利率","shareholderInterestRate")}
        {rateField("首付款比例","collectionDownPaymentRate")}
        {rateField("月回款比例","collectionMonthlyRate")}
        {rateField("全款比例","fullPaymentRate")}
        {rateField("全款优惠比例","fullPaymentDiscountRate")}
        <label><span className="label">尾款分期（月）</span><input aria-label="尾款分期月数" className="field h-11" type="number" min="0" max={PROJECTION_MONTHS} value={project.collectionTailInstallmentMonths ?? 3} onChange={e=>updateProject({collectionTailInstallmentMonths:Math.max(0,Math.min(PROJECTION_MONTHS,Number(e.target.value)))})}/></label>
        {landModel&&<label><span className="label">土地总价（万元）</span><input aria-label="土地总价" className="field h-11" type="number" min="0" value={project.landTotalPrice ?? 0} onChange={e=>updateProject({landTotalPrice:Number(e.target.value)})}/></label>}
        {landModel&&<label><span className="label">土地面积（㎡）</span><input aria-label="土地面积" className="field h-11" type="number" min="0" value={project.landArea ?? 0} onChange={e=>updateProject({landArea:Number(e.target.value)})}/></label>}
        <label><span className="label">交付月</span><input aria-label="项目交付月" className="field h-11" type="number" min="1" max={PROJECTION_MONTHS} value={deliveryMonth} onChange={e=>updateProject({deliveryMonth:Math.max(1,Math.min(PROJECTION_MONTHS,Number(e.target.value)))})}/></label>
        <label><span className="label">试营业（月）</span><input aria-label="试营业月数" className="field h-11" type="number" min="0" max="120" value={trialOperationMonths} onChange={e=>updateProject({trialOperationMonths:Math.max(0,Math.min(120,Number(e.target.value)))})}/></label>
        {rateField("年经营成本占比","annualOperatingCostRate")}
        {rateField("自持折现率","holdingDiscountRate")}
        <label><span className="label">四星级酒店单客房平均每晚房价（元）</span><input className="field h-11" type="number" min="0" value={project.fourStarHotelAverageDailyRate ?? project.hotelAverageDailyRate ?? 600} onChange={e=>updateProject({fourStarHotelAverageDailyRate:Number(e.target.value)})}/></label>
        <label><span className="label">五星级酒店单客房平均每晚房价（元）</span><input className="field h-11" type="number" min="0" value={project.fiveStarHotelAverageDailyRate ?? project.hotelAverageDailyRate ?? 900} onChange={e=>updateProject({fiveStarHotelAverageDailyRate:Number(e.target.value)})}/></label>
        <label><span className="label">四星级酒店开办费（元/建筑㎡）</span><input className="field h-11" type="number" min="0" value={project.fourStarHotelOpeningCost ?? 0} onChange={e=>updateProject({fourStarHotelOpeningCost:Number(e.target.value)})}/></label>
        <label><span className="label">五星级酒店开办费（元/建筑㎡）</span><input className="field h-11" type="number" min="0" value={project.fiveStarHotelOpeningCost ?? 0} onChange={e=>updateProject({fiveStarHotelOpeningCost:Number(e.target.value)})}/></label>
        {hasMall&&<label><span className="label">MALL开办费（元/建筑㎡）</span><input className="field h-11" type="number" min="0" value={project.mallOpeningCost ?? 0} onChange={e=>updateProject({mallOpeningCost:Number(e.target.value)})}/></label>}
        {hasMall&&<label><span className="label">商业出租每平米每月租金（元）</span><input className="field h-11" type="number" min="0" value={project.commercialMonthlyRent ?? 150} onChange={e=>updateProject({commercialMonthlyRent:Number(e.target.value)})}/></label>}
        <label><span className="label">酒店入住率</span><div className="relative"><input className="field h-11 !pr-10" type="number" min="0" max="100" step="0.1" value={Number(((project.hotelOccupancyRate ?? .7)*100).toFixed(2))} onChange={e=>updateProject({hotelOccupancyRate:Number(e.target.value)/100})}/><span className="pointer-events-none absolute right-3 top-1/2 w-3 -translate-y-1/2 text-center text-sm text-slate-400">%</span></div></label>
        {hasMall&&<label><span className="label">商业出租率</span><div className="relative"><input className="field h-11 !pr-10" type="number" min="0" max="100" step="0.1" value={Number(((project.commercialOccupancyRate ?? .85)*100).toFixed(2))} onChange={e=>updateProject({commercialOccupancyRate:Number(e.target.value)/100})}/><span className="pointer-events-none absolute right-3 top-1/2 w-3 -translate-y-1/2 text-center text-sm text-slate-400">%</span></div></label>}
      </div>
    </div>
  </section>;
}
