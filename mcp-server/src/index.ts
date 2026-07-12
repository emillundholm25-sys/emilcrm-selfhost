#!/usr/bin/env node
/**
 * emilcrm-mcp — a standalone MCP server for EmilCRM.
 *
 * EmilCRM is self-hosted: each user runs their own copy. This server is a thin,
 * universal bridge so ANY MCP client (Claude Desktop, Claude Code, Cursor,
 * Cowork, …) can drive prospecting into your own instance. It forwards each
 * tool call to your instance's built-in `/api/mcp` endpoint — the app stays the
 * single source of truth for the prospecting logic, dedup and scoring.
 *
 * Config (env):
 *   EMILCRM_URL    Your instance base URL, e.g. https://your-emilcrm.vercel.app
 *   EMILCRM_TOKEN  Your instance's INGEST_TOKEN (machine credential, not the login password)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const VERSION = "0.2.0";

// Accept the base URL with or without a trailing slash or `/api/mcp`.
const RAW_URL = (process.env.EMILCRM_URL || "").trim().replace(/\/+$/, "");
const BASE = RAW_URL.replace(/\/api\/mcp$/i, "");
const TOKEN = (process.env.EMILCRM_TOKEN || "").trim();
const ENDPOINT = `${BASE}/api/mcp`;

type UpstreamResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean };

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Forward one tool call to the instance's /api/mcp (JSON-RPC 2.0, Streamable HTTP). */
async function callUpstream(toolName: string, args: Record<string, unknown>): Promise<UpstreamResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: toolName, arguments: args } }),
    });
  } catch (e) {
    throw new Error(`Can't reach your EmilCRM at ${ENDPOINT} (${errText(e)}). Check EMILCRM_URL and that the app is deployed.`);
  }
  if (res.status === 401) throw new Error("EmilCRM rejected the token (401). Check EMILCRM_TOKEN matches the app's INGEST_TOKEN.");
  if (res.status === 503) throw new Error("EmilCRM prospecting is off (503). Set INGEST_TOKEN and DATABASE_URL on the app and redeploy.");
  if (!res.ok) throw new Error(`EmilCRM returned HTTP ${res.status} from ${ENDPOINT}.`);
  const json = (await res.json().catch(() => null)) as { result?: UpstreamResult; error?: { code?: number; message?: string } } | null;
  if (!json) throw new Error("EmilCRM returned a non-JSON response.");
  if (json.error) throw new Error(json.error.message || `EmilCRM error ${json.error.code}`);
  return json.result ?? { content: [] };
}

/** Shared handler body: forward, pass through content + error flag, actionable errors. */
async function forward(toolName: string, args: Record<string, unknown>) {
  try {
    const result = await callUpstream(toolName, args || {});
    return {
      content: (result.content && result.content.length ? result.content : [{ type: "text" as const, text: "(no content returned)" }]) as Array<{ type: "text"; text: string }>,
      ...(result.isError ? { isError: true } : {}),
    };
  } catch (e) {
    return { content: [{ type: "text" as const, text: `Error: ${errText(e)}` }], isError: true };
  }
}

const server = new McpServer({ name: "emilcrm", version: VERSION });

const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;
const person = z.record(z.string(), z.unknown());

