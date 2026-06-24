"use client";

import { StateStorage } from "zustand/middleware";
import { SyncStatus, useSync } from "./sync-store";

// Zustand persist adapter backed by the server (/api/state), with a localStorage
// mirror for offline resilience. Server is the source of truth across devices;
// if it's unreachable (or the DB isn't provisioned yet) the app transparently
// falls back to the local mirror — so it always works and never loses the last edit.
// Every read/write also reports a sync status (see lib/sync-store) so a failed
// write is visible in the UI rather than silently swallowed.

const RETRY_MS = 4000;

let pending: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const setStatus = (s: SyncStatus) => useSync.getState().setStatus(s);

// A write failed but the server may just be briefly unreachable. Keep the edit
// queued (unless a newer one already superseded it) and retry on a timer, so a
// transient blip recovers on its own instead of getting stuck "Not synced".
function requeue(value: string) {
  setStatus("error");
  if (pending == null) pending = value;
  if (!retryTimer) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      flush();
    }, RETRY_MS);
  }
}

async function flush() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const value = pending;
  pending = null;
  timer = null;
  if (value == null) return;
  setStatus("saving");
  try {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: value,
      keepalive: true,
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.configured === false) {
      // No cloud DB provisioned — the local mirror is the system of record.
      setStatus("local");
      return;
    }
    if (res.ok && json?.ok !== false) {
      setStatus("saved");
      return;
    }
    // Reachable but the write was rejected (e.g. 401 / 500) — retry.
    requeue(value);
  } catch {
    // Offline / unreachable — the local mirror already holds it; retry shortly.
    requeue(value);
  }
}

export const serverStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json?.configured === false) {
          // `error` set means a real DB read failure; otherwise just no DB.
          setStatus(json?.error ? "error" : "local");
        } else {
          setStatus("saved");
        }
        if (json && json.data != null) {
          try {
            localStorage.setItem(name, json.data);
          } catch {}
          return json.data as string;
        }
      } else {
        setStatus("error");
      }
    } catch {
      // Couldn't reach the server — fall through to the local mirror.
      setStatus("error");
    }
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },

  setItem: async (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {}
    pending = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 800);
  },

  removeItem: async (name) => {
    try {
      localStorage.removeItem(name);
    } catch {}
    try {
      await fetch("/api/state", { method: "DELETE" });
    } catch {}
  },
};
