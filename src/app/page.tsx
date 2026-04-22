import {
  getAirtableData,
  getClientStats,
  thirteenMonthsAgoISO,
} from "@/lib/cache";
import { ClientTable } from "@/components/ClientTable";
import { RefreshButton } from "@/components/RefreshButton";
import type { ClientStats } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  let clients: ClientStats[] = [];
  let skippedNoKey = 0;
  let errorMsg: string | null = null;

  try {
    const { companies } = await getAirtableData();
    const withKey = companies.filter((c) => c.apiKey);
    skippedNoKey = companies.length - withKey.length;
    const since = thirteenMonthsAgoISO();
    // Sequential, not Promise.all. The duodeal.ts semaphore would queue
    // these anyway, but iterating gives us cleaner cold-start traces and
    // avoids any chance of stacked promises racing against the in-memory cache.
    for (const c of withKey) {
      clients.push(await getClientStats(c, since));
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
    clients = [];
  }

  const total = clients.reduce((s, c) => s + c.totalDeals, 0);
  const totalThisMonth = clients.reduce((s, c) => s + c.dealsThisMonth, 0);
  const totalProjected = clients.reduce((s, c) => s + c.projectedThisMonth, 0);
  const critical = clients.filter((c) => c.health === "critical").length;
  const warning = clients.filter((c) => c.health === "warning").length;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Duodeal Usage Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Per-client usage monitoring — alert if this month &lt; 50% of the
            trailing 3-month average.
          </p>
        </div>
        <RefreshButton />
      </header>

      {errorMsg && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Error:</strong> {errorMsg}
          <div className="mt-2 text-xs text-red-700">
            Check <code>AIRTABLE_TOKEN</code> and{" "}
            <code>AIRTABLE_MANAGEMENT_BASE_ID</code> in{" "}
            <code>.env.local</code>.
          </div>
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Clients"
          value={clients.length}
          sublabel={
            skippedNoKey > 0
              ? `${skippedNoKey} hidden (no API key)`
              : undefined
          }
        />
        <SummaryCard
          label="Deals this month"
          value={totalThisMonth}
          sublabel={`Projected: ${totalProjected.toFixed(0)}`}
        />
        <SummaryCard label="Total 13 months" value={total} />
        <SummaryCard
          label="Alerts"
          value={critical + warning}
          tone={critical > 0 ? "danger" : warning > 0 ? "warning" : "neutral"}
          sublabel={
            critical + warning > 0
              ? `${critical} critical, ${warning} warning`
              : "None"
          }
        />
      </section>

      <ClientTable clients={clients} />

      <footer className="mt-8 text-xs text-slate-500">
        Data is cached server-side for 1h. Click Refresh to force a refresh.
      </footer>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  sublabel,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  tone?: "neutral" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
      ? "text-amber-700"
      : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {sublabel && (
        <div className="mt-0.5 text-xs text-slate-500">{sublabel}</div>
      )}
    </div>
  );
}
