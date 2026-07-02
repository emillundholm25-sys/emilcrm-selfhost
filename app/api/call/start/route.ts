import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { cloudtalkEnabled, initiateCall } from "@/lib/cloudtalk";

// Place an outbound call via CloudTalk click-to-call. CloudTalk rings the
// configured agent's phone first, then dials `number`. Auth: proxy.ts gates
// optimistically, and requireSession() re-verifies here — this endpoint
// places real phone calls, so it stays off until the login gate is configured.

interface Body {
  number?: string;
}

export async function POST(req: Request) {
  if (!(await requireSession(req))) {
    return NextResponse.json(
      { ok: false, error: "Sign-in required. Set APP_PASSWORD and AUTH_SECRET, then log in — calling endpoints stay off without the login gate." },
      { status: 401 }
    );
  }
  if (!cloudtalkEnabled()) {
    return NextResponse.json(
      { ok: false, error: "CloudTalk is not configured on the server." },
      { status: 503 }
    );
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.number?.trim()) {
    return NextResponse.json({ ok: false, error: "Provide `number`." }, { status: 400 });
  }
  try {
    const result = await initiateCall(body.number.trim());
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || "CloudTalk rejected the call" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, cloudtalkCallId: result.cloudtalkCallId });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
