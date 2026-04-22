import { NextResponse } from "next/server";
import {
  getAirtableData,
  getClientStats,
  thirteenMonthsAgoISO,
} from "@/lib/cache";
import type { ClientStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { companies } = await getAirtableData();
    const since = thirteenMonthsAgoISO();

    // Sequential iteration. The duodeal.ts semaphore enforces 1-at-a-time
    // calls anyway, but iterating ourselves keeps cold-start traces readable
    // and avoids stacking N promises for N companies.
    const clients: ClientStats[] = [];
    for (const c of companies) {
      clients.push(await getClientStats(c, since));
    }

    return NextResponse.json({
      clients,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/clients] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
