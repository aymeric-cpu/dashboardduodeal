import type {
  DuodealDeal,
  HealthStatus,
  MonthlyBucket,
  ClientStats,
} from "./types";

// ── Date helpers ──

function yearMonth(date: Date): string {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  const month = d.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${month} ${String(y).slice(2)}`;
}

function previousYearMonth(ym: string, monthsAgo: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - monthsAgo, 1));
  return yearMonth(d);
}

/** Total days in the UTC calendar month of the given date. */
function daysInMonthUTC(date: Date): number {
  // Day 0 of next month = last day of this month
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
}

/** ISO datetime for the first day of the current UTC calendar month (00:00:00). */
export function firstOfCurrentMonthISO(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  ).toISOString();
}

/** "YYYY-MM" for the given date in UTC. Exported for snapshot merge logic. */
export function yearMonthKey(date: Date): string {
  return yearMonth(date);
}

function dealAmountHt(deal: DuodealDeal): number {
  if (!deal.quotations || deal.quotations.length === 0) return 0;
  // Primary quotation if available, else first
  const primary = deal.quotations.find((q) => q.id === deal.primaryQuotationId);
  const q = primary || deal.quotations[0];
  return typeof q.amountHt === "number" ? q.amountHt : 0;
}

// ── Core aggregation ──

/**
 * Returns the last N complete-or-current monthly buckets, oldest → newest.
 * The final bucket is always the current calendar month (UTC).
 */
export function bucketByMonth(
  deals: DuodealDeal[],
  months: number,
  now: Date = new Date()
): MonthlyBucket[] {
  const currentYm = yearMonth(now);
  const buckets = new Map<string, MonthlyBucket>();

  // Seed with empty buckets so zero-deal months still appear
  for (let i = months - 1; i >= 0; i--) {
    const ym = previousYearMonth(currentYm, i);
    buckets.set(ym, {
      yearMonth: ym,
      label: monthLabel(ym),
      dealCount: 0,
      amountHtSum: 0,
    });
  }

  for (const deal of deals) {
    if (!deal.createdAt) continue;
    const t = new Date(deal.createdAt);
    if (Number.isNaN(t.getTime())) continue;
    const ym = yearMonth(t);
    const bucket = buckets.get(ym);
    if (!bucket) continue; // outside window
    bucket.dealCount += 1;
    bucket.amountHtSum += dealAmountHt(deal);
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.yearMonth.localeCompare(b.yearMonth)
  );
}

/**
 * Compute health based on the rule:
 *   projectedThisMonth < 0.5 × avg(trailing 3 complete months)
 *
 * where projectedThisMonth = dealsThisMonth × (daysInMonth / dayOfMonth).
 *
 * - Before day 5 of the current month → projection too noisy, neutralized
 *   (warning if 0 deals on a usually-active client).
 * - If the 3-month avg is 0 and no recent activity → "unknown".
 */
export function computeHealth(
  buckets: MonthlyBucket[],
  now: Date = new Date()
): {
  status: HealthStatus;
  reason: string;
  dealsThisMonth: number;
  dealsLastMonth: number;
  projectedThisMonth: number;
  dayOfMonth: number;
  daysInMonth: number;
  avgTrailing3mo: number;
  momChangePct: number | null;
} {
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = daysInMonthUTC(now);

  if (buckets.length < 2) {
    return {
      status: "unknown",
      reason: "Not enough history",
      dealsThisMonth: 0,
      dealsLastMonth: 0,
      projectedThisMonth: 0,
      dayOfMonth,
      daysInMonth,
      avgTrailing3mo: 0,
      momChangePct: null,
    };
  }

  const thisBucket = buckets[buckets.length - 1];
  const lastBucket = buckets[buckets.length - 2];
  const trailing3 = buckets.slice(-4, -1); // 3 complete months before current
  const avg =
    trailing3.length > 0
      ? trailing3.reduce((s, b) => s + b.dealCount, 0) / trailing3.length
      : 0;

  const dealsThisMonth = thisBucket.dealCount;
  const dealsLastMonth = lastBucket.dealCount;
  const projectedThisMonth =
    dayOfMonth > 0 ? (dealsThisMonth * daysInMonth) / dayOfMonth : 0;
  const momChangePct =
    dealsLastMonth > 0
      ? ((dealsThisMonth - dealsLastMonth) / dealsLastMonth) * 100
      : null;

  const hadPriorActivity = avg > 0 || dealsLastMonth > 0;

  if (!hadPriorActivity) {
    return {
      status: "unknown",
      reason: "No recent baseline activity",
      dealsThisMonth,
      dealsLastMonth,
      projectedThisMonth,
      dayOfMonth,
      daysInMonth,
      avgTrailing3mo: avg,
      momChangePct,
    };
  }

  // Guard: before day 5 the projection is too noisy — only flag clients that
  // are usually very active and currently at zero.
  if (dayOfMonth < 5) {
    if (dealsThisMonth === 0 && avg >= 5) {
      return {
        status: "warning",
        reason: `No deals yet this early in the month while the avg is ${avg.toFixed(1)}/mo`,
        dealsThisMonth,
        dealsLastMonth,
        projectedThisMonth,
        dayOfMonth,
        daysInMonth,
        avgTrailing3mo: avg,
        momChangePct,
      };
    }
    return {
      status: "healthy",
      reason: `Early in the month (day ${dayOfMonth}/${daysInMonth}) — projection reliable after day 5`,
      dealsThisMonth,
      dealsLastMonth,
      projectedThisMonth,
      dayOfMonth,
      daysInMonth,
      avgTrailing3mo: avg,
      momChangePct,
    };
  }

  const threshold50 = avg * 0.5;
  const threshold75 = avg * 0.75;

  if (projectedThisMonth < threshold50) {
    return {
      status: "critical",
      reason: `Projection ${projectedThisMonth.toFixed(1)} vs avg ${avg.toFixed(1)} (${dealsThisMonth} deal(s) at d${dayOfMonth}/${daysInMonth}, 50% threshold: ${threshold50.toFixed(1)})`,
      dealsThisMonth,
      dealsLastMonth,
      projectedThisMonth,
      dayOfMonth,
      daysInMonth,
      avgTrailing3mo: avg,
      momChangePct,
    };
  }

  if (projectedThisMonth < threshold75) {
    return {
      status: "warning",
      reason: `Projection ${projectedThisMonth.toFixed(1)} vs avg ${avg.toFixed(1)} (${dealsThisMonth} deal(s) at d${dayOfMonth}/${daysInMonth}, below 75%)`,
      dealsThisMonth,
      dealsLastMonth,
      projectedThisMonth,
      dayOfMonth,
      daysInMonth,
      avgTrailing3mo: avg,
      momChangePct,
    };
  }

  return {
    status: "healthy",
    reason: `Projection ${projectedThisMonth.toFixed(1)} vs avg ${avg.toFixed(1)} (${dealsThisMonth} deal(s) at d${dayOfMonth}/${daysInMonth})`,
    dealsThisMonth,
    dealsLastMonth,
    projectedThisMonth,
    dayOfMonth,
    daysInMonth,
    avgTrailing3mo: avg,
    momChangePct,
  };
}

/**
 * Build the full client stats from the raw deal list.
 */
export function buildClientStats(
  companyRecordId: string,
  companyName: string,
  apiKey: string | null,
  deals: DuodealDeal[],
  now: Date = new Date()
): ClientStats {
  const buckets = bucketByMonth(deals, 13, now);
  const health = computeHealth(buckets, now);

  let lastDealAt: string | null = null;
  for (const d of deals) {
    if (!d.createdAt) continue;
    if (!lastDealAt || d.createdAt > lastDealAt) lastDealAt = d.createdAt;
  }

  return {
    companyRecordId,
    companyName,
    apiKey,
    totalDeals: deals.length,
    dealsThisMonth: health.dealsThisMonth,
    dealsLastMonth: health.dealsLastMonth,
    projectedThisMonth: health.projectedThisMonth,
    dayOfMonth: health.dayOfMonth,
    daysInMonth: health.daysInMonth,
    avgTrailing3mo: health.avgTrailing3mo,
    momChangePct: health.momChangePct,
    health: health.status,
    healthReason: health.reason,
    monthlyBuckets: buckets,
    lastDealAt,
    error: null,
  };
}

/**
 * Build client stats from pre-computed monthly buckets (snapshot fast path).
 * `totalDeals` and `lastDealAt` must be supplied by the caller since we don't
 * have the raw deal list here.
 */
export function buildClientStatsFromBuckets(
  companyRecordId: string,
  companyName: string,
  apiKey: string | null,
  buckets: MonthlyBucket[],
  totalDeals: number,
  lastDealAt: string | null,
  now: Date = new Date()
): ClientStats {
  const health = computeHealth(buckets, now);
  return {
    companyRecordId,
    companyName,
    apiKey,
    totalDeals,
    dealsThisMonth: health.dealsThisMonth,
    dealsLastMonth: health.dealsLastMonth,
    projectedThisMonth: health.projectedThisMonth,
    dayOfMonth: health.dayOfMonth,
    daysInMonth: health.daysInMonth,
    avgTrailing3mo: health.avgTrailing3mo,
    momChangePct: health.momChangePct,
    health: health.status,
    healthReason: health.reason,
    monthlyBuckets: buckets,
    lastDealAt,
    error: null,
  };
}

export function emptyStats(
  companyRecordId: string,
  companyName: string,
  apiKey: string | null,
  error: string,
  now: Date = new Date()
): ClientStats {
  return {
    companyRecordId,
    companyName,
    apiKey,
    totalDeals: 0,
    dealsThisMonth: 0,
    dealsLastMonth: 0,
    projectedThisMonth: 0,
    dayOfMonth: now.getUTCDate(),
    daysInMonth: daysInMonthUTC(now),
    avgTrailing3mo: 0,
    momChangePct: null,
    health: "unknown",
    healthReason: error,
    monthlyBuckets: bucketByMonth([], 13, now),
    lastDealAt: null,
    error,
  };
}
