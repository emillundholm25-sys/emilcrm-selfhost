import { NextResponse } from "next/server";
import { dbConfigured, readState, writeState } from "@/lib/db";
import { parseDoc } from "@/lib/ingest";
import { verifyWebhookSecret } from "@/lib/cloudtalk";
import { applyCallResult, parseWebhookBody } from "@/lib/calls";
import { summarizeCall, llmEnabled, type CallSummary } from "@/lib/llm";

// Machine-facing webhook for CloudTalk Workflow Automations. When a recorded +
// transcribed call ends, CloudTalk POSTs the call data here; we summarise the
// transcript with Claude and store the result on the matched contact. Exempt
// from the login gate in proxy.ts — it authenticates with a shared secret.
//
//   POST /api/cloudtalk/webhook?token=<CLOUDTALK_WEBHOOK_SECRET>

export async function POST(req: Request) {
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const data = parseWebhookBody(raw);

  try {
    const doc = parseDoc(await readState());

    // Summarise the transcript when present and the LLM is configured.
    let summary: CallSummary | null = null;
    if (data.transcript && llmEnabled()) {
      try {
        summary = await summarizeCall({ transcript: data.transcript });
      } catch (e) {
        // Don't lose the call if summarisation fails — store the raw transcript.
        console.error("summarizeCall failed:", e);
      }
    }

    const report = applyCallResult(doc, data, summary);
    if (!report.matched) {
      // Nothing to attach to — acknowledge so CloudTalk doesn't retry forever.
      return NextResponse.json({ ok: true, matched: false });
    }

    await writeState(JSON.stringify(doc));
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
