import type { DuodealDeal, MonthlyBucket } from "./types";
import { bucketByMonth, yearMonthKey } from "./aggregates";

/**
 * Persistent snapshot stored in the Airtable "Monthly Counts Snapshot" field
 * on each Companies row. Contains only COMPLETE past months (never the
 * current month, which is always fetched live).
 */
export interface SnapshotPayload {
  /** When this snapshot was computed (ISO datetime). Used to decide staleness. */
  takenAt: string;
  /** Count of complete past months stored. Usually 12. */
  monthsCovered: number;
  /** Historical buckets ordered oldest → newest. Excludes the current month. */
  buckets: MonthlyBucket[];
  /** Last deal createdAt observed at snapshot time (for lastDealAt continuity). */
  lastDealAt: string | null;
  /** Total deals counted at snapshot time (past months only). */
  totalDeals: number;
}

/**
 * Parse the raw JSON string stored in Airtable. Returns null on any parse error
 * or shape mismatch — callers should fall back to a full rebuild.
 */
export function parseSnapshot(raw: string | null): SnapshotPayload | null {
  if (!raw || raw.trim() === "") return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Partial<SnapshotPayload>;
    if (typeof o.takenAt !== "string") return null;
    if (!Array.isArray(o.buckets)) return null;
    // Light validation of bucket shape
    for (const b of o.buckets) {
      if (
        !b ||
        typeof b !== "object" ||
        typeof (b as MonthlyBucket).yearMonth !== "string" ||
        typeof (b as MonthlyBucket).dealCount !== "number"
      ) {
        return null;
      }
    }
    return {
      takenAt: o.takenAt,
      monthsCovered: typeof o.monthsCovered === "number" ? o.monthsCovered : o.buckets.length,
      buckets: o.buckets as MonthlyBucket[],
      lastDealAt: typeof o.lastDealAt === "string" ? o.lastDealAt : null,
      totalDeals: typeof o.totalDeals === "number" ? o.totalDeals : 0,
    };
  } catch {
    return null;
  }
}

/** Age of a snapshot in days (fractional). Infinity if takenAt is invalid. */
export function snapshotAgeDays(snapshot: SnapshotPayload, now: Date = new Date()): number {
  const t = new Date(snapshot.takenAt).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / (24 * 60 * 60 * 1000);
}

/**
 * Build a fresh snapshot payload from the full 13-month deal list.
 * The current month is excluded — only complete past months are persisted.
 */
export function buildSnapshotFromDeals(
  deals: DuodealDeal[],
  now: Date = new Date()
): SnapshotPayload {
  // bucketByMonth returns 13 buckets, oldest → newest, with the last one being
  // the current (partial) month. Drop that last bucket for the snapshot.
  const allBuckets = bucketByMonth(deals, 13, now);
  const historical = allBuckets.slice(0, -1); // 12 complete months

  const currentYm = yearMonthKey(now);
  let lastDealAt: string | null = null;
  let historicalCount = 0;
  for (const d of deals) {
    if (!d.createdAt) continue;
    const t = new Date(d.createdAt);
    if (Number.isNaN(t.getTime())) continue;
    if (yearMonthKey(t) !== currentYm) historicalCount += 1;
    if (!lastDealAt || d.createdAt > lastDealAt) lastDealAt = d.createdAt;
  }

  return {
    takenAt: now.toISOString(),
    monthsCovered: historical.length,
    buckets: historical,
    lastDealAt,
    totalDeals: historicalCount,
  };
}

/**
 * Merge a historical snapshot (past months) with live current-month deals to
 * produce the full 13-bucket window expected by `computeHealth`.
 *
 * If the snapshot's last bucket isn't the month immediately before `now`
 * (e.g. snapshot is 2+ months old), we pad with zero-buckets to keep the
 * window aligned. Staleness beyond a few days should trigger a full rebuild
 * upstream, not be silently tolerated here — this is just a safety net.
 */
export function mergeSnapshotWithCurrentMonth(
  historical: MonthlyBucket[],
  currentMonthDeals: DuodealDeal[],
  now: Date = new Date()
): MonthlyBucket[] {
  // 1 bucket for the current month, computed from live deals
  const [currentBucket] = bucketByMonth(currentMonthDeals, 1, now);

  // Build a map from historical buckets and fill any gap up to (not including)
  // the current month.
  const map = new Map<string, MonthlyBucket>();
  for (const b of historical) map.set(b.yearMonth, b);

  const result: MonthlyBucket[] = [];
  // Walk backwards 12 months from the month before current, then reverse.
  const currentYm = yearMonthKey(now);
  for (let i = 12; i >= 1; i--) {
    const ym = shiftYearMonth(currentYm, -i);
    const existing = map.get(ym);
    result.push(
      existing || {
        yearMonth: ym,
        label: monthLabelFromYm(ym),
        dealCount: 0,
        amountHtSum: 0,
      }
    );
  }
  result.push(currentBucket);
  return result;
}

function shiftYearMonth(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return yearMonthKey(d);
}

function monthLabelFromYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${String(y).slice(2)}`;
}

/** Sum dealCount across buckets — used for the "past months total" in snapshot. */
export function totalDealsInBuckets(buckets: MonthlyBucket[]): number {
  return buckets.reduce((s, b) => s + b.dealCount, 0);
}
