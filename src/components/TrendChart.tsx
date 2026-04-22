"use client";

import type { MonthlyBucket } from "@/lib/types";

/**
 * Compact sparkline drawn as inline SVG (no chart lib dependency for this one).
 * Shows the last N deal counts across months.
 */
export function TrendChart({
  buckets,
  width = 120,
  height = 32,
}: {
  buckets: MonthlyBucket[];
  width?: number;
  height?: number;
}) {
  const values = buckets.map((b) => b.dealCount);
  const max = Math.max(1, ...values);
  const min = 0;
  const range = max - min || 1;
  const n = values.length;

  if (n === 0) return null;

  const stepX = n === 1 ? 0 : width / (n - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const last = values[n - 1];
  const prev = n >= 2 ? values[n - 2] : last;
  const trendUp = last >= prev;

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible"
      role="img"
      aria-label="Trend"
    >
      <polyline
        fill="none"
        stroke={trendUp ? "#16a34a" : "#dc2626"}
        strokeWidth={1.5}
        points={points}
      />
      {/* Current month marker */}
      <circle
        cx={(n - 1) * stepX}
        cy={height - ((last - min) / range) * height}
        r={2.5}
        fill={trendUp ? "#16a34a" : "#dc2626"}
      />
    </svg>
  );
}
