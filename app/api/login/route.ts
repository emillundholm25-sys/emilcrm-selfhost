import { NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_MAX_AGE, authEnabled, checkPassword, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true, authDisabled: true });
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!checkPassword(String(password ?? ""))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
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
