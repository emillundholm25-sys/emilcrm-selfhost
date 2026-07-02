// Server-only CloudTalk client: click-to-call + webhook auth helpers.
// Click-to-call rings the configured agent's phone first, then dials the
// callee. Auth is HTTP Basic with an API Access Key ID + Secret. Everything
// degrades gracefully when the keys aren't set (see cloudtalkEnabled()).

const BASE = process.env.CLOUDTALK_API_BASE || "https://my.cloudtalk.io/api";

/** Calling features are only available once the CloudTalk keys + agent are set. */
export function cloudtalkEnabled(): boolean {
  return !!(
    process.env.CLOUDTALK_ACCESS_KEY_ID &&
    process.env.CLOUDTALK_ACCESS_KEY_SECRET &&
    process.env.CLOUDTALK_AGENT_ID
  );
}

function basicAuth(): string {
  const id = process.env.CLOUDTALK_ACCESS_KEY_ID || "";
  const secret = process.env.CLOUDTALK_ACCESS_KEY_SECRET || "";
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export interface InitiateCallResult {
  ok: boolean;
  cloudtalkCallId?: string;
  status: number;
  error?: string;
}

/**
 * Place an outbound call: CloudTalk rings the agent first, then dials the
 * callee. Returns the CloudTalk call id when the response carries one.
 */
export async function initiateCall(calleeNumber: string): Promise<InitiateCallResult> {
  const res = await fetch(`${BASE}/calls/create.json`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: basicAuth() },
    body: JSON.stringify({
      agent_id: process.env.CLOUDTALK_AGENT_ID,
      callee_number: calleeNumber,
    }),
  });

  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON body — keep the raw text for error reporting */
  }

  if (!res.ok) {
    return { ok: false, status: res.status, error: text?.slice(0, 300) || `HTTP ${res.status}` };
  }

  // CloudTalk's response shape varies; pull a call id from the common spots.
  const d = (data ?? {}) as Record<string, unknown>;
  const callId =
    (d.call_uuid as string) ||
    (d.call_id as string) ||
    ((d.data as Record<string, unknown> | undefined)?.id as string) ||
    (d.id as string) ||
    undefined;

  return { ok: true, status: res.status, cloudtalkCallId: callId ? String(callId) : undefined };
}

/** Normalise a phone number to digits (keeping a leading +) for matching. */
export function normalizePhone(raw?: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}

/** Constant-time string compare (avoids leaking the secret via timing). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Verify the shared secret CloudTalk's Workflow Automation sends, accepted
 * either as `?token=` or an `x-webhook-token` / Bearer header. Returns true
 * only when CLOUDTALK_WEBHOOK_SECRET is set and matches.
 */
export function verifyWebhookSecret(req: Request): boolean {
  const expected = process.env.CLOUDTALK_WEBHOOK_SECRET;
  if (!expected) return false;
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token") || "";
  const header = req.headers.get("x-webhook-token") || req.headers.get("authorization") || "";
  const fromHeader = header.replace(/^Bearer\s+/i, "");
  return constantTimeEqual(fromQuery, expected) || constantTimeEqual(fromHeader, expected);
}