server.registerTool(
  "emilcrm_get_overview",
  {
    title: "EmilCRM: campaigns & ICP overview",
    description:
      "Read the CRM's campaigns (each with its target ICP + a ready-to-run Apollo search recipe of industries/sizes/locations/titles), the existing contacts (to avoid duplicates), and overall counts. Call this FIRST to pick a campaign and read its ICP before searching Apollo. Returns JSON.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => forward("emilcrm_get_overview", {})
);

server.registerTool(
  "emilcrm_add_prospects",
  {
    title: "EmilCRM: add scored prospects",
    description:
      "Add people to a campaign's discovery pool as scored, suggested prospects (the user reviews them on the Prospects page before promoting). Pass raw Apollo person objects — EmilCRM parses names, title, company, email, phones and firmographics itself. Duplicates (by email / LinkedIn / name+company) are skipped server-side. Use this as the default for search results. Returns a JSON report of what was added/skipped.",
    inputSchema: {
      campaignId: z.string().optional().describe("Target campaign id (from emilcrm_get_overview). Omit to use the first active campaign."),
      people: z.array(person).min(1).describe("Apollo person objects (the full JSON Apollo returns), one per prospect."),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async (args) => forward("emilcrm_add_prospects", args as Record<string, unknown>)
);

server.registerTool(
  "emilcrm_add_contacts",
  {
    title: "EmilCRM: add contacts to the pipeline",
    description:
      "Add people straight into the pipeline as contacts in the 'To contact' stage, each with a first-touch next action so they appear in the Action Stream. Use this only when the user wants results worked immediately rather than reviewed first. Pass raw Apollo person objects; duplicates are skipped. Returns a JSON report including the new contact ids (pass those to emilcrm_draft_intro).",
    inputSchema: {
      campaignId: z.string().optional().describe("Target campaign id. Omit to use the first active campaign."),
      people: z.array(person).min(1).describe("Apollo person objects."),
      nextAction: z.string().min(1).describe("First-touch next action queued on each new contact, e.g. 'Send personalised intro to book a meeting'."),
      nextActionDate: z.string().optional().describe("Due date yyyy-mm-dd. Defaults to today."),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async (args) => forward("emilcrm_add_contacts", args as Record<string, unknown>)
);

server.registerTool(
  "emilcrm_draft_intro",
  {
    title: "EmilCRM: draft personalised intro emails",
    description:
      "Write a personalised intro email for one or more contacts from one of their campaign's templates (merge fields like {{firstName}} / {{company}} / {{title}} are filled in automatically) and save it as a draft on each — it shows up in the app's 'Intro email' panel for the user to review and send. Returns the rendered subject + body per contact so you can ALSO save them as Gmail drafts via a Gmail connector (never auto-send — sending stays the user's call). Pass the contactIds emilcrm_add_contacts returned; omit them to draft for every contact in a campaign that doesn't have a draft yet.",
    inputSchema: {
      contactIds: z.array(z.string()).optional().describe("Contacts to draft for (ids from emilcrm_add_contacts or emilcrm_get_overview)."),
      campaignId: z.string().optional().describe("Used only when contactIds is omitted — draft for this campaign's un-drafted contacts. Defaults to the first active campaign."),
      templateId: z.string().optional().describe("Which campaign template to use (an emailTemplates[].id from emilcrm_get_overview). Omit to use the campaign's first template."),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async (args) => forward("emilcrm_draft_intro", args as Record<string, unknown>)
);

server.registerTool(
  "emilcrm_set_next_action",
  {
    title: "EmilCRM: set next actions",
    description:
      "Set or replace the single next action on existing contacts by id (e.g. after enriching them further). Each contact in EmilCRM's Action Stream has exactly one next action + optional due date. Returns a JSON report of how many were applied.",
    inputSchema: {
      nextActions: z
        .array(
          z.object({
            contactId: z.string().describe("The contact id to update."),
            action: z.string().describe("The next-action text."),
            date: z.string().optional().describe("Due date yyyy-mm-dd; omit for 'Asap / queue'."),
          })
        )
        .min(1)
        .describe("List of next actions to apply."),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async (args) => forward("emilcrm_set_next_action", args as Record<string, unknown>)
);

const STAGE_ENUM = ["to_contact", "contacted", "scheduling", "booked", "met", "follow_up", "won", "lost"] as const;

server.registerTool(
  "emilcrm_get_pipeline",
  {
    title: "EmilCRM: read the pipeline",
    description:
      "Read the booking pipeline: contacts grouped by stage (to_contact → contacted → scheduling → booked → met → follow_up → won → lost), each with its next action, draft/call-script status and value. Use this to see who's where and what to work next. Optionally filter by campaign and/or a single stage. Returns JSON.",
    inputSchema: {
      campaignId: z.string().optional().describe("Only this campaign's contacts. Omit for all."),
      stage: z.enum(STAGE_ENUM).optional().describe("Only this stage. Omit for all stages."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (args) => forward("emilcrm_get_pipeline", args as Record<string, unknown>)
);

server.registerTool(
  "emilcrm_move_stage",
  {
    title: "EmilCRM: move contacts between stages",
    description:
      "Move one or more contacts to a new pipeline stage (e.g. after a reply → 'scheduling', after a no → 'lost'). Logs a stage-change on each contact's timeline. Optionally set a next action at the same time. Get valid contact ids from emilcrm_get_pipeline or emilcrm_get_overview. Returns a JSON report.",
    inputSchema: {
      moves: z
        .array(
          z.object({
            contactId: z.string().describe("The contact id to move."),
            stage: z.enum(STAGE_ENUM).describe("Destination stage."),
            nextAction: z.string().optional().describe("Optional next action to queue on the contact."),
            nextActionDate: z.string().optional().describe("yyyy-mm-dd for the next action; omit for 'Asap'."),
          })
        )
        .min(1)
        .describe("Stage moves to apply."),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async (args) => forward("emilcrm_move_stage", args as Record<string, unknown>)
);

server.registerTool(
  "emilcrm_book_meeting",
  {
    title: "EmilCRM: book a meeting",
    description:
      "Book a meeting with a contact and add it to the CRM's Meetings list. Advances the contact to the 'booked' stage if they're still early in the pipeline, and logs it on their timeline. This records the meeting in EmilCRM only — it does NOT create a calendar event or send an invite (use a Calendar connector for that). Returns the new meeting id.",
    inputSchema: {
      contactId: z.string().describe("Who the meeting is with (id from emilcrm_get_pipeline)."),
      start: z.string().describe("ISO datetime the meeting starts, e.g. 2026-07-15T14:00:00Z."),
      durationMins: z.number().optional().describe("Length in minutes. Default 30."),
      type: z.enum(["video", "call", "in_person"]).optional().describe("Default 'video'."),
      title: z.string().optional().describe("Meeting title. Defaults to 'Meeting with {name}'."),
      location: z.string().optional().describe("Video link, phone number, or address."),
      notes: z.string().optional().describe("Optional agenda / notes."),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async (args) => forward("emilcrm_book_meeting", args as Record<string, unknown>)
);

server.registerTool(
  "emilcrm_generate_call_script",
  {
    title: "EmilCRM: generate a cold-call script",
    description:
      "Generate an AI cold-call script tailored to a contact and their campaign, and save it on the contact (visible in the app's Call panel). Returns the script text. Runs on the CRM instance's own Claude (needs ANTHROPIC_API_KEY set on the app), so it works even in clients without their own model — if the key is missing you get an error explaining how to enable it.",
    inputSchema: {
      contactId: z.string().describe("Who to write the script for (id from emilcrm_get_pipeline)."),
      lang: z.enum(["en", "sv"]).optional().describe("Script language. Default 'sv' (Swedish)."),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async (args) => forward("emilcrm_generate_call_script", args as Record<string, unknown>)
);

server.registerTool(
  "emilcrm_get_calls",
  {
    title: "EmilCRM: read logged calls",
    description:
      "Read logged phone calls with their AI summaries, key takeaways, sentiment and transcripts — for one contact (contactId), a whole campaign (campaignId), or everything. Calls are captured via CloudTalk. Use this to catch up on what was said before following up. Returns JSON.",
    inputSchema: {
      contactId: z.string().optional().describe("Only this contact's calls."),
      campaignId: z.string().optional().describe("Only this campaign's calls. Omit both for all calls."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (args) => forward("emilcrm_get_calls", args as Record<string, unknown>)
);

async function main() {
  if (!BASE || !TOKEN) {
    console.error(
      "emilcrm-mcp: missing config.\n" +
        "  EMILCRM_URL   = your instance base URL, e.g. https://your-emilcrm.vercel.app\n" +
        "  EMILCRM_TOKEN = your instance's INGEST_TOKEN\n" +
        "Set both as env vars in your MCP client config. See the README."
    );
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`emilcrm-mcp v${VERSION} → ${ENDPOINT} (stdio)`);
}

main().catch((e) => {
  console.error("emilcrm-mcp fatal:", errText(e));
  process.exit(1);
});
