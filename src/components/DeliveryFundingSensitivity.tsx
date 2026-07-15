"use client";
import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { calculateCashFlowProjection, calculateCollectionSchedule, calculateProject, calculateSimulationSummary, PROJECTION_MONTHS } from "@/lib/calculationEngine";
import { AssetRow, ProjectInfo } from "@/types";

const number = (value: number, digits = 0) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value || 0);
const money = (value: number) => `${number(value)} 万元`;

function fundingPeak(points: ReturnType<typeof calculateCashFlowProjection>, endMonth?: number) {
  const scoped = endMonth ? points.slice(0, Math.max(1, Math.min(points.length, endMonth))) : points;
  const peak = scoped.reduce((lowest, point) => point.cumulativeNetCashFlow < lowest.cumulativeNetCashFlow ? point : lowest, scoped[0]);
  return { amount: Math.max(0, -(peak?.cumulativeNetCashFlow || 0)), month: peak?.month || 1 };
}

export function DeliveryFundingSensitivity({ rows, project }: { rows: AssetRow[]; project: ProjectInfo }) {
  const analysis = useMemo(() => {
    const baseDelivery = Math.max(1, Math.min(PROJECTION_MONTHS, Math.round(project.deliveryMonth || 24)));
    const months = Array.from(new Set([baseDelivery - 6, baseDelivery - 3, baseDelivery, baseDelivery + 3, baseDelivery + 6]
      .map(month => Math.max(1, Math.min(PROJECTION_MONTHS, month)))))
      .sort((a, b) => a - b);
    const evaluate = (deliveryMonth: number) => {
      const adjustedProject = { ...project, deliveryMonth };
      const result = calculateProject(rows, adjustedProject, []);
      const schedule = calculateCollectionSchedule(result.rows, PROJECTION_MONTHS, adjustedProject);
      const summary = calculateSimulationSummary(result.summary, {
        managementRate: adjustedProject.managementRate,
        salesRate: adjustedProject.salesRate,
        vatRate: adjustedProject.vatRate
      }).summary;
      const cashFlow = calculateCashFlowProjection(summary, PROJECTION_MONTHS, schedule, deliveryMonth, adjustedProject.trialOperationMonths ?? 3, result.rows, adjustedProject);
      const fullCashFlow = calculateCashFlowProjection({ ...summary, includeHoldingReturns: true }, PROJECTION_MONTHS, schedule, deliveryMonth, adjustedProject.trialOperationMonths ?? 3, result.rows, adjustedProject);
      const constructionEndMonth = result.rows.some(row => row.name.includes("二期"))
        ? Math.max(deliveryMonth, adjustedProject.phase2DeliveryMonth || 48)
        : deliveryMonth;
      return {
        deliveryMonth,
        constructionPeak: fundingPeak(cashFlow, constructionEndMonth),
        fullPeak: fundingPeak(fullCashFlow),
        shareholderInterest: result.summary.shareholderInterest,
        netProfit: result.summary.netProfitExcludingHoldingReturns,
        roi: result.summary.roiExcludingHoldingReturns
      };
    };
    const scenarios = months.map(evaluate);
    const base = scenarios.find(item => item.deliveryMonth === baseDelivery) || evaluate(baseDelivery);
    const best = scenarios.reduce((lowest, item) => item.constructionPeak.amount < lowest.constructionPeak.amount ? item : lowest, scenarios[0]);
    return { baseDelivery, scenarios, base, best };
  }, [rows, project]);

  return <section className="card overflow-hidden" id="delivery-funding-sensitivity">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-violet-50 p-2 text-violet-700"><CalendarClock size={20}/></span><div><h2 className="font-semibold text-slate-900">交付月与资金峰值敏感性分析</h2><p className="mt-1 text-xs text-slate-500">围绕当前交付月前后 3/6 个月推演，完整重算回款、建安支出、开办费、自持开业和股东计息</p></div></div>
      <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">当前交付月：第 {analysis.baseDelivery} 月</span>
    </div>
    <div className="grid gap-3 border-b border-slate-100 bg-slate-50/50 p-5 md:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">当前建设期资金峰值</div><div className="mt-1 text-xl font-bold text-slate-900">{money(analysis.base.constructionPeak.amount)}</div><div className="mt-1 text-xs text-slate-400">峰值第 {analysis.base.constructionPeak.month} 月</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">样本中最低建设期峰值</div><div className="mt-1 text-xl font-bold text-emerald-700">{money(analysis.best.constructionPeak.amount)}</div><div className="mt-1 text-xs text-slate-400">交付第 {analysis.best.deliveryMonth} 月</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">当前全项目资金峰值</div><div className="mt-1 text-xl font-bold text-cyan-700">{money(analysis.base.fullPeak.amount)}</div><div className="mt-1 text-xs text-slate-400">含自持开业后净流入，峰值第 {analysis.base.fullPeak.month} 月</div></div>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-[920px] w-full border-collapse text-sm">
        <thead><tr className="bg-violet-50/70 text-xs text-slate-600"><th className="border-b border-r border-slate-200 px-3 py-3 text-left">交付月</th><th className="border-b border-r border-slate-200 px-3 py-3 text-right">建设期资金峰值</th><th className="border-b border-r border-slate-200 px-3 py-3 text-right">较当前变化</th><th className="border-b border-r border-slate-200 px-3 py-3 text-right">全项目资金峰值</th><th className="border-b border-r border-slate-200 px-3 py-3 text-right">股东计息</th><th className="border-b border-r border-slate-200 px-3 py-3 text-right">净利润</th><th className="border-b px-3 py-3 text-right">项目回报率</th></tr></thead>
        <tbody>{analysis.scenarios.map(item => {
          const isBase = item.deliveryMonth === analysis.baseDelivery;
          const change = item.constructionPeak.amount - analysis.base.constructionPeak.amount;
          return <tr key={item.deliveryMonth} className={isBase ? "bg-violet-50/50 font-semibold" : "bg-white"}>
            <td className="border-b border-r border-slate-100 px-3 py-3">{isBase ? `第 ${item.deliveryMonth} 月（当前）` : `第 ${item.deliveryMonth} 月`}</td>
            <td className="border-b border-r border-slate-100 px-3 py-3 text-right tabular-nums">{money(item.constructionPeak.amount)}<div className="text-[11px] font-normal text-slate-400">峰值第 {item.constructionPeak.month} 月</div></td>
            <td className={`border-b border-r border-slate-100 px-3 py-3 text-right tabular-nums ${change > 0 ? "text-rose-600" : change < 0 ? "text-emerald-700" : "text-slate-500"}`}>{change === 0 ? "—" : `${change > 0 ? "+" : ""}${money(change)}`}</td>
            <td className="border-b border-r border-slate-100 px-3 py-3 text-right tabular-nums">{money(item.fullPeak.amount)}<div className="text-[11px] font-normal text-slate-400">峰值第 {item.fullPeak.month} 月</div></td>
            <td className="border-b border-r border-slate-100 px-3 py-3 text-right tabular-nums">{money(item.shareholderInterest)}</td>
            <td className={`border-b border-r border-slate-100 px-3 py-3 text-right tabular-nums ${item.netProfit < 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(item.netProfit)}</td>
            <td className="border-b px-3 py-3 text-right tabular-nums">{number(item.roi * 100, 1)}%</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}
