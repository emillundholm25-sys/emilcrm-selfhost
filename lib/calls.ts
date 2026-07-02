// Server-side call ingest: applies a finished CloudTalk call (transcript +
// AI summary) to the single Neon JSONB document. Mirrors lib/ingest.ts — pure
// mutation of doc.state; the caller persists. The contact is matched by an
// existing pending CallRecord's cloudtalkCallId, else by the callee number.

import type { PersistDoc } from "./ingest";
import { normalizePhone } from "./cloudtalk";
import type { CallSummary } from "./llm";
import { Activity, CallRecord, Contact, fullName } from "./types";
import { uid } from "./utils";

/** The fields we read off a CloudTalk webhook payload (best-effort, defensive). */
export interface CallWebhookData {
  cloudtalkCallId?: string;
  calleeNumber?: string;
  transcript?: string;
  recordingUrl?: string;
  durationSecs?: number;
}

export interface ApplyCallReport {
  matched: boolean;
  contactId?: string;
  contactName?: string;
  callId?: string;
}

function makeActivity(contactId: string, text: string): Activity {
  return { id: uid(), contactId, type: "call", text, date: new Date().toISOString() };
}

/** Every number we'd accept as "this contact" for webhook matching. */
function contactNumbers(c: Contact): string[] {
  const nums = [c.phone, ...(c.phones ?? []), c.hqPhone].filter(Boolean) as string[];
  return nums.map(normalizePhone).filter(Boolean);
}

/** Find the contact this call belongs to: by pending call id, else by number. */
function findContact(contacts: Contact[], data: CallWebhookData): Contact | undefined {
  if (data.cloudtalkCallId) {
    const byCall = contacts.find((c) => c.calls?.some((r) => r.cloudtalkCallId === data.cloudtalkCallId));
    if (byCall) return byCall;
  }
  const callee = normalizePhone(data.calleeNumber);
  if (callee) {
    return contacts.find((c) => contactNumbers(c).includes(callee));
  }
  return undefined;
}

/**
 * Attach the call's transcript + summary to the matched contact. Updates an
 * existing pending record (matched by cloudtalkCallId) or inserts a new one,
 * and logs a "call" activity. Returns a small report; the caller persists doc.
 */
export function applyCallResult(
  doc: PersistDoc,
  data: CallWebhookData,
  summary: CallSummary | null
): ApplyCallReport {
  const contact = findContact(doc.state.contacts, data);
  if (!contact) return { matched: false };

  contact.calls ??= [];
  const existing = data.cloudtalkCallId
    ? contact.calls.find((r) => r.cloudtalkCallId === data.cloudtalkCallId)
    : undefined;

  const patch: Partial<CallRecord> = {
    cloudtalkCallId: data.cloudtalkCallId,
    durationSecs: data.durationSecs,
    recordingUrl: data.recordingUrl,
    transcript: data.transcript,
    summary: summary?.summary,
    takeaways: summary?.takeaways,
    sentiment: summary?.sentiment,
    status: "summarized",
  };

  let record: CallRecord;
  if (existing) {
    Object.assign(existing, patch);
    record = existing;
  } else {
    record = {
      id: uid(),
      direction: "outbound",
      startedAt: new Date().toISOString(),
      ...patch,
      status: "summarized",
    };
    contact.calls.unshift(record);
  }

  const note = summary?.summary
    ? `Call summary: ${summary.summary}`
    : "Call completed (transcript stored)";
  doc.state.activities.unshift(makeActivity(contact.id, note));

  return { matched: true, contactId: contact.id, contactName: fullName(contact), callId: record.id };
}

/**
 * Pull the fields we care about out of CloudTalk's webhook body, tolerating the
 * different shapes its Workflow Automations / call objects can send.
 */
export function parseWebhookBody(body: unknown): CallWebhookData {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = b[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return undefined;
  };
  const num = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = b[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && v.trim() && !isNaN(Number(v))) return Number(v);
    }
    return undefined;
  };
  return {
    cloudtalkCallId: str("call_uuid", "call_id", "callId", "uuid", "id"),
    calleeNumber: str("callee_number", "calleeNumber", "external_number", "public_external", "to", "number"),
    transcript: str("transcript", "transcription", "speech_to_text", "text"),
    recordingUrl: str("recording_url", "recordingUrl", "recording"),
    durationSecs: num("talking_time", "duration", "billsec", "call_duration"),
  };
}
