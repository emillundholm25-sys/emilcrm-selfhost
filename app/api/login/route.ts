import { NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_MAX_AGE, authEnabled, checkPassword, createSession } from "@/lib/auth";
import { clearLoginAttempts, loginLockoutRemaining, recordLoginFailure } from "@/lib/rate-limit";

/** Throttle key: the client IP from the proxy, falling back to a shared bucket. */
function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function lockedResponse(retryAfter: number) {
  return NextResponse.json({ ok: false, lockedOut: true, retryAfter }, {
    status: 429,
    headers: { "Retry-After": String(retryAfter) },
  });
}

export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true, authDisabled: true });

  const key = clientKey(req);
  const locked = loginLockoutRemaining(key);
  if (locked > 0) return lockedResponse(locked);

  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!checkPassword(String(password ?? ""))) {
    recordLoginFailure(key);
    const nowLocked = loginLockoutRemaining(key);
    if (nowLocked > 0) return lockedResponse(nowLocked);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  clearLoginAttempts(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await createSession(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
