// Server-side pipeline operations for the MCP tool surface (Phase 2).
//
// Like lib/ingest.ts, these are pure mutations on the single Neon JSONB
// document ({ state, version }) — read the pipeline, move contacts between
// stages, book meetings, and read logged calls. The route handler persists the
// doc after a write. Behaviour mirrors the in-app store actions (setStage,
// bookMeeting) so an agent and the UI produce identical history.

import {
  Activity,
  ActivityType,
  CallScript,
  Contact,
  Meeting,
  MeetingType,
  STAGE_META,
  STAGES,
  Stage,
  fullName,
} from "./types";
import { uid } from "./utils";
import { PersistDoc } from "./ingest";

function makeActivity(contactId: string, type: ActivityType, text: string): Activity {
  return { id: uid(), contactId, type, text, date: new Date().toISOString() };
}

function isStage(s: unknown): s is Stage {
  return typeof s === "string" && (STAGES as string[]).includes(s);
}

/** Compact contact view shared by the read tools. */
function contactView(c: Contact) {
  return {
    id: c.id,
    name: fullName(c),
    company: c.company ?? null,
    title: c.title ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    stage: c.stage,
    campaignId: c.campaignId ?? null,
    nextAction: c.nextAction ?? null,
    nextActionDate: c.nextActionDate ?? null,
    hasDraft: !!c.emailDraft,
    hasCallScript: !!c.callScript,
    callsCount: c.calls?.length ?? 0,
    value: c.value ?? null,
  };
}

// ── Read: pipeline ────────────────────────────────────────────────────────

export interface PipelineQuery {
  campaignId?: string;
  stage?: string;
}

/** Group contacts by stage (in board order), optionally filtered. Read-only. */
export function readPipeline(doc: PersistDoc, q: PipelineQuery = {}) {
  const { contacts } = doc.state;
  const stageFilter = isStage(q.stage) ? q.stage : undefined;
  const filtered = contacts.filter(
    (c) => (!q.campaignId || c.campaignId === q.campaignId) && (!stageFilter || c.stage === stageFilter)
  );

  const stages = (stageFilter ? [stageFilter] : STAGES).map((stage) => {
    const inStage = filtered.filter((c) => c.stage === stage);
    return {
      stage,
      label: STAGE_META[stage].label,
      count: inStage.length,
      contacts: inStage.map(contactView),
    };
  });

  return {
    campaignId: q.campaignId ?? null,
    stage: stageFilter ?? null,
    stages,
    counts: { contacts: filtered.length },
  };
}

// ── Write: move stage ─────────────────────────────────────────────────────

export interface MoveStageBody {
  moves: Array<{ contactId: string; stage: string; nextAction?: string; nextActionDate?: string }>;
}

export interface MoveStageReport {
  moved: Array<{ contactId: string; name: string; from: Stage; to: Stage }>;
  skipped: Array<{ contactId: string; reason: string }>;
  counts: { moved: number };
}

/** Move contacts to a new stage (mirrors the store's setStage), optionally
 * queueing a next action on each. Caller persists `doc`. */
export function applyMoveStage(doc: PersistDoc, body: MoveStageBody): MoveStageReport {
  const state = doc.state;
  const report: MoveStageReport = { moved: [], skipped: [], counts: { moved: 0 } };

  for (const m of body.moves ?? []) {
    if (!isStage(m.stage)) {
      report.skipped.push({ contactId: m.contactId, reason: `invalid stage '${m.stage}'` });
      continue;
    }
    const contact = state.contacts.find((c) => c.id === m.contactId);
    if (!contact) {
      report.skipped.push({ contactId: m.contactId, reason: "not found" });
      continue;
    }
    const from = contact.stage;
    if (from !== m.stage) {
      contact.stage = m.stage;
      state.activities.unshift(
        makeActivity(contact.id, "stage_change", `Moved ${STAGE_META[from].label} → ${STAGE_META[m.stage].label}`)
      );
    }
    if (m.nextAction?.trim()) {
      contact.nextAction = m.nextAction.trim();
      contact.nextActionDate = m.nextActionDate || undefined;
      state.activities.unshift(makeActivity(contact.id, "action_set", `Next action set: ${contact.nextAction}`));
    }
    report.moved.push({ contactId: contact.id, name: fullName(contact), from, to: m.stage });
  }

  report.counts.moved = report.moved.length;
  return report;
}

