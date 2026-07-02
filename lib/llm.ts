// Server-only Claude wrapper. The app's first server-side LLM use: generate a
// cold-call script for a contact, and summarise a call transcript. Both run
// through the official Anthropic SDK. Everything degrades gracefully when
// ANTHROPIC_API_KEY isn't set (see llmEnabled()).

import Anthropic from "@anthropic-ai/sdk";
import { Campaign, CampaignICP, Contact } from "./types";

/** AI features are only available once an Anthropic key is configured. */
export function llmEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Default to the most capable Opus tier; a cost-conscious self-host can set
// ANTHROPIC_MODEL=claude-sonnet-4-6 to cut per-call spend.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

function client(): Anthropic {
  return new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
}

/** A compact "Field: value" block describing the person, skipping empties. */
function contactContext(c: Pick<Contact,
  "firstName" | "lastName" | "title" | "company" | "industry" | "companySize" | "location">): string {
  const lines: Array<[string, string | undefined]> = [
    ["Name", `${c.firstName} ${c.lastName}`.trim()],
    ["Title", c.title],
    ["Company", c.company],
    ["Industry", c.industry],
    ["Company size", c.companySize ? `${c.companySize} employees` : undefined],
    ["Location", c.location],
  ];
  return lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
}

function icpContext(icp?: CampaignICP): string {
  if (!icp) return "";
  const parts = [
    icp.titles?.length ? `Target titles: ${icp.titles.join(", ")}` : "",
    icp.industries?.length ? `Target industries: ${icp.industries.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

export interface ScriptInput {
  contact: Contact;
  campaign?: Pick<Campaign, "name" | "description" | "targetICP">;
  lang: "en" | "sv";
}

/** Generate a tailored cold-call script. Returns the text + the model used. */
export async function generateCallScript(input: ScriptInput): Promise<{ text: string; model: string }> {
  const { contact, campaign, lang } = input;
  const langName = lang === "sv" ? "Swedish" : "English";

  const system =
    `You are an expert B2B sales development rep who writes concise, natural cold-call scripts ` +
    `that book meetings. Write the entire script in ${langName}. Structure it with these labelled sections:\n` +
    `1. Opener — a one-line, permission-based opener using the prospect's first name.\n` +
    `2. Hook — one or two sentences tying the call to this person's role, company, and industry (be specific, not generic).\n` +
    `3. Value — a single concrete sentence on the outcome we help with (booking more meetings from cold outreach without the busywork).\n` +
    `4. Objections — two likely objections, each with a one-line rebuttal.\n` +
    `5. Close — a direct ask for a 20-minute meeting next week, offering two time options.\n` +
    `Keep it tight and speakable — short sentences, no corporate filler, no stage directions in brackets. ` +
    `Never invent facts about the company you weren't given.`;

  const user =
    `Write a cold-call script for this prospect.\n\n` +
    `PROSPECT\n${contactContext(contact)}\n\n` +
    (campaign?.name ? `CAMPAIGN: ${campaign.name}\n` : "") +
    (campaign?.description ? `Campaign goal: ${campaign.description}\n` : "") +
    (campaign?.targetICP ? `${icpContext(campaign.targetICP)}\n` : "");

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 1600,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return { text, model: res.model };
}

export interface SummaryInput {
  transcript: string;
  contact?: Pick<Contact, "firstName" | "lastName" | "company">;
  campaign?: Pick<Campaign, "name" | "description">;
}

export interface CallSummary {
  summary: string;
  takeaways: string[];
  sentiment: "positive" | "neutral" | "negative";
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "2-4 sentence summary of what was discussed." },
    takeaways: {
      type: "array",
      items: { type: "string" },
      description: "3-6 short, concrete key takeaways and any next steps.",
    },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
  },
  required: ["summary", "takeaways", "sentiment"],
  additionalProperties: false,
} as const;

/** Summarise a call transcript into a summary + key takeaways + sentiment. */
export async function summarizeCall(input: SummaryInput): Promise<CallSummary> {
  const { transcript, contact, campaign } = input;
  const who = contact ? `${contact.firstName} ${contact.lastName}`.trim() + (contact.company ? ` at ${contact.company}` : "") : "a prospect";

  const system =
    `You summarise sales call transcripts for a CRM. Be factual and concise — only state what the ` +
    `transcript supports. Return a short summary, concrete key takeaways (including any agreed next steps), ` +
    `and the prospect's overall sentiment.`;

  const user =
    `Summarise this cold call with ${who}` +
    (campaign?.name ? ` (campaign: ${campaign.name})` : "") +
    `.\n\nTRANSCRIPT\n${transcript}`;

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
    // Constrain the response to our schema so parsing never guesses.
    output_config: { format: { type: "json_schema", schema: SUMMARY_SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = JSON.parse(raw) as CallSummary;
  return {
    summary: String(parsed.summary ?? "").trim(),
    takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways.map(String) : [],
    sentiment: parsed.sentiment === "positive" || parsed.sentiment === "negative" ? parsed.sentiment : "neutral",
  };
}
