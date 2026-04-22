import type {
  ClientStats,
  AirtableCompany,
  AirtableUser,
  DuodealDeal,
} from "./types";
import { fetchAllDeals } from "./duodeal";
import { readCompanies, readUsers, writeSnapshot } from "./airtable";
import {
  buildClientStats,
  buildClientStatsFromBuckets,
  emptyStats,
  firstOfCurrentMonthISO,
} from "./aggregates";
import {
  buildSnapshotFromDeals,
  mergeSnapshotWithCurrentMonth,
  parseSnapshot,
  snapshotAgeDays,
  totalDealsInBuckets,
} from "./snapshot";

// ── TTLs ──

const STATS_TTL_MS = 60 * 60 * 1000; // 1h — per-client deal stats (in-memory)
// Short TTL because Next.js dev mode runs the API routes and the page
// server components in separate module instances — without a short TTL,
// after a refresh writes a new snapshot via the API instance, the page
// instance keeps serving the pre-snapshot company list for the full TTL.
// Airtable is fast (~150ms) and 5 req/s, so 30s is a safe trade-off.
const AIRTABLE_TTL_MS = 30 * 1000;
const SNAPSHOT_STALE_DAYS = 3; // rebuild Airtable snapshot if older than this

// ── Airtable cache ──

interface AirtableCacheEntry {
  companies: AirtableCompany[];
  users: AirtableUser[];
  fetchedAt: number;
}

let airtableCache: AirtableCacheEntry | null = null;

export async function getAirtableData(
  forceRefresh = false
): Promise<AirtableCacheEntry> {
  const now = Date.now();
  if (
    !forceRefresh &&
    airtableCache &&
    now - airtableCache.fetchedAt < AIRTABLE_TTL_MS
  ) {
    return airtableCache;
  }

  const [companies, users] = await Promise.all([readCompanies(), readUsers()]);
  airtableCache = { companies, users, fetchedAt: now };
  return airtableCache;
}

// ── Per-client stats cache ──

interface StatsCacheEntry {
  stats: ClientStats;
  /** Deals from the current calendar month (live). Used by the detail page. */
  currentMonthDeals: DuodealDeal[];
  fetchedAt: number;
}

const statsCache = new Map<string, StatsCacheEntry>();

/**
 * Compute client stats and cache them, using the Airtable snapshot when available.
 *
 * Fast path (snapshot present + fresh):
 *   1. Parse historical buckets from company.monthlyCountsSnapshot
 *   2. Fetch ONLY the current month's deals from Duodeal (~1 page)
 *   3. Merge → compute stats
 *
 * Full path (no snapshot or stale):
 *   1. Fetch the full 13-month deal list (~8 pages for an active client)
 *   2. Build a historical snapshot (past 12 months) and persist to Airtable
 *   3. Compute stats from the full bucket set
 */
