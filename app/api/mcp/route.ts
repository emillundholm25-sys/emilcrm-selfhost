import { NextResponse } from "next/server";
import { dbConfigured, readState, writeState } from "@/lib/db";
import { DraftBody, IngestBody, applyDrafts, applyIngest, buildDigest, parseDoc } from "@/lib/ingest";

// Remote MCP endpoint for the Cowork "emilcrm-prospecting" plugin.
//
// Cowork's plugin uploader only allows MCP servers declared as remote
// (http/sse/ws) or as a packaged MCPB bundle — a local stdio script can't be
// shipped inside an installable `.plugin` file. This route is the remote
// replacement: it speaks plain JSON-RPC 2.0 over a single stateless POST
// endpoint (the "Streamable HTTP" transport, without the optional SSE
// stream — every call is one request in, one JSON response out) and exposes
// the exact same four tools the previous bundled stdio server exposed,
// calling straight into the same `lib/ingest` logic that `/api/ingest` uses
// (no internal HTTP hop).
//
//   POST /api/mcp   → initialize / ping / tools/list / tools/call
//
// Auth: same bearer token as /api/ingest (INGEST_TOKEN), sent by the
// connector as `Authorization: Bearer <EMILCRM_INGEST_TOKEN>`.

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function authorized(req: Request, token: string): boolean {
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return !!m && constantTimeEqual(m[1], token);
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    protocolVersion?: string;
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

const TOOLS = [
  {
    name: "emilcrm_get_overview",
    description:
      "Read the CRM's campaigns (each with its target ICP + a ready-to-run search recipe of industries/sizes/locations/titles), the existing contacts (to avoid duplicates), and overall counts. Call this FIRST to pick a campaign and read its ICP before searching Apollo.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "emilcrm_add_prospects",
    description:
      "Add people to the campaign's discovery pool as scored, suggested prospects (the user reviews them on the Prospects page before promoting). Pass raw Apollo person objects — the CRM parses names, title, company, email, phones and firmographics itself. Duplicates (by email / LinkedIn / name+company) are skipped server-side. Use this as the default for search results.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: {
          type: "string",
          description: "Target campaign id (from emilcrm_get_overview). Omit to use the first active campaign.",
        },
        people: { type: "array", items: { type: "object" }, description: "Apollo person objects (the full JSON Apollo returns)." },
      },
      required: ["people"],
      additionalProperties: false,
    },
  },
  {
    name: "emilcrm_add_contacts",
    description:
      "Add people straight into the pipeline as contacts in the 'To contact' stage, each with a first-touch next action so they appear in the Action Stream. Use this only when the user wants results worked immediately rather than reviewed first. Pass raw Apollo person objects; duplicates are skipped.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Target campaign id. Omit to use the first active campaign." },
        people: { type: "array", items: { type: "object" }, description: "Apollo person objects." },
        nextAction: {
          type: "string",
          description: "First-touch next action queued on each new contact, e.g. 'Send personalised intro to book a meeting'.",
        },
        nextActionDate: { type: "string", description: "Due date yyyy-mm-dd. Defaults to today." },
      },
      required: ["people", "nextAction"],
      additionalProperties: false,
    },
  },
  {
    name: "emilcrm_draft_intro",
    description:
      "Write a personalised intro email for one or more contacts from one of their campaign's templates (merge fields like {{firstName}} / {{company}} / {{title}} are filled in automatically) and save it as a draft on each — it shows up in the app's 'Intro email' panel for the user to review and send. Returns the rendered subject + body for each contact so you can ALSO save them as Gmail drafts via the Gmail connector (never auto-send — sending stays the user's call). Pass the contactIds that emilcrm_add_contacts returned; omit them to draft for every contact in a campaign that doesn't have a draft yet. A campaign can have several templates (see emailTemplates in emilcrm_get_overview) — pass templateId to choose one, or omit it to use the first.",
    inputSchema: {
      type: "object",
      properties: {
        contactIds: {
          type: "array",
          items: { type: "string" },
          description: "Contacts to draft for (ids from emilcrm_add_contacts or emilcrm_get_overview).",
        },
        campaignId: {
          type: "string",
          description: "Used only when contactIds is omitted — draft for this campaign's un-drafted contacts. Defaults to the first active campaign.",
        },
        templateId: {
          type: "string",
          description: "Which campaign template to use (an emailTemplates[].id from emilcrm_get_overview). Omit to use the campaign's first template.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "emilcrm_set_next_action",
    description: "Set or replace the next action on existing contacts by id (e.g. after enriching them further).",
    inputSchema: {
      type: "object",
      properties: {
        nextActions: {
          type: "array",
          description: "List of next actions to apply.",
          items: {
            type: "object",
            properties: {
              contactId: { type: "string" },
              action: { type: "string" },
              date: { type: "string", description: "yyyy-mm-dd; omit for 'Asap'." },
            },
            required: ["contactId", "action"],
          },
        },
      },
      required: ["nextActions"],
      additionalProperties: false,
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>) {
  const doc = parseDoc(await readState());

  if (name === "emilcrm_get_overview") {
    return { ok: true, ...buildDigest(doc) };
  }

  if (name === "emilcrm_add_prospects") {
    const report = applyIngest(doc, {
      mode: "prospect",
      campaignId: args.campaignId as string | undefined,
      people: args.people as unknown[] | undefined,
    } as IngestBody);
    await writeState(JSON.stringify(doc));
    return { ok: true, report };
  }

  if (name === "emilcrm_add_contacts") {
    const report = applyIngest(doc, {
      mode: "contact",
      campaignId: args.campaignId as string | undefined,
      people: args.people as unknown[] | undefined,
      nextAction: args.nextAction as string | undefined,
      nextActionDate: args.nextActionDate as string | undefined,
    } as IngestBody);
    await writeState(JSON.stringify(doc));
    return { ok: true, report };
  }

  if (name === "emilcrm_draft_intro") {
    const report = applyDrafts(doc, {
      contactIds: args.contactIds as string[] | undefined,
      campaignId: args.campaignId as string | undefined,
      templateId: args.templateId as string | undefined,
    } as DraftBody);
    await writeState(JSON.stringify(doc));
    return { ok: true, report };
  }

  if (name === "emilcrm_set_next_action") {
    const report = applyIngest(doc, {
      nextActions: args.nextActions as IngestBody["nextActions"],
    } as IngestBody);
    await writeState(JSON.stringify(doc));
    return { ok: true, report };
  }

  throw new Error(`Unknown tool: ${name}`);
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: string | number | null | undefined, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

export async function POST(req: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return rpcError(null, -32000, "INGEST_TOKEN is not configured on the server.", 503);
  if (!authorized(req, token)) return rpcError(null, -32001, "Unauthorized", 401);
  if (!dbConfigured()) return rpcError(null, -32000, "Database is not configured.", 503);

  let msg: JsonRpcMessage;
  try {
    msg = (await req.json()) as JsonRpcMessage;
  } catch {
    return rpcError(null, -32700, "Invalid JSON", 400);
  }

  const { id, method, params } = msg;

  // Notifications (no id, e.g. `notifications/initialized`) get no body —
  // per the MCP Streamable HTTP spec, the server replies 202 with no content.
  if (id === undefined || id === null) return new NextResponse(null, { status: 202 });

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "emilcrm", version: "0.2.0" },
    });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params?.name || "";
    const args = params?.arguments || {};
    try {
      const data = await callTool(name, args);
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return rpcResult(id, { content: [{ type: "text", text: `Error: ${message}` }], isError: true });
    }
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

export async function GET() {
  // Stateless, POST-only server — no server-initiated messages to stream.
  return new NextResponse(null, { status: 405 });
}
