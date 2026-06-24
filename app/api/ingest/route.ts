import { NextResponse } from "next/server";
import { dbConfigured, readState, writeState } from "@/lib/db";
import { DraftBody, IngestBody, applyDrafts, applyIngest, buildDigest, parseDoc } from "@/lib/ingest";

// Machine-facing ingest API for the Cowork prospecting plugin. Authenticated
// with a dedicated bearer token (INGEST_TOKEN) — separate from the human
// password-cookie gate — so an agent can read the ICP and write prospects
// without a browser session.
//
//   GET  /api/ingest   → digest: campaigns + search recipes + contacts + counts
//   POST /api/ingest   → merge a batch of people (dedup) / set next actions

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** null = authorized; otherwise an error response to return. */
function gate(req: Request): NextResponse | null {
  const token = process.env.INGEST_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "INGEST_TOKEN is not configured on the server." },
      { status: 503 }
    );
  }
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m || !constantTimeEqual(m[1], token)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  return null;
}

export async function GET(req: Request) {
  const denied = gate(req);
  if (denied) return denied;
  try {
    const doc = parseDoc(await readState());
    return NextResponse.json({ ok: true, ...buildDigest(doc) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = gate(req);
  if (denied) return denied;
  let body: IngestBody & { draft?: DraftBody };
  try {
    body = (await req.json()) as IngestBody & { draft?: DraftBody };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.people) && !Array.isArray(body.nextActions) && !body.draft) {
    return NextResponse.json(
      { ok: false, error: "Provide `people` (array), `nextActions` (array), and/or `draft`." },
      { status: 400 }
    );
  }
  try {
    const doc = parseDoc(await readState());
    const report =
      Array.isArray(body.people) || Array.isArray(body.nextActions) ? applyIngest(doc, body) : undefined;
    const draftReport = body.draft ? applyDrafts(doc, body.draft) : undefined;
    await writeState(JSON.stringify(doc));
    return NextResponse.json({ ok: true, ...(report ? { report } : {}), ...(draftReport ? { draftReport } : {}) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