async function fetchAndCache(
  company: AirtableCompany,
  sinceISO: string,
  forceFullRebuild: boolean,
  now: Date = new Date()
): Promise<StatsCacheEntry> {
  const nowMs = now.getTime();

  if (!company.apiKey) {
    const stats = emptyStats(
      company.recordId,
      company.name,
      null,
      "Duodeal API key missing in Airtable",
      now
    );
    const entry: StatsCacheEntry = {
      stats,
      currentMonthDeals: [],
      fetchedAt: nowMs,
    };
    statsCache.set(company.recordId, entry);
    return entry;
  }

  const parsed = parseSnapshot(company.monthlyCountsSnapshot);

  // Safety: never auto-trigger a full rebuild from a regular page load.
  // A full rebuild fans out to ~8 pages × Duodeal per client and previously
  // brought their production down. The full path is reserved for:
  //   - the daily cron (already serialized + spaced)
  //   - the explicit "Full refresh" button (?full=1)
  // If the snapshot is missing and the caller didn't ask for a rebuild,
  // surface a clear "needs seed" status instead of fetching.
  if (!forceFullRebuild && !parsed) {
    const stats = emptyStats(
      company.recordId,
      company.name,
      company.apiKey,
      "Airtable snapshot missing — click \u201CFull refresh\u201D to seed it",
      now
    );
    // Do NOT write to statsCache here: this is an error state, not real
    // data. If we cached it, a successful snapshot write elsewhere wouldn't
    // be picked up until the 1h TTL expired. By skipping the cache, the
    // next call re-reads the (already cached) airtableCache and notices the
    // snapshot as soon as it lands.
    return { stats, currentMonthDeals: [], fetchedAt: nowMs };
  }

  try {
    if (!forceFullRebuild && parsed) {
      // ── Fast path ─────────────────────────────────────────────────────
      // We use the snapshot even when it's slightly stale — the historical
      // months don't change. Freshness is restored by the daily cron.
      const ageDays = snapshotAgeDays(parsed, now);
      if (ageDays > SNAPSHOT_STALE_DAYS) {
        console.warn(
          `[cache] snapshot for ${company.name} is ${ageDays}d old (>${SNAPSHOT_STALE_DAYS}d). Using anyway; cron will refresh.`
        );
      }
      const currentMonthSince = firstOfCurrentMonthISO(now);
      const currentMonthDeals = await fetchAllDeals(
        company.apiKey,
        currentMonthSince
      );
      const buckets = mergeSnapshotWithCurrentMonth(
        parsed.buckets,
        currentMonthDeals,
        now
      );

      // Recompute lastDealAt by comparing snapshot's last-seen and this month's newest
      let lastDealAt: string | null = parsed.lastDealAt;
      for (const d of currentMonthDeals) {
        if (!d.createdAt) continue;
        if (!lastDealAt || d.createdAt > lastDealAt) lastDealAt = d.createdAt;
      }
      const totalDeals =
        totalDealsInBuckets(parsed.buckets) + currentMonthDeals.length;

      const stats = buildClientStatsFromBuckets(
        company.recordId,
        company.name,
        company.apiKey,
        buckets,
        totalDeals,
        lastDealAt,
        now
      );
      const entry: StatsCacheEntry = {
        stats,
        currentMonthDeals,
        fetchedAt: nowMs,
      };
      statsCache.set(company.recordId, entry);
      return entry;
    }

    // ── Full rebuild path ─────────────────────────────────────────────
    const allDeals = await fetchAllDeals(company.apiKey, sinceISO);
    const stats = buildClientStats(
      company.recordId,
      company.name,
      company.apiKey,
      allDeals,
      now
    );

    // Persist the historical portion so subsequent calls use the fast path.
    // For an explicit full rebuild (cron + "Full refresh" button), we
    // surface the write error so the user knows seeding actually failed —
    // otherwise a 403 silently leaves Airtable empty and the dashboard keeps
    // showing "Snapshot missing" after every click.
    try {
      const snapshot = buildSnapshotFromDeals(allDeals, now);
      const snapshotJson = JSON.stringify(snapshot);
      await writeSnapshot(company.recordId, snapshotJson);
      // Keep the in-memory airtableCache in sync so the next page render
      // (which reads the cached company list, TTL 5min) sees the fresh
      // snapshot and takes the fast path. Without this, even after a
      // successful write, the next read returns the stale company object
      // with monthlyCountsSnapshot=null and the dashboard still shows
      // "Snapshot missing".
      if (airtableCache) {
        const idx = airtableCache.companies.findIndex(
          (c) => c.recordId === company.recordId
        );
        if (idx >= 0) {
          airtableCache.companies[idx] = {
            ...airtableCache.companies[idx],
            monthlyCountsSnapshot: snapshotJson,
          };
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[cache] writeSnapshot failed for ${company.name}:`, msg);
      if (forceFullRebuild) {
        throw new Error(
          `Airtable snapshot not written: ${msg}. Check that the PAT has the data.records:write scope.`
        );
      }
    }

    const currentMonthStart = new Date(firstOfCurrentMonthISO(now)).getTime();
    const currentMonthDeals = allDeals.filter((d) => {
      const t = new Date(d.createdAt).getTime();
      return Number.isFinite(t) && t >= currentMonthStart;
    });

    const entry: StatsCacheEntry = {
      stats,
      currentMonthDeals,
      fetchedAt: nowMs,
    };
    statsCache.set(company.recordId, entry);
    return entry;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stats = emptyStats(
      company.recordId,
      company.name,
      company.apiKey,
      msg,
      now
    );
    const entry: StatsCacheEntry = {
      stats,
      currentMonthDeals: [],
      fetchedAt: nowMs,
    };
    statsCache.set(company.recordId, entry);
    return entry;
  }
}

/**
 * Get cached stats for a client. Returns in-memory cached value if fresh,
 * otherwise triggers fetchAndCache.
 */
export async function getClientStats(
  company: AirtableCompany,
  sinceISO: string,
  forceRefresh = false
): Promise<ClientStats> {
  const nowMs = Date.now();
  const cached = statsCache.get(company.recordId);
  if (!forceRefresh && cached && nowMs - cached.fetchedAt < STATS_TTL_MS) {
    return cached.stats;
  }
  const entry = await fetchAndCache(company, sinceISO, forceRefresh);
  return entry.stats;
}

/**
 * Get the top-N recent deals from the client's current-month fetch. Shares
 * the same cache entry as getClientStats — will not trigger an extra Duodeal
 * call if the entry is fresh.
 */
export async function getClientRecentDeals(
  company: AirtableCompany,
  sinceISO: string,
  limit = 10,
  forceRefresh = false
): Promise<DuodealDeal[]> {
  const nowMs = Date.now();
  let entry = statsCache.get(company.recordId);
  if (!forceRefresh && entry && nowMs - entry.fetchedAt < STATS_TTL_MS) {
    // already fresh
  } else {
    entry = await fetchAndCache(company, sinceISO, forceRefresh);
  }
  return [...entry.currentMonthDeals]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, limit);
}

/**
 * Force a full rebuild: re-fetches all 13 months and rewrites the Airtable
 * snapshot. Use for the "Full refresh" action or the daily cron.
 */
export async function rebuildSnapshot(
  company: AirtableCompany,
  sinceISO: string
): Promise<ClientStats> {
  const entry = await fetchAndCache(company, sinceISO, true);
  return entry.stats;
}

export function invalidateClient(recordId: string): void {
  statsCache.delete(recordId);
}

export function invalidateAll(): void {
  statsCache.clear();
  airtableCache = null;
}

/**
 * ISO date for the 1st of the month, 13 months ago UTC.
 * Used as the `sinceISO` cutoff for fetchAllDeals.
 */
export function thirteenMonthsAgoISO(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1, 0, 0, 0, 0)
  );
  return d.toISOString();
}
