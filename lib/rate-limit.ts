// Lightweight in-memory login throttle for the single-password gate.
//
// Caveat: state lives in the serverless instance's memory, so it resets on a
// cold start and isn't shared across instances. For a single-user self-host
// app that's an acceptable, dependency-free defense — it stops a sustained
// brute-force from one source against one box, which is the realistic threat.

interface Entry {
  fails: number;
  windowStart: number;
  lockedUntil: number;
}

const store = new Map<string, Entry>();

const MAX_FAILS = 8; // failures within the window before a lockout
const WINDOW_MS = 15 * 60_000; // 15 min rolling window
const LOCK_MS = 15 * 60_000; // 15 min lockout once tripped

/** Seconds remaining on a lockout for this key, or 0 if not locked. */
export function loginLockoutRemaining(key: string): number {
  const e = store.get(key);
  if (e && e.lockedUntil > Date.now()) return Math.ceil((e.lockedUntil - Date.now()) / 1000);
  return 0;
}

/** Record a failed attempt; locks the key out once MAX_FAILS is hit in-window. */
export function recordLoginFailure(key: string): void {
  const now = Date.now();
  if (store.size > 500) sweep(now); // keep the map bounded
  let e = store.get(key);
  if (!e || now - e.windowStart > WINDOW_MS) e = { fails: 0, windowStart: now, lockedUntil: 0 };
  e.fails += 1;
  if (e.fails >= MAX_FAILS) e.lockedUntil = now + LOCK_MS;
  store.set(key, e);
}

/** Clear a key's record after a successful login. */
export function clearLoginAttempts(key: string): void {
  store.delete(key);
}

function sweep(now: number): void {
  for (const [k, e] of store) {
    if (e.lockedUntil < now && now - e.windowStart > WINDOW_MS) store.delete(k);
  }
}
