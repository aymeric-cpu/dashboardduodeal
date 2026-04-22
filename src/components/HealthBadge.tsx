import type { HealthStatus } from "@/lib/types";

const STYLES: Record<HealthStatus, { bg: string; text: string; label: string }> = {
  healthy: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Healthy" },
  warning: { bg: "bg-amber-100", text: "text-amber-800", label: "Warning" },
  critical: { bg: "bg-red-100", text: "text-red-800", label: "Critical" },
  unknown: { bg: "bg-slate-100", text: "text-slate-600", label: "Unknown" },
};

export function HealthBadge({ status }: { status: HealthStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span
        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
          status === "healthy"
            ? "bg-emerald-500"
            : status === "warning"
            ? "bg-amber-500"
            : status === "critical"
            ? "bg-red-500"
            : "bg-slate-400"
        }`}
      />
      {s.label}
    </span>
  );
}
