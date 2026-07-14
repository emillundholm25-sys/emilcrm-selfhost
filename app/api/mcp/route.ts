import { NextResponse } from "next/server";
import { dbConfigured, readState, writeState } from "@/lib/db";
import { DraftBody, IngestBody, applyDrafts, applyIngest, buildDigest, parseDoc } from "@/lib/ingest";
import {
  BookMeetingBody,
  MoveStageBody,
  applyBookMeeting,
  applyMoveStage,
  readCalls,
  readPipeline,
  setCallScript,
} from "@/lib/pipeline";
import { generateCallScript, llmEnabled } from "@/lib/llm";
import { CompanyFit, bolagsverketEnabled, getCompany, scoreCompanyFit } from "@/lib/bolagsverket";
import { computeICP } from "@/lib/icp";
import { CallScript, Contact } from "@/lib/types";

// Remote MCP endpoint for the Cowork "emilcrm-prospecting" plugin.
//
// Cowork's plugin uploader only allows MCP servers declared as remote
// (http/sse/ws) or as a packaged MCPB bundle — a local stdio script can't be
// shipped inside an installable `.plugin` file. This route is the remote
// replacement: it speaks plain JSON-RPC 2.0 over a single stateless POST
// endpoint (the "Streamable HTTP" transport, without the optional SSE
// stream — every call is one request in, one JSON response out). It exposes
// the full EmilCRM tool surface — prospecting (add prospects/contacts, draft
// intros, set next actions) plus pipeline ops (read pipeline, move stage, book
// meeting, generate call script, read calls) — calling straight into the same
// `lib/ingest` / `lib/pipeline` / `lib/llm` logic the app uses (no internal
// HTTP hop). The standalone `emilcrm-mcp` bridge forwards to this endpoint.
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
  {
    name: "emilcrm_get_pipeline",
    description:
      "Read the booking pipeline: contacts grouped by stage (to_contact → contacted → scheduling → booked → met → follow_up → won → lost), each with its next action, draft/call-script status and value. Use this to see who's where and what to work next. Optionally filter by campaignId and/or a single stage. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Only this campaign's contacts. Omit for all." },
        stage: {
          type: "string",
          enum: ["to_contact", "contacted", "scheduling", "booked", "met", "follow_up", "won", "lost"],
          description: "Only this stage. Omit for all stages.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "emilcrm_move_stage",
    description:
      "Move one or more contacts to a new pipeline stage (e.g. after a reply → 'scheduling', after a no → 'lost'). Logs a stage-change on each contact's timeline. Optionally set a next action at the same time. Get valid contact ids from emilcrm_get_pipeline or emilcrm_get_overview.",
    inputSchema: {
      type: "object",
      properties: {
        moves: {
          type: "array",
          description: "Stage moves to apply.",
          items: {
            type: "object",
            properties: {
              contactId: { type: "string" },
              stage: {
                type: "string",
                enum: ["to_contact", "contacted", "scheduling", "booked", "met", "follow_up", "won", "lost"],
              },
              nextAction: { type: "string", description: "Optional next action to queue on the contact." },
              nextActionDate: { type: "string", description: "yyyy-mm-dd for the next action; omit for 'Asap'." },
            },
            required: ["contactId", "stage"],
          },
        },
      },
      required: ["moves"],
      additionalProperties: false,
    },
  },
  {
    name: "emilcrm_book_meeting",
    description:
      "Book a meeting with a contact and put it on the CRM's Meetings list. Advances the contact to the 'booked' stage if they're still early in the pipeline, and logs it on their timeline. This records the meeting in EmilCRM — it does NOT create a calendar event or send an invite (do that via a Calendar connector if the user wants one).",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Who the meeting is with (id from emilcrm_get_pipeline)." },
        start: { type: "string", description: "ISO datetime the meeting starts, e.g. 2026-07-15T14:00:00Z." },
        durationMins: { type: "number", description: "Length in minutes. Default 30." },
        type: { type: "string", enum: ["video", "call", "in_person"], description: "Default 'video'." },
        title: { type: "string", description: "Meeting title. Defaults to 'Meeting with {name}'." },
        location: { type: "string", description: "Video link, phone number, or address." },
        notes: { type: "string", description: "Optional agenda / notes." },
      },
      required: ["contactId", "start"],
      additionalProperties: false,
    },
  },
  {
    name: "emilcrm_generate_call_script",
    description:
      "Generate an AI cold-call script tailored to a contact and their campaign, and save it on the contact (visible in the app's Call panel). Returns the script text. Requires ANTHROPIC_API_KEY on the server; returns an error telling the user to set it if absent. Uses the CRM's own Claude, so it works even in clients without their own model.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Who to write the script for (id from emilcrm_get_pipeline)." },
        lang: { type: "string", enum: ["en", "sv"], description: "Script language. Default 'sv' (Swedish)." },
      },
      required: ["contactId"],
      additionalProperties: false,
    },
  },
  {
    name: "emilcrm_get_calls",
    description:
      "Read logged phone calls with their AI summaries, key takeaways, sentiment and transcripts — for one contact (contactId), a whole campaign (campaignId), or everything. Calls are captured via CloudTalk. Read-only. Use this to catch up on what was said before following up.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Only this contact's calls." },
        campaignId: { type: "string", description: "Only this campaign's calls. Omit both for all calls." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "emilcrm_enrich_company",
    description:
      "Enrich a Swedish company by its organisationsnummer using the official Bolagsverket register (free open data). Returns firmographics — registered name, SNI industry code(s), city, legal form, business description, active status — and, when a campaign is given, an ICP-fit score (0–100) with reasons. Use this to qualify a Swedish company before adding it to the pipeline, or to fill in industry/location on a prospect Apollo missed (Apollo is weak on Nordic SMBs). Requires BOLAGSVERKET_CLIENT_ID/SECRET on the server; returns a clear error telling the user to configure it if absent.",
    inputSchema: {
      type: "object",
      properties: {
        orgnr: { type: "string", description: "Swedish organisationsnummer, 10 digits (hyphen optional), e.g. 556074-7551." },
        campaignId: {
          type: "string",
          description: "Optional campaign whose ICP the company is scored against (id from emilcrm_get_overview). Omit to return firmographics only.",
        },
      },
      required: ["orgnr"],
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

  if (name === "emilcrm_get_pipeline") {
    return { ok: true, ...readPipeline(doc, { campaignId: args.campaignId as string | undefined, stage: args.stage as string | undefined }) };
  }

  if (name === "emilcrm_move_stage") {
    const report = applyMoveStage(doc, { moves: args.moves as MoveStageBody["moves"] });
    await writeState(JSON.stringify(doc));
    return { ok: true, report };
  }

  if (name === "emilcrm_book_meeting") {
    const report = applyBookMeeting(doc, args as unknown as BookMeetingBody);
    await writeState(JSON.stringify(doc));
    return { ok: true, ...report };
  }

  if (name === "emilcrm_generate_call_script") {
    if (!llmEnabled()) throw new Error("AI is not configured on this instance. Set ANTHROPIC_API_KEY on the app and redeploy to generate call scripts.");
    const contactId = args.contactId as string | undefined;
    const contact = doc.state.contacts.find((c: Contact) => c.id === contactId);
    if (!contact) throw new Error(`Contact ${contactId} not found. Call emilcrm_get_pipeline for valid ids.`);
    const lang = args.lang === "en" ? "en" : "sv";
    const campaign = doc.state.campaigns.find((cm) => cm.id === contact.campaignId);
    const { text, model } = await generateCallScript({ contact, campaign, lang });
    const script: CallScript = { text, model, lang, generatedAt: new Date().toISOString() };
    const saved = setCallScript(doc, contact.id, script);
    await writeState(JSON.stringify(doc));
    return { ok: true, ...saved, lang, model, script: text };
  }

  if (name === "emilcrm_get_calls") {
    return { ok: true, ...readCalls(doc, { contactId: args.contactId as string | undefined, campaignId: args.campaignId as string | undefined }) };
  }

  if (name === "emilcrm_enrich_company") {
    if (!bolagsverketEnabled()) {
      throw new Error(
        "Bolagsverket enrichment is not configured on this instance. Set BOLAGSVERKET_CLIENT_ID and BOLAGSVERKET_CLIENT_SECRET on the app and redeploy (free API — register at bolagsverket.se/apierochoppnadata).",
      );
    }
    const company = await getCompany(args.orgnr as string);
    if (!company) return { ok: true, found: false, message: `No company found for org-nr ${args.orgnr}.` };

    let fit: CompanyFit | undefined;
    const campaignId = args.campaignId as string | undefined;
    if (campaignId) {
      const campaign = doc.state.campaigns.find((cm) => cm.id === campaignId);
      if (campaign) {
        const icp =
          campaign.targetICP ??
          (() => {
            // No defined ICP — derive industries/locations from the campaign's own contacts.
            const contacts = doc.state.contacts.filter((c: Contact) => c.campaignId === campaign.id);
            const p = computeICP(contacts);
            return { industries: p.industries.map((f) => f.value), locations: p.locations.map((f) => f.value) };
          })();
        fit = scoreCompanyFit(company, icp);
      }
    }
    return { ok: true, found: true, company, fit };
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
      serverInfo: { name: "emilcrm", version: "0.4.0" },
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
