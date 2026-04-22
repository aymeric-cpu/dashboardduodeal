import { NextResponse } from "next/server";
import {
  getAirtableData,
  rebuildSnapshot,
  thirteenMonthsAgoISO,
} from "@/lib/cache";
import { checkAndAlert } from "@/lib/alerts";

/**
 * Daily cron: iterates all companies, recomputes health, and posts Slack
 * alerts for critical clients (dedupe per calendar month via Airtable field).
 *
 * Protected by CRON_SECRET header.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Force fresh Airtable + stats — the cron is the source of truth
    const { companies } = await getAirtableData(true);
    const since = thirteenMonthsAgoISO();

    const results: Array<{
      company: string;
      health: string;
      sent: boolean;
      reason: string;
    }> = [];

    // Process clients sequentially with a small spacer to stay under Airtable's
    // 5 req/s per-base limit (each rebuild writes 1 snapshot PATCH).
    for (const company of companies) {
      if (!company.apiKey) {
        results.push({
          company: company.name,
          health: "skipped",
          sent: false,
          reason: "no API key",
        });
        continue;
      }
      try {
        const stats = await rebuildSnapshot(company, since);
        const outcome = await checkAndAlert(company, stats);
        results.push({
          company: company.name,
          health: stats.health,
          sent: outcome.sent,
          reason: outcome.reason,
        });
      } catch (e) {
        results.push({
          company: company.name,
          health: "error",
          sent: false,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
      // Gentle spacer between clients to stay under Airtable rate limits
      await new Promise((r) => setTimeout(r, 250));
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("[cron/check-usage] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
