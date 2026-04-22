import { NextResponse } from "next/server";
import { getAirtableData } from "@/lib/cache";

/**
 * Redirects to the Duodeal impersonation URL for the given user recordId
 * (Airtable user record id, not the Duodeal numeric user id).
 *
 * We pull the URL just-in-time from Airtable (or cache) so we never persist
 * the impersonation token, and we never log the URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const { users } = await getAirtableData();
  const user = users.find((u) => u.recordId === userId);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.loginAsUrl) {
    return NextResponse.json(
      { error: "No Login as URL available for this user" },
      { status: 400 }
    );
  }

  return NextResponse.redirect(user.loginAsUrl, { status: 302 });
}
