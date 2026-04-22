"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyBucket } from "@/lib/types";

export function MonthlyBarChart({ buckets }: { buckets: MonthlyBucket[] }) {
  const data = buckets.map((b) => ({
    month: b.label,
    deals: b.dealCount,
    amount: Math.round(b.amountHtSum),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              border: "1px solid #e2e8f0",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
            }}
            formatter={(value: unknown, name: string) => {
              if (name === "deals") return [value, "Deals"];
              if (name === "amount")
                return [
                  typeof value === "number"
                    ? value.toLocaleString("en-US")
                    : value,
                  "Amount excl. VAT",
                ];
              return [value, name];
            }}
          />
          <Bar dataKey="deals" fill="#2d5a3f" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
