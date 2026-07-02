// Minimal password-gate auth: a single shared password (APP_PASSWORD) unlocks a
// signed, httpOnly session cookie. No accounts, no DB — right-sized for a solo
// tool. Edge-safe (Web Crypto only) so it works in proxy.ts and route handlers.

export const COOKIE_NAME = "emilcrm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (seconds)

/** Auth is only enforced once both secrets exist — keeps the app open until then. */
export function authEnabled(): boolean {
  return !!(process.env.APP_PASSWORD && process.env.AUTH_SECRET);
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToString(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Create a signed session token (payload.signature). */
export async function createSession(): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE * 1000 })));
  const sig = await hmac(payload, process.env.AUTH_SECRET!);
  return `${payload}.${sig}`;
}

/** Verify a session token's signature and expiry. */
export async function verifySession(token?: string | null): Promise<boolean> {
  if (!token || !process.env.AUTH_SECRET) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await hmac(payload, process.env.AUTH_SECRET);
  if (!timingSafeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(b64urlToString(payload));
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

/** Constant-time check of a submitted password against APP_PASSWORD. */
export function checkPassword(input: string): boolean {
  const pw = process.env.APP_PASSWORD || "";
  return pw.length > 0 && timingSafeEqual(input, pw);
}

/**
 * Strict gate for endpoints that spend money (LLM calls, telephony): requires
 * auth to be CONFIGURED and the request to carry a valid session. Unlike the
 * open-until-configured reads, these stay off on an unauthenticated deploy —
 * otherwise anyone who finds the URL could burn the owner's API credits.
 */
export async function requireSession(req: Request): Promise<boolean> {
  if (!authEnabled()) return false;
  return verifySession(tokenFromCookieHeader(req.headers.get("cookie")));
}

/** Read the session token from a raw Cookie header (route handlers). */
export function tokenFromCookieHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : undefined;
}
