import type { DuodealDeal, DuodealListResponse } from "./types";

const API_BASE = "https://api.duodeal.app/api";
const PAGE_SIZE = 50;
const MAX_PAGES = 200; // safety cap: 200 × 50 = 10k deals/client

// ── Throttle / retry guards ────────────────────────────────────────────────
// Duodeal's /deals endpoint is fragile: parallel bursts from this dashboard
// have previously taken down their production service. All calls go through
// a single global chain (concurrency = 1) with a minimum interval between
// successive requests, and retry with exponential backoff on 429 / 5xx.
const MIN_INTERVAL_MS = 500;
const RETRY_BACKOFFS_MS = [2000, 5000, 15000];

let duodealChain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

/**
 * Serialize a function through the global Duodeal call chain. Guarantees
 * at most one in-flight request at a time and at least MIN_INTERVAL_MS
 * between the start of two consecutive requests.
 */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const next = duodealChain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  duodealChain = next.catch(() => {});
  return next as Promise<T>;
}

async function rawDuodealFetch(
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json; charset=utf-8",
      ...options.headers,
    },
    cache: "no-store",
  });
}

async function duodealFetch(
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<unknown> {
  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    const res = await throttled(() => rawDuodealFetch(path, apiKey, options));
    if (res.ok) return res.json();

    const retriable = res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!retriable || attempt === RETRY_BACKOFFS_MS.length) {
      const body = await res.text();
      throw new Error(`Duodeal API ${res.status}: ${body}`);
    }
    const backoff = RETRY_BACKOFFS_MS[attempt];
    console.warn(
      `[duodeal] ${res.status} on ${path} — retry ${attempt + 1}/${RETRY_BACKOFFS_MS.length} in ${backoff}ms`
    );
    await new Promise((r) => setTimeout(r, backoff));
  }
  throw new Error("duodealFetch: retry loop exhausted");
}

/**
 * Build a /deals URL with server-side filtering on createdAt when supplied.
 * Using URLSearchParams ensures proper encoding of the bracket syntax
 * (`filters[createdAt][gte]` → `filters%5BcreatedAt%5D%5Bgte%5D`).
 */
function buildDealsUrl(page: number, sinceISO?: string): string {
  const params = new URLSearchParams({
    itemsPerPage: String(PAGE_SIZE),
    page: String(page),
  });
  if (sinceISO) params.append("filters[createdAt][gte]", sinceISO);
  return `/deals?${params.toString()}`;
}

/**
 * Fetch all deals created on/after `sinceISO` for the given API key.
 *
 * Strategy:
 * - Ask Duodeal to filter server-side via `filters[createdAt][gte]=<ISO>`.
 *   This drastically reduces the work Duodeal has to do per request vs
 *   scanning the full history and relying on a client-side short-circuit.
 * - Paginate with 50 items per page, advancing until `meta.pages` is reached
 *   (or until a partial page signals the end). Keep a client-side
 *   short-circuit on createdAt as a safety net if the filter ever breaks.
 */
export async function fetchAllDeals(
  apiKey: string,
  sinceISO?: string
): Promise<DuodealDeal[]> {
  const since = sinceISO ? new Date(sinceISO).getTime() : 0;
  const collected: DuodealDeal[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = (await duodealFetch(
      buildDealsUrl(page, sinceISO),
      apiKey
    )) as DuodealListResponse<DuodealDeal>;

    const batch = Array.isArray(res.data) ? res.data : [];
    if (batch.length === 0) break;

    for (const deal of batch) {
      if (!deal.createdAt) continue;
      const t = new Date(deal.createdAt).getTime();
      if (Number.isFinite(t) && t >= since) {
        collected.push(deal);
      }
    }

    // Safety net: even with the server-side filter, short-circuit if we
    // somehow receive a deal older than our cutoff.
    if (since > 0 && batch.length > 0) {
      const oldestOnPage = batch.reduce((min, d) => {
        const t = new Date(d.createdAt).getTime();
        return Number.isFinite(t) && t < min ? t : min;
      }, Number.POSITIVE_INFINITY);
      if (Number.isFinite(oldestOnPage) && oldestOnPage < since) break;
    }

    const totalPages = res.meta?.pages;
    if (typeof totalPages === "number" && page >= totalPages) break;
    if (batch.length < PAGE_SIZE) break;
  }

  return collected;
}

/**
 * Lightweight fetch for just the first page — used to verify credentials.
 */
export async function pingDuodeal(
  apiKey: string
): Promise<{ ok: true; totalDeals: number | null } | { ok: false; error: string }> {
  try {
    const res = (await duodealFetch(
      `/deals?itemsPerPage=1&page=1`,
      apiKey
    )) as DuodealListResponse<DuodealDeal>;
    return { ok: true, totalDeals: res.meta?.total ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
