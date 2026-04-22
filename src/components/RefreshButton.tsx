"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RefreshButton({ companyId }: { companyId?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      if (companyId) {
        // ?full=1 forces a full Duodeal fetch (~8 paginated calls, serialized
        // by the duodeal.ts semaphore) and writes the snapshot to Airtable.
        // Without it, the route only invalidates the in-memory cache, which
        // is useless when no snapshot exists yet.
        const res = await fetch(
          `/api/clients/${encodeURIComponent(companyId)}/refresh?full=1`,
          { method: "POST" }
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        }
      }
      // Force the server component to re-render with fresh data.
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || isPending;
  const label = companyId ? "↻ Full refresh" : "↻ Refresh";
  const busyLabel = companyId ? "Rebuilding…" : "Refreshing…";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={refresh}
        disabled={disabled}
        className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        {disabled ? busyLabel : label}
      </button>
      {error && (
        <span className="text-xs text-red-700 max-w-xs text-right">{error}</span>
      )}
    </div>
  );
}
