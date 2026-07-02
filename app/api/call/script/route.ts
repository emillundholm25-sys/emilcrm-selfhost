import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { generateCallScript, llmEnabled } from "@/lib/llm";
import type { Campaign, Contact } from "@/lib/types";

// Generate a cold-call script for a contact. The client sends the contact +
// its campaign context (state lives in the store); we return the script text
// + model used. Auth: proxy.ts gates optimistically, and requireSession()
// re-verifies here — this endpoint spends Anthropic credits, so it stays off
// entirely until the login gate is configured.

interface Body {
  contact?: Contact;
  campaign?: Pick<Campaign, "name" | "description" | "targetICP">;
  lang?: "en" | "sv";
}

export async function POST(req: Request) {
  if (!(await requireSession(req))) {
    return NextResponse.json(
      { ok: false, error: "Sign-in required. Set APP_PASSWORD and AUTH_SECRET, then log in — AI endpoints stay off without the login gate." },
      { status: 401 }
    );
  }
  if (!llmEnabled()) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 }
    );
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.contact?.firstName) {
    return NextResponse.json({ ok: false, error: "Provide `contact`." }, { status: 400 });
  }
  try {
    const { text, model } = await generateCallScript({
      contact: body.contact,
      campaign: body.campaign,
      lang: body.lang === "sv" ? "sv" : "en",
    });
    return NextResponse.json({ ok: true, text, model });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
