"use client";

import { create } from "zustand";

// Tracks whether the latest local edit has made it to the server (Neon Postgres).
// `server-storage.ts` drives this on every read/write so the UI can show an
// honest "Saved / Saving… / Not synced" state instead of silently swallowing
// a failed write.
//
//   saving  — a PUT to /api/state is in flight
//   saved   — the cloud DB acknowledged the write (or load) — fully synced
//   error   — server unreachable or rejected; the local mirror holds the edit,
//             and the adapter is retrying
//   local   — no cloud DB configured; this browser is the system of record
export type SyncStatus = "idle" | "saving" | "saved" | "error" | "local";

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  setStatus: (status: SyncStatus) => void;
}

export const useSync = create<SyncState>((set) => ({
  status: "idle",
  lastSyncedAt: null,
  setStatus: (status) =>
    set((s) => ({
      status,
      lastSyncedAt: status === "saved" ? Date.now() : s.lastSyncedAt,
    })),
}));
