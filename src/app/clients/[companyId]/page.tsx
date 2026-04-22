import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAirtableData,
  getClientStats,
  getClientRecentDeals,
  thirteenMonthsAgoISO,
} from "@/lib/cache";
import { HealthBadge } from "@/components/HealthBadge";
import { MonthlyBarChart } from "@/components/MonthlyBarChart";
import { LoginAsButton } from "@/components/LoginAsButton";
import { RefreshButton } from "@/components/RefreshButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { companies, users } = await getAirtableData();
  const company = companies.find((c) => c.recordId === companyId);
  if (!company) notFound();

  const since = thirteenMonthsAgoISO();
  const stats = await getClientStats(company, since);
  const companyUsers = users
    .filter((u) => u.companyRecordIds.includes(companyId))
    .sort((a, b) => Number(b.active) - Number(a.active));

  // Reuses the current-month deals cached alongside stats — no extra Duodeal call.
  const recentDeals =
    !stats.error && company.apiKey
      ? await getClientRecentDeals(company, since, 10)
      : [];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <nav className="mb-4 text-sm">
        <Link
          href="/"
          className="text-slate-500 hover:text-emerald-700 hover:underline"
        >
          ← All clients
        </Link>
      </nav>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              {company.name}
            </h1>
            <HealthBadge status={stats.health} />
          </div>
          <p className="mt-1 text-sm text-slate-600">{stats.healthReason}</p>
          {company.customerSuccess && (
            <p className="mt-1 text-xs text-slate-500">
              CSM: {company.customerSuccess}
            </p>
          )}
        </div>
        <RefreshButton companyId={company.recordId} />
      </header>

      {stats.error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Error:</strong> {stats.error}
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat
          label="This month"
          value={stats.dealsThisMonth}
          sublabel={`day ${stats.dayOfMonth}/${stats.daysInMonth}`}
        />
        <Stat
          label="Projected EOM"
          value={stats.projectedThisMonth.toFixed(1)}
          sublabel={
            stats.avgTrailing3mo > 0
              ? `${((stats.projectedThisMonth / stats.avgTrailing3mo) * 100).toFixed(0)}% of 3-mo avg`
              : undefined
          }
        />
        <Stat label="Last month" value={stats.dealsLastMonth} />
        <Stat
          label="3-month avg"
          value={stats.avgTrailing3mo.toFixed(1)}
        />
        <Stat
          label="Total 13 months"
          value={stats.totalDeals}
          sublabel={
            stats.lastDealAt
              ? `Last deal: ${new Date(stats.lastDealAt).toLocaleDateString("en-US")}`
              : undefined
          }
        />
      </section>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Deals per month (last 13 months)
        </h2>
        <MonthlyBarChart buckets={stats.monthlyBuckets} />
      </section>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Users ({companyUsers.length})
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {companyUsers.length === 0 && (
            <div className="px-5 py-4 text-sm text-slate-500">
              No user linked to this company in Airtable.
            </div>
          )}
          {companyUsers.map((u) => (
            <div
              key={u.recordId}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {u.firstName} {u.lastName}
                  </span>
                  {!u.active && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      inactive
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{u.email}</div>
              </div>
              <LoginAsButton
                userId={u.recordId}
                disabled={!u.loginAsUrl}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent deals (current month)
          </h2>
        </div>
        {recentDeals.length === 0 ? (
          <div className="px-5 py-4 text-sm text-slate-500">
            No deals this month.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2">Date</th>
                <th className="px-5 py-2">Name</th>
                <th className="px-5 py-2">Customer</th>
                <th className="px-5 py-2 text-right">Amount excl. VAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentDeals.map((d) => {
                const q = d.quotations?.find(
                  (x) => x.id === d.primaryQuotationId
                ) ?? d.quotations?.[0];
                return (
                  <tr key={d.id}>
                    <td className="px-5 py-2 text-slate-600">
                      {new Date(d.createdAt).toLocaleDateString("en-US")}
                    </td>
                    <td className="px-5 py-2 font-medium text-slate-900">
                      {d.name}
                    </td>
                    <td className="px-5 py-2 text-slate-600">
                      {d.customer?.fullName || "—"}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-slate-700">
                      {q?.amountHt
                        ? q.amountHt.toLocaleString("en-US", {
                            maximumFractionDigits: 0,
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sublabel && (
        <div className="mt-0.5 text-xs text-slate-500">{sublabel}</div>
      )}
    </div>
  );
}
