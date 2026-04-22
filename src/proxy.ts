import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

// Public paths that bypass auth (OAuth callback, sign-in page, Vercel cron)
const PUBLIC_PATHS = [
  "/api/auth",
  "/signin",
  "/api/cron",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = await auth();

  if (!session) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Defense in depth: also enforce domain at the proxy layer
  const email = session.user?.email ?? "";
  if (!email.endsWith("@duodeal.com")) {
    return NextResponse.redirect(new URL("/signin?error=Forbidden", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Match everything except Next internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico)).*)"],
};
