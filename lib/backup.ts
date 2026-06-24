"use client";

import { useCRM } from "./store";
import { Activity, Campaign, Contact, Meeting, Prospect } from "./types";

// JSON export / restore for the full CRM book. This is the user's safety net:
// a backup file they own, independent of the browser and the cloud DB, plus a
// way to put it back. The shape mirrors the store's `partialize`.

const APP = "EmilCRM";
const FORMAT = 2;

export interface BackupData {
  contacts: Contact[];
  meetings: Meeting[];
  activities: Activity[];
  prospects: Prospect[];
  campaigns: Campaign[];
}

interface BackupFile {
  app: string;
  format: number;
  exportedAt: string;
  data: BackupData;
}

function snapshot(): BackupData {
  const s = useCRM.getState();
  return {
    contacts: s.contacts,
    meetings: s.meetings,
    activities: s.activities,
    prospects: s.prospects,
    campaigns: s.campaigns,
  };
}

/** The full backup document as pretty-printed JSON. */
export function buildBackup(): string {
  const file: BackupFile = {
    app: APP,
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    data: snapshot(),
  };
  return JSON.stringify(file, null, 2);
}

/** Trigger a download of the backup as `emilcrm-backup-YYYY-MM-DD.json`. */
export function downloadBackup(): void {
  const blob = new Blob([buildBackup()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `emilcrm-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parse a backup file's text. Tolerates both the wrapped format (`{ data }`)
 * and a bare data object. Returns null if it isn't recognisably a CRM book.
 */
export function parseBackup(text: string): BackupData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const root = parsed as { data?: unknown } | null;
  const raw = (root && typeof root === "object" && "data" in root ? root.data : root) as
    | Partial<BackupData>
    | null;
  if (!raw || typeof raw !== "object") return null;
  // A real book has at least contacts or campaigns as arrays.
  if (!Array.isArray(raw.contacts) && !Array.isArray(raw.campaigns)) return null;
  return {
    contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
    meetings: Array.isArray(raw.meetings) ? raw.meetings : [],
    activities: Array.isArray(raw.activities) ? raw.activities : [],
    prospects: Array.isArray(raw.prospects) ? raw.prospects : [],
    campaigns: Array.isArray(raw.campaigns) ? raw.campaigns : [],
  };
}

/** Replace the entire book with the backup's contents (then persists). */
export function restoreBackup(data: BackupData): void {
  useCRM.setState({ ...data, initialized: true });
  // Guarantee a campaign exists and adopt any orphaned records.
  useCRM.getState().migrate();
}
