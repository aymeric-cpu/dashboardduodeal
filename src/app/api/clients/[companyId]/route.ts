import { NextResponse } from "next/server";
import {
  getAirtableData,
  getClientStats,
  getClientRecentDeals,
  thirteenMonthsAgoISO,
} from "@/lib/cache";
import type { ClientDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  try {
    const { companies, users } = await getAirtableData();
    const company = companies.find((c) => c.recordId === companyId);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const since = thirteenMonthsAgoISO();
    const stats = await getClientStats(company, since);

    // Reuses the current-month deals cached alongside stats — no extra call.
    const recentDeals =
      !stats.error && company.apiKey
        ? await getClientRecentDeals(company, since, 10)
        : [];

    const companyUsers = users.filter((u) =>
      u.companyRecordIds.includes(companyId)
    );

    const detail: ClientDetail = {
      ...stats,
      recentDeals,
      users: companyUsers,
    };

    return NextResponse.json(detail);
  } catch (error) {
    console.error("[api/clients/:id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
