import { NextResponse } from "next/server";
import {
  getAirtableData,
  invalidateClient,
  rebuildSnapshot,
  thirteenMonthsAgoISO,
} from "@/lib/cache";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  invalidateClient(companyId);

  const url = new URL(request.url);
  const full = url.searchParams.get("full") === "1";

  if (full) {
    try {
      const { companies } = await getAirtableData(true);
      const company = companies.find((c) => c.recordId === companyId);
      if (!company) {
        return NextResponse.json(
          { error: "Company not found" },
          { status: 404 }
        );
      }
      await rebuildSnapshot(company, thirteenMonthsAgoISO());
      return NextResponse.json({
        ok: true,
        invalidated: companyId,
        rebuilt: true,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, invalidated: companyId });
}
