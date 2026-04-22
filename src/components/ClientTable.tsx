"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClientStats } from "@/lib/types";
import { HealthBadge } from "./HealthBadge";
import { TrendChart } from "./TrendChart";

type SortKey =
  | "name"
  | "health"
  | "dealsThisMonth"
  | "projectedThisMonth"
  | "avgTrailing3mo"
  | "momChangePct"
  | "totalDeals";

const HEALTH_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  healthy: 3,
};

function formatMoMPct(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(0)}%`;
}

function projectedTone(projected: number, avg: number): string {
  if (avg <= 0) return "text-slate-500";
  const ratio = projected / avg;
  if (ratio < 0.5) return "text-red-700 font-semibold";
  if (ratio < 0.75) return "text-amber-700 font-semibold";
  return "text-emerald-700";
}

export function ClientTable({ clients }: { clients: ClientStats[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    const arr = [...clients];
    arr.sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      switch (sortKey) {
        case "name":
          va = a.companyName.toLowerCase();
          vb = b.companyName.toLowerCase();
          break;
        case "health":
          va = HEALTH_ORDER[a.health] ?? 99;
          vb = HEALTH_ORDER[b.health] ?? 99;
          break;
        case "dealsThisMonth":
          va = a.dealsThisMonth;
          vb = b.dealsThisMonth;
          break;
        case "projectedThisMonth":
          va = a.projectedThisMonth;
          vb = b.projectedThisMonth;
          break;
        case "avgTrailing3mo":
          va = a.avgTrailing3mo;
          vb = b.avgTrailing3mo;
          break;
        case "momChangePct":
          va = a.momChangePct ?? -Infinity;
          vb = b.momChangePct ?? -Infinity;
          break;
        case "totalDeals":
          va = a.totalDeals;
          vb = b.totalDeals;
          break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [clients, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th
              className="cursor-pointer px-4 py-3 hover:text-slate-700"
              onClick={() => toggleSort("name")}
            >
              Client{sortIndicator("name")}
            </th>
            <th
              className="cursor-pointer px-4 py-3 hover:text-slate-700"
              onClick={() => toggleSort("health")}
            >
              Status{sortIndicator("health")}
            </th>
            <th
              className="cursor-pointer px-4 py-3 text-right hover:text-slate-700"
              onClick={() => toggleSort("dealsThisMonth")}
            >
              This month{sortIndicator("dealsThisMonth")}
            </th>
            <th
              className="cursor-pointer px-4 py-3 text-right hover:text-slate-700"
              onClick={() => toggleSort("projectedThisMonth")}
              title="End-of-month extrapolation = deals this month × (days in month / current day)"
            >
              Projected{sortIndicator("projectedThisMonth")}
            </th>
            <th
              className="cursor-pointer px-4 py-3 text-right hover:text-slate-700"
              onClick={() => toggleSort("avgTrailing3mo")}
            >
              3-mo avg{sortIndicator("avgTrailing3mo")}
            </th>
            <th
              className="cursor-pointer px-4 py-3 text-right hover:text-slate-700"
              onClick={() => toggleSort("momChangePct")}
            >
              MoM{sortIndicator("momChangePct")}
            </th>
            <th
              className="cursor-pointer px-4 py-3 text-right hover:text-slate-700"
              onClick={() => toggleSort("totalDeals")}
            >
              Total 13m{sortIndicator("totalDeals")}
            </th>
            <th className="px-4 py-3">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((c) => (
            <tr
              key={c.companyRecordId}
              className="transition hover:bg-slate-50"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/clients/${c.companyRecordId}`}
                  className="font-medium text-slate-900 hover:text-emerald-700 hover:underline"
                >
                  {c.companyName}
                </Link>
                {c.error && (
                  <div className="text-xs text-red-600" title={c.error}>
                    ⚠ {c.error.length > 60 ? `${c.error.slice(0, 60)}…` : c.error}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <HealthBadge status={c.health} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {c.dealsThisMonth}
                <div className="text-[10px] font-normal text-slate-400">
                  d{c.dayOfMonth}/{c.daysInMonth}
                </div>
              </td>
              <td
                className={`px-4 py-3 text-right tabular-nums ${projectedTone(
                  c.projectedThisMonth,
                  c.avgTrailing3mo
                )}`}
              >
                {c.avgTrailing3mo > 0 || c.projectedThisMonth > 0
                  ? c.projectedThisMonth.toFixed(1)
                  : "—"}
                {c.avgTrailing3mo > 0 && (
                  <div className="text-[10px] font-normal text-slate-400">
                    {((c.projectedThisMonth / c.avgTrailing3mo) * 100).toFixed(0)}%
                    vs avg
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                {c.avgTrailing3mo.toFixed(1)}
              </td>
              <td
                className={`px-4 py-3 text-right tabular-nums ${
                  c.momChangePct === null
                    ? "text-slate-400"
                    : c.momChangePct >= 0
                    ? "text-emerald-700"
                    : "text-red-600"
                }`}
              >
                {formatMoMPct(c.momChangePct)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                {c.totalDeals}
              </td>
              <td className="px-4 py-3">
                <TrendChart buckets={c.monthlyBuckets.slice(-6)} />
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                No company found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
