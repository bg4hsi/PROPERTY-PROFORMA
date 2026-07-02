import { ReactNode } from "react";
export function MetricCard({ label, value, hint, icon, details }: { label: string; value: string; hint?: string; icon?: ReactNode; details?: ReactNode }) {
  return <div className="card p-4"><div className="flex items-start justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><span className="text-teal-700">{icon}</span></div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</div>{hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}{details&&<div className="mt-3 border-t border-slate-100 pt-2">{details}</div>}</div>;
}
