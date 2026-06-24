// Server-side persistence on Neon Postgres. The app is single-user, so the
// whole CRM state is stored as one JSONB document — simple, fast at this scale,
// and easy to normalise later if multi-user/reporting is ever needed.

import { neon } from "@neondatabase/serverless";

const CONNECTION = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export function dbConfigured(): boolean {
  return !!CONNECTION;
}

function sql() {
  if (!CONNECTION) throw new Error("DATABASE_URL is not set");
  return neon(CONNECTION);
}

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS app_state (
    id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  tableReady = true;
}

/** Returns the persisted state blob as a JSON string, or null if none yet. */
export async function readState(): Promise<string | null> {
  await ensureTable();
  const q = sql();
  const rows = (await q`SELECT data FROM app_state WHERE id = 'singleton'`) as Array<{ data: unknown }>;
  return rows[0] ? JSON.stringify(rows[0].data) : null;
}

/** Upserts the state blob (a JSON string). */
export async function writeState(json: string): Promise<void> {
  await ensureTable();
  const q = sql();
  await q`INSERT INTO app_state (id, data, updated_at)
          VALUES ('singleton', ${json}::jsonb, now())
          ON CONFLICT (id) DO UPDATE SET data = ${json}::jsonb, updated_at = now()`;
}

export async function clearState(): Promise<void> {
  await ensureTable();
  const q = sql();
  await q`DELETE FROM app_state WHERE id = 'singleton'`;
}

// --- License key storage (for in-app activation; see lib/license.ts) ---
let licenseTableReady = false;
async function ensureLicenseTable() {
  if (licenseTableReady) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS app_license (
    id text PRIMARY KEY,
    license_key text,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  licenseTableReady = true;
}

export async function readLicenseKey(): Promise<string | null> {
  if (!dbConfigured()) return null;
  await ensureLicenseTable();
  const q = sql();
  const rows = (await q`SELECT license_key FROM app_license WHERE id = 'singleton'`) as Array<{
    license_key: string | null;
  }>;
  return rows[0]?.license_key ?? null;
}

export async function writeLicenseKey(key: string): Promise<void> {
  await ensureLicenseTable();
  const q = sql();
  await q`INSERT INTO app_license (id, license_key, updated_at)
          VALUES ('singleton', ${key}, now())
          ON CONFLICT (id) DO UPDATE SET license_key = ${key}, updated_at = now()`;
}
