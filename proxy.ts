import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, authEnabled, verifySession } from "@/lib/auth";

// Next 16 renamed Middleware to Proxy. Used here only as an optimistic auth
// gate (the API route re-verifies). When the auth secrets aren't set, the app
// stays fully open — so deploying this never locks anyone out.
export async function proxy(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/login")) return NextResponse.next();

  // The ingest + MCP APIs are for machine clients (the Cowork prospecting
  // plugin); they carry a bearer token, not the session cookie, and gate auth
  // themselves.
  if (
    pathname.startsWith("/api/ingest") ||
    pathname.startsWith("/api/mcp") ||
    pathname.startsWith("/api/cloudtalk")
  ) {
    return NextResponse.next();
  }

  if (await verifySession(req.cookies.get(COOKIE_NAME)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
