"use client";
import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { calculateProject, normalizeAssetKind } from "@/lib/calculationEngine";
import { AssetRow, ProjectInfo } from "@/types";

const changes = [-0.1, -0.05, 0, 0.05, 0.1];
const number = (value: number, digits = 0) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value || 0);

export function SensitivityAnalysis({ rows, project }: { rows: AssetRow[]; project: ProjectInfo }) {
  const analysis = useMemo(() => {
    const saleArea = rows.reduce((total, row) => total + (normalizeAssetKind(row) === "销售" ? row.saleArea : 0), 0);
    const evaluate = (factor: number) => {
      const adjustedRows = rows.map(row => normalizeAssetKind(row) === "销售" ? { ...row, salePrice: row.salePrice * factor } : row);
      const summary = calculateProject(adjustedRows, { ...project, includeHoldingReturns: false }, []).summary;
      return {
        factor,
        weightedPrice: saleArea ? summary.revenue * 10000 / saleArea : 0,
        revenue: summary.revenue,
        profit: summary.netProfitExcludingHoldingReturns,
        roi: summary.roiExcludingHoldingReturns
      };
    };
    const scenarios = changes.map(change => ({ change, ...evaluate(1 + change) }));
    const base = scenarios.find(item => item.change === 0)!;
    const plusOne = evaluate(1.01);
    const profitImpactPerPercent = plusOne.profit - base.profit;
    let breakEvenPrice: number | null = null;
    let breakEvenFactor: number | null = null;
    if (saleArea > 0) {
      const low = evaluate(0);
      const high = evaluate(5);
      if (low.profit >= 0) {
        breakEvenFactor = 0;
        breakEvenPrice = 0;
      }
      else if (high.profit >= 0) {
        let left = 0, right = 5;
        for (let index = 0; index < 28; index++) {
          const middle = (left + right) / 2;
          if (evaluate(middle).profit >= 0) right = middle; else left = middle;
        }
        breakEvenFactor = right;
        breakEvenPrice = evaluate(right).weightedPrice;
      }
    }
    const breakEvenProducts = breakEvenFactor === null ? [] : rows
      .filter(row => normalizeAssetKind(row) === "销售")
      .map(row => ({ id: row.id, name: row.name, currentPrice: row.salePrice, breakEvenPrice: row.salePrice * breakEvenFactor! }));
    return { scenarios, base, profitImpactPerPercent, breakEvenPrice, breakEvenFactor, breakEvenProducts, saleArea };
  }, [rows, project]);

  const money = (value: number) => `${number(value)} 万元`;
  return <section className="card overflow-hidden" id="sensitivity">
    <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><span className="rounded-xl bg-rose-50 p-2 text-rose-600"><TrendingUp size={20}/></span><div><h2 className="font-semibold text-slate-900">售价与利润敏感性分析</h2><p className="mt-1 text-xs text-slate-500">统一调整全部销售业态售价，并完整重算税费、销管费、现金流与股东计息；净利润不含自持经营回报</p></div></div>
    <div className="grid gap-3 border-b border-slate-100 bg-slate-50/50 p-5 md:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">基准加权销售单价</div><div className="mt-1 text-xl font-bold text-slate-900">{analysis.saleArea?`${number(analysis.base.weightedPrice)} 元/㎡`:"—"}</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">售价每上涨 1%</div><div className={`mt-1 text-xl font-bold ${analysis.profitImpactPerPercent<0?"text-rose-600":"text-emerald-700"}`}>{analysis.saleArea?`${analysis.profitImpactPerPercent>=0?"+":""}${money(analysis.profitImpactPerPercent)}`:"—"}</div><div className="mt-1 text-xs text-slate-400">净利润变化</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">估算盈亏平衡售价</div><div className="mt-1 text-xl font-bold text-amber-700">{!analysis.saleArea?"无销售业态":analysis.breakEvenPrice===null?"测算范围内未平衡":`${number(analysis.breakEvenPrice)} 元/㎡`}</div><div className="mt-1 text-xs text-slate-400">净利润约等于 0</div></div>
    </div>
    {analysis.breakEvenProducts.length>0&&<div className="border-b border-slate-100 px-5 py-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-800">各可售产品盈亏平衡售价</h3><p className="mt-1 text-xs text-slate-400">各产品按相同售价调整比例测算，保持当前产品之间的价差关系</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">较当前售价 {analysis.breakEvenFactor!>=1?"+":""}{number((analysis.breakEvenFactor!-1)*100,1)}%</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{analysis.breakEvenProducts.map(product=><div key={product.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2"><span className="truncate text-xs text-slate-600" title={product.name}>{product.name}</span><div className="shrink-0 text-right"><div className="text-sm font-bold tabular-nums text-amber-800">{number(product.breakEvenPrice)} 元/㎡</div><div className="text-[10px] text-slate-400">当前 {number(product.currentPrice)} 元/㎡</div></div></div>)}</div></div>}
    <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">{analysis.scenarios.map(scenario=>{
      const isBase=scenario.change===0;
      const profitChange=scenario.profit-analysis.base.profit;
      return <div key={scenario.change} className={`rounded-xl border p-4 ${isBase?"border-teal-400 bg-teal-50/60 ring-1 ring-teal-200":"border-slate-200 bg-white"}`}>
        <div className="flex items-center justify-between"><span className={`text-sm font-semibold ${isBase?"text-teal-800":"text-slate-700"}`}>{isBase?"基准售价":`售价 ${scenario.change>0?"+":""}${number(scenario.change*100)}%`}</span>{isBase&&<span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-semibold text-white">当前</span>}</div>
        <div className="mt-3 text-xs text-slate-500">加权售价</div><div className="font-semibold tabular-nums text-slate-800">{number(scenario.weightedPrice)} 元/㎡</div>
        <div className="mt-3 text-xs text-slate-500">项目净利润</div><div className={`text-lg font-bold tabular-nums ${scenario.profit<0?"text-rose-600":"text-emerald-700"}`}>{money(scenario.profit)}</div>
        <div className="mt-2 flex justify-between text-xs"><span className="text-slate-400">较基准</span><span className={`font-medium ${profitChange<0?"text-rose-600":profitChange>0?"text-emerald-700":"text-slate-500"}`}>{profitChange===0?"—":`${profitChange>0?"+":""}${money(profitChange)}`}</span></div>
        <div className="mt-1 flex justify-between text-xs"><span className="text-slate-400">销售收入</span><span className="font-medium text-slate-700">{money(scenario.revenue)}</span></div>
        <div className="mt-1 flex justify-between text-xs"><span className="text-slate-400">回报率</span><span className="font-medium text-slate-700">{number(scenario.roi*100,1)}%</span></div>
      </div>;
    })}</div>
  </section>;
}
