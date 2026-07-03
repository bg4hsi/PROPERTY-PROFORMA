"use client";
import { calculateCollectionSchedule, defaultCollectionLogic, PROJECTION_MONTHS } from "@/lib/calculationEngine";
import { AssetRow, CalculatedRow, CollectionLogic } from "@/types";

const fmt = (value: number, digits = 0) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value || 0);

export function CollectionLogicPanel({ rows, cutoffMonth, setCutoffMonth, updateRow }: { rows: CalculatedRow[]; cutoffMonth: number; setCutoffMonth: (month: number) => void; updateRow: (id: string, patch: Partial<AssetRow>) => void }) {
  const salesRows = rows.filter(row => row.kind === "销售");
  const schedule = calculateCollectionSchedule(rows, PROJECTION_MONTHS);
  const updateLogic = (row: CalculatedRow, key: keyof CollectionLogic, value: number) => updateRow(row.id, { collection: { ...defaultCollectionLogic(row), [key]: value } });
  const fields: Array<[keyof CollectionLogic, string, boolean]> = [
    ["firstSaleMonth", "首售（月）", false], ["deliveryMonth", "交付（月）", false], ["totalUnits", "总套数", false], ["monthlyAbsorptionUnits", "月去化（套）", false],
    ["downPaymentRate", "首付款（%）", true], ["monthlyCollectionRate", "月回款（%）", true], ["tailInstallmentMonths", "尾款分期（月）", false]
  ];
  const rowResult = (row: CalculatedRow) => {
    const projection = schedule.rows.find(item => item.rowId === row.id);
    const index = Math.max(0, cutoffMonth - 1);
    const logic = defaultCollectionLogic(row);
    const units = projection?.cumulativeSoldUnits[index] || 0;
    return { soldUnits: units, area: logic.totalUnits ? row.saleArea * units / logic.totalUnits : 0, sales: projection?.cumulativeSales[index] || 0, collection: projection?.cumulativeCollection[index] || 0 };
  };
  const totals = salesRows.reduce((sum, row) => { const value = rowResult(row); return { soldUnits: sum.soldUnits + value.soldUnits, area: sum.area + value.area, sales: sum.sales + value.sales, collection: sum.collection + value.collection }; }, { soldUnits: 0, area: 0, sales: 0, collection: 0 });

  return <section className="card overflow-hidden" id="collection-logic">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-900">销售与回款逻辑设置</h2><p className="mt-1 text-xs text-slate-500">支持期房/现房：按每月销售批次计算首付、过程回款与交付后尾款</p></div><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">截止第 {cutoffMonth} 月成果</span></div>
    <div className="border-b border-slate-200 bg-indigo-50/30 px-5 py-4"><label className="block"><span className="text-sm font-semibold text-slate-700">推演截止月：<strong className="text-lg text-indigo-600">第 {cutoffMonth} 月</strong></span><input aria-label="推演截止月" className="mt-3 h-2 w-full cursor-pointer accent-indigo-600" type="range" min="1" max={PROJECTION_MONTHS} value={cutoffMonth} onInput={e=>setCutoffMonth(Number(e.currentTarget.value))} onChange={e=>setCutoffMonth(Number(e.target.value))}/><div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>第1月</span><span>第{PROJECTION_MONTHS}月（5年）</span></div></label></div>
    <div className="overflow-x-auto"><table className="min-w-[1210px] w-full border-collapse text-sm"><thead><tr className="bg-indigo-50/70"><th className="sticky left-0 z-10 min-w-[150px] border-b border-r border-slate-200 bg-indigo-50 px-2 py-3 text-left">业态</th>{fields.map(([,label])=><th key={label} className="min-w-[90px] border-b border-r border-slate-200 px-2 py-3 text-center text-xs font-semibold text-slate-600">{label}<span className="ml-1 text-indigo-500">✎</span></th>)}<th className="min-w-[90px] border-b border-r border-emerald-100 bg-emerald-50 px-2 py-3 text-center text-xs text-emerald-800">已售套数</th><th className="min-w-[110px] border-b border-r border-emerald-100 bg-emerald-50 px-2 py-3 text-center text-xs text-emerald-800">截点去化（㎡）</th><th className="min-w-[110px] border-b border-r border-emerald-100 bg-emerald-50 px-2 py-3 text-center text-xs text-emerald-800">截点销售额</th><th className="min-w-[110px] border-b bg-emerald-50 px-2 py-3 text-center text-xs text-emerald-800">截点已回款</th></tr></thead>
      <tbody>{salesRows.map(row => { const logic = defaultCollectionLogic(row); const result = rowResult(row); return <tr key={row.id}><td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-2 font-medium">{row.name}</td>{fields.map(([key,,percent])=><td key={key} className="border-b border-r border-slate-200"><div className="relative"><input aria-label={`${row.name}${key}`} className={`table-input ${percent?"!pr-8":""}`} type="number" min="0" step={percent?.1:1} value={percent ? Number((logic[key]*100).toFixed(2)) : logic[key]} onChange={e=>updateLogic(row,key,Number(e.target.value)/(percent?100:1))}/>{percent&&<span className="pointer-events-none absolute right-2 top-1/2 w-3 -translate-y-1/2 text-center text-xs text-slate-400">%</span>}</div></td>)}<td className="border-b border-r border-emerald-100 bg-emerald-50/40 px-2 text-right font-medium tabular-nums">{fmt(result.soldUnits)}</td><td className="border-b border-r border-emerald-100 bg-emerald-50/40 px-2 text-right tabular-nums">{fmt(result.area)}</td><td className="border-b border-r border-emerald-100 bg-emerald-50/40 px-2 text-right font-medium tabular-nums">{fmt(result.sales)}</td><td className="border-b bg-emerald-50/40 px-2 text-right font-semibold tabular-nums text-emerald-700">{fmt(result.collection)}</td></tr>; })}
      <tr className="bg-slate-100 font-semibold"><td className="sticky left-0 z-10 bg-slate-100 px-2 py-3">合计</td><td colSpan={7}/><td className="px-2 text-right">{fmt(totals.soldUnits)}</td><td className="px-2 text-right">{fmt(totals.area)}</td><td className="px-2 text-right">{fmt(totals.sales)}</td><td className="px-2 text-right text-emerald-700">{fmt(totals.collection)}</td></tr></tbody></table></div>
  </section>;
}