// ── Write: book meeting ───────────────────────────────────────────────────

export interface BookMeetingBody {
  contactId: string;
  start: string; // ISO datetime
  title?: string;
  durationMins?: number;
  type?: string;
  location?: string;
  notes?: string;
}

const MEETING_TYPES: MeetingType[] = ["video", "call", "in_person"];

export interface BookMeetingReport {
  meetingId: string;
  contactId: string;
  name: string;
  title: string;
  start: string;
  stage: Stage;
}

/** Book a meeting for a contact and advance them to "booked" if still early in
 * the pipeline (mirrors the store's bookMeeting). Caller persists `doc`. */
export function applyBookMeeting(doc: PersistDoc, body: BookMeetingBody): BookMeetingReport {
  const state = doc.state;
  const contact = state.contacts.find((c) => c.id === body.contactId);
  if (!contact) throw new Error(`Contact ${body.contactId} not found. Call emilcrm_get_pipeline or emilcrm_get_overview for valid ids.`);

  const when = new Date(body.start);
  if (!body.start || isNaN(when.getTime())) {
    throw new Error("start must be a valid ISO datetime, e.g. 2026-07-15T14:00:00Z.");
  }

  const type: MeetingType = MEETING_TYPES.includes(body.type as MeetingType) ? (body.type as MeetingType) : "video";
  const durationMins = typeof body.durationMins === "number" && body.durationMins > 0 ? body.durationMins : 30;
  const title = body.title?.trim() || `Meeting with ${fullName(contact)}`;

  const meeting: Meeting = {
    id: uid(),
    contactId: contact.id,
    title,
    start: when.toISOString(),
    durationMins,
    type,
    location: body.location?.trim() || undefined,
    notes: body.notes?.trim() || undefined,
    status: "scheduled",
    createdAt: new Date().toISOString(),
  };
  state.meetings.push(meeting);

  if (contact.stage === "to_contact" || contact.stage === "contacted" || contact.stage === "scheduling") {
    contact.stage = "booked";
  }

  const whenLabel = when.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  state.activities.unshift(makeActivity(contact.id, "meeting_booked", `Meeting booked: ${title} — ${whenLabel}`));

  return { meetingId: meeting.id, contactId: contact.id, name: fullName(contact), title, start: meeting.start, stage: contact.stage };
}

// ── Write: store a generated call script ──────────────────────────────────

/** Save a generated call script onto a contact (mirrors the store's
 * setCallScript — no activity logged). Caller persists `doc`. */
export function setCallScript(doc: PersistDoc, contactId: string, script: CallScript): { contactId: string; name: string } {
  const contact = doc.state.contacts.find((c) => c.id === contactId);
  if (!contact) throw new Error(`Contact ${contactId} not found.`);
  contact.callScript = script;
  return { contactId: contact.id, name: fullName(contact) };
}

// ── Read: calls ───────────────────────────────────────────────────────────

export interface CallsQuery {
  contactId?: string;
  campaignId?: string;
}

/** Return logged calls (with summaries/takeaways/transcripts) for one contact,
 * or across a campaign / everything. Read-only. */
export function readCalls(doc: PersistDoc, q: CallsQuery = {}) {
  const { contacts } = doc.state;
  const scope = contacts.filter(
    (c) => (!q.contactId || c.id === q.contactId) && (!q.campaignId || c.campaignId === q.campaignId)
  );

  const contactsWithCalls = scope
    .filter((c) => (c.calls?.length ?? 0) > 0)
    .map((c) => ({
      contactId: c.id,
      name: fullName(c),
      company: c.company ?? null,
      calls: (c.calls ?? []).map((r) => ({
        id: r.id,
        direction: r.direction,
        startedAt: r.startedAt,
        durationSecs: r.durationSecs ?? null,
        outcome: r.outcome ?? null,
        status: r.status,
        sentiment: r.sentiment ?? null,
        summary: r.summary ?? null,
        takeaways: r.takeaways ?? [],
        recordingUrl: r.recordingUrl ?? null,
        transcript: r.transcript ?? null,
      })),
    }));

  return {
    contactId: q.contactId ?? null,
    campaignId: q.campaignId ?? null,
    contacts: contactsWithCalls,
    counts: {
      contactsWithCalls: contactsWithCalls.length,
      calls: contactsWithCalls.reduce((n, c) => n + c.calls.length, 0),
    },
  };
}
