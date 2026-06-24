import { NextResponse } from "next/server";
import { authEnabled, tokenFromCookieHeader, verifySession } from "@/lib/auth";
import { clearState, dbConfigured, readState, writeState } from "@/lib/db";

// Defence-in-depth: re-verify auth here, not just in proxy.ts (which is only an
// optimistic check per Next 16 guidance).
async function authorized(req: Request): Promise<boolean> {
  if (!authEnabled()) return true;
  return verifySession(tokenFromCookieHeader(req.headers.get("cookie")));
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return new NextResponse("Unauthorized", { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ data: null, configured: false });
  try {
    const data = await readState();
    return NextResponse.json({ data, configured: true });
  } catch (e) {
    // Surface as "not configured" so the client falls back to its local mirror.
    return NextResponse.json({ data: null, configured: false, error: String(e) });
  }
}

export async function PUT(req: Request) {
  if (!(await authorized(req))) return new NextResponse("Unauthorized", { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ ok: false, configured: false });
  try {
    await writeState(await req.text());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await authorized(req))) return new NextResponse("Unauthorized", { status: 401 });
  if (dbConfigured()) {
    try {
      await clearState();
    } catch {
      // ignore
    }
  }
  return NextResponse.json({ ok: true });
}
