"use client";
import { useMemo, useState } from "react";
import { CashFlowPoint, CollectionSchedule, calculateCashFlowProjection, calculateSimulationSummary, PROJECTION_MONTHS } from "@/lib/calculationEngine";
import { ProjectInfo, ProjectSummary } from "@/types";

const money = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value || 0);
const colors = {
  salesBar: "#93c5fd", collectionBar: "#34d399", outflowBar: "#fbbf24",
  sales: "#2563eb", collection: "#059669", outflow: "#d97706", net: "#7c3aed"
};

export function CashFlowChart({ summary, project, collectionSchedule, cutoffMonth }: { summary: ProjectSummary; project: ProjectInfo; collectionSchedule: CollectionSchedule; cutoffMonth: number }) {
  const months = PROJECTION_MONTHS;
  const [hoveredMonth, setHoveredMonth] = useState<number|null>(null);
  const simulation = useMemo(() => calculateSimulationSummary(summary, { managementRate: project.managementRate, salesRate: project.salesRate, vatRate: project.vatRate }), [summary, project.managementRate, project.salesRate, project.vatRate]);
  const data = useMemo(() => calculateCashFlowProjection(simulation.summary, months, collectionSchedule, project.deliveryMonth || 24, project.trialOperationMonths ?? 3), [simulation.summary, collectionSchedule, project.deliveryMonth, project.trialOperationMonths]);
  const point = data[Math.max(0, cutoffMonth - 1)];

  const width = 1280, height = 500, left = 78, right = 88, top = 34, bottom = 82;
  const plotW = width - left - right, plotH = height - top - bottom;
  const maxMonthlyRaw = Math.max(1, ...data.flatMap(d => [d.monthlySales, d.monthlyCollection, d.monthlyOutflow]));
  const maxMonthly = Math.ceil(maxMonthlyRaw / 1000) * 1000;
  const cumulativeValues = data.flatMap(d => [d.cumulativeSales, d.cumulativeCollection, d.cumulativeOutflow, d.cumulativeNetCashFlow]);
  const maxCum = Math.ceil(Math.max(1, ...cumulativeValues) / 10000) * 10000;
  const minCum = Math.floor(Math.min(0, ...cumulativeValues) / 10000) * 10000;
  const x = (index: number) => left + (index + .5) * plotW / data.length;
  const monthlyY = (value: number) => top + plotH - value / maxMonthly * plotH;
  const cumulativeY = (value: number) => top + (maxCum - value) / Math.max(1, maxCum - minCum) * plotH;
  const line = (key: keyof CashFlowPoint) => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${cumulativeY(d[key] as number).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, i) => i / 4);
  const legend = [
    ["当月新增销售", colors.salesBar, "bar"], ["当月回款/经营净流入", colors.collectionBar, "bar"], ["当月项目支出", colors.outflowBar, "bar"],
    ["累计销售额", colors.sales, "line"], ["累计回款", colors.collection, "line"], ["累计支出", colors.outflow, "line"], ["累计净现金流", colors.net, "line"]
  ];
  const hovered = hoveredMonth === null ? null : data[hoveredMonth];
  const tooltipWidth = 335, tooltipGap = 20;
  const hoveredX = hoveredMonth === null ? 0 : x(hoveredMonth);
  const tooltipSide = hoveredX > left + plotW / 2 ? "left" : "right";
  const tooltipX = hoveredMonth === null ? 0 : tooltipSide === "left"
    ? Math.max(left + 8, hoveredX - tooltipWidth - tooltipGap)
    : Math.min(width - right - tooltipWidth, hoveredX + tooltipGap);

  return <section className="space-y-4" id="cash-flow">
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-5"><h2 className="text-lg font-bold text-slate-900">项目全周期资金动态推演曲线</h2><p className="mt-1 text-xs text-slate-500">鼠标悬停月份查看当月与累计资金明细</p></div>
      <div className="overflow-x-auto px-3 pb-4"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[900px] w-full" role="img" aria-label="项目全周期现金流量图" onMouseLeave={()=>setHoveredMonth(null)}>
        {ticks.map((ratio, i) => { const y = top + ratio * plotH; return <g key={i}><line x1={left} x2={width-right} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="5 6"/><text x={left-12} y={y+5} textAnchor="end" fill="#64748b" fontSize="13">{money(maxMonthly * (1-ratio))}</text><text x={width-right+13} y={y+5} fill="#64748b" fontSize="13">{money(maxCum-ratio*(maxCum-minCum))}</text></g>; })}
        <line x1={left} x2={width-right} y1={cumulativeY(0)} y2={cumulativeY(0)} stroke="#cbd5e1"/>
        {data.map((d, i) => { const groupW = Math.max(5, plotW/data.length*.72), barW=groupW/3; return <g key={d.month} opacity={d.month>cutoffMonth?.42:1}><title>第{d.month}个月：销售 {money(d.monthlySales)}，回款及经营净流入 {money(d.monthlyCollection)}，支出 {money(d.monthlyOutflow)} 万元</title><rect x={x(i)-groupW/2} y={monthlyY(d.monthlySales)} width={barW} height={top+plotH-monthlyY(d.monthlySales)} rx="2" fill={colors.salesBar}/><rect x={x(i)-groupW/2+barW} y={monthlyY(d.monthlyCollection)} width={barW} height={top+plotH-monthlyY(d.monthlyCollection)} rx="2" fill={colors.collectionBar}/><rect x={x(i)-groupW/2+barW*2} y={monthlyY(d.monthlyOutflow)} width={barW} height={top+plotH-monthlyY(d.monthlyOutflow)} rx="2" fill={colors.outflowBar}/>{d.month%6===0&&<text x={x(i)} y={top+plotH+25} textAnchor="middle" fill="#64748b" fontSize="13">第{d.month}个月</text>}</g>; })}
        <path d={line("cumulativeSales")} fill="none" stroke={colors.sales} strokeWidth="3"/><path d={line("cumulativeCollection")} fill="none" stroke={colors.collection} strokeWidth="3"/><path d={line("cumulativeOutflow")} fill="none" stroke={colors.outflow} strokeWidth="3"/><path d={line("cumulativeNetCashFlow")} fill="none" stroke={colors.net} strokeWidth="4"/>
        <line x1={x(cutoffMonth-1)} x2={x(cutoffMonth-1)} y1={top} y2={top+plotH} stroke="#1d4ed8" strokeWidth="2" strokeDasharray="6 5"/><text x={x(cutoffMonth-1)+7} y={top+16} fill="#1d4ed8" fontSize="13" fontWeight="700">第{cutoffMonth}月</text>
        {([["cumulativeSales",colors.sales],["cumulativeCollection",colors.collection],["cumulativeOutflow",colors.outflow],["cumulativeNetCashFlow",colors.net]] as Array<[keyof CashFlowPoint,string]>).map(([key,color])=><circle key={key} cx={x(cutoffMonth-1)} cy={cumulativeY(point[key] as number)} r="5" fill="white" stroke={color} strokeWidth="3"/>)}
        {hovered && <g pointerEvents="none"><line x1={x(hoveredMonth!)} x2={x(hoveredMonth!)} y1={top} y2={top+plotH} stroke="#64748b" strokeWidth="1.5"/>{([["cumulativeSales",colors.sales],["cumulativeCollection",colors.collection],["cumulativeOutflow",colors.outflow],["cumulativeNetCashFlow",colors.net]] as Array<[keyof CashFlowPoint,string]>).map(([key,color])=><circle key={key} cx={x(hoveredMonth!)} cy={cumulativeY(hovered[key] as number)} r="5" fill="white" stroke={color} strokeWidth="3"/>)}</g>}
        {data.map((d,i)=><rect key={`hit-${d.month}`} x={left+i*plotW/data.length} y={top} width={plotW/data.length} height={plotH} fill="transparent" onMouseEnter={()=>setHoveredMonth(i)} onMouseMove={()=>setHoveredMonth(i)}><title>第{d.month}个月</title></rect>)}
        {hovered && <foreignObject x={tooltipX} y={top+14} width={tooltipWidth} height="390" pointerEvents="none" data-tooltip-side={tooltipSide}><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xl"><div className="mb-2 text-lg font-bold text-slate-900">第{hovered.month}个月</div><div className="space-y-1.5 text-sm font-medium tabular-nums"><div style={{color:colors.salesBar}}>当月新增销售：{money(hovered.monthlySales)} 万元</div><div style={{color:colors.collectionBar}}>当月回款/经营净流入：{money(hovered.monthlyCollection)} 万元</div><div className="pl-3 text-xs text-emerald-600">其中经营净现金流：{money(hovered.monthlyOperatingCashFlow)} 万元</div><div style={{color:colors.outflowBar}}>当月项目支出：{money(hovered.monthlyOutflow)} 万元</div><div className="ml-3 space-y-0.5 border-l border-amber-100 pl-3 text-xs text-slate-500"><div className="flex justify-between gap-3"><span>土地款</span><span>{money(hovered.monthlyLandOutflow)} 万元</span></div><div className="flex justify-between gap-3"><span>建安成本</span><span>{money(hovered.monthlyConstructionOutflow)} 万元</span></div><div className="flex justify-between gap-3"><span>开办费</span><span>{money(hovered.monthlyOpeningCostOutflow)} 万元</span></div><div className="flex justify-between gap-3"><span>管理费</span><span>{money(hovered.monthlyManagementOutflow)} 万元</span></div><div className="flex justify-between gap-3"><span>销售费</span><span>{money(hovered.monthlySalesFeeOutflow)} 万元</span></div><div className="flex justify-between gap-3"><span>增值税</span><span>{money(hovered.monthlyVatOutflow)} 万元</span></div><div className="flex justify-between gap-3"><span>其他</span><span>{money(hovered.monthlyOtherOutflow)} 万元</span></div></div><div className="my-2 border-t border-slate-100"/><div style={{color:colors.sales}}>累计销售额：{money(hovered.cumulativeSales)} 万元</div><div style={{color:colors.collection}}>累计回款及经营净流入：{money(hovered.cumulativeCollection)} 万元</div><div style={{color:colors.outflow}}>累计支出：{money(hovered.cumulativeOutflow)} 万元</div><div style={{color:colors.net}}>累计净现金流：{money(hovered.cumulativeNetCashFlow)} 万元</div></div></div></foreignObject>}
        <g transform={`translate(${left},${height-25})`}>{legend.map(([label,color,type],i)=>{const itemX=i*155;return <g key={label} transform={`translate(${itemX},0)`}>{type==="bar"?<rect width="18" height="12" y="-10" rx="2" fill={color}/>:<><line x1="0" x2="20" y1="-4" y2="-4" stroke={color} strokeWidth="3"/><circle cx="10" cy="-4" r="3" fill="white" stroke={color} strokeWidth="2"/></>}<text x="26" y="0" fill={color} fontSize="13" fontWeight="600">{label}</text></g>})}</g>
      </svg></div>
    </div>
  </section>;
}
