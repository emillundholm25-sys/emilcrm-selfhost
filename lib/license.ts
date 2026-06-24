// Optional license gate for the sold / self-hosted product. Dormant by default:
// only enforced when REQUIRE_LICENSE is set, so the owner's own instance and a
// fresh clone are never locked out (same graceful philosophy as the auth gate).
// Validates a Lemon Squeezy license key (their validate endpoint needs no API
// secret — just the key), caches the result, and FAILS OPEN if the license
// server is unreachable so a paying user is never bricked by an outage.

import { readLicenseKey } from "./db";

const LS_VALIDATE = "https://api.lemonsqueezy.com/v1/licenses/validate";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export interface LicenseStatus {
  required: boolean;
  valid: boolean;
  /** active | inactive | expired | disabled | missing | unverified | open | invalid */
  status: string;
  message: string;
  expiresAt?: string | null;
}

export function licenseRequired(): boolean {
  const v = process.env.REQUIRE_LICENSE;
  return !!v && v !== "0" && v.toLowerCase() !== "false";
}

let cache: { key: string; result: LicenseStatus; ts: number } | null = null;

function graceful(status: string, message: string): LicenseStatus {
  // Reachability/parse failure → allow (don't brick a paying user on an outage).
  return { required: licenseRequired(), valid: true, status, message };
}

export async function validateKey(key: string): Promise<LicenseStatus> {
  const trimmed = key.trim();
  if (!trimmed) {
    return { required: licenseRequired(), valid: false, status: "missing", message: "No license key set." };
  }
  try {
    const res = await fetch(LS_VALIDATE, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ license_key: trimmed }).toString(),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { valid?: boolean; error?: string; license_key?: { status?: string; expires_at?: string | null } }
      | null;
    if (!json) return graceful("unverified", "Couldn't read the license server response — allowed for now.");
    const status = json.license_key?.status ?? (json.valid ? "active" : "invalid");
    const valid = !!json.valid && status === "active";
    return {
      required: licenseRequired(),
      valid,
      status,
      message: valid ? "License active." : json.error || `License ${status}.`,
      expiresAt: json.license_key?.expires_at ?? null,
    };
  } catch {
    return graceful("unverified", "Couldn't reach the license server — allowed for now.");
  }
}

/** The active key: explicit env LICENSE_KEY wins, else the one activated in-app (DB). */
async function activeKey(): Promise<string> {
  if (process.env.LICENSE_KEY) return process.env.LICENSE_KEY;
  try {
    return (await readLicenseKey()) || "";
  } catch {
    return "";
  }
}

export async function licenseStatus(): Promise<LicenseStatus> {
  if (!licenseRequired()) {
    return { required: false, valid: true, status: "open", message: "License not required." };
  }
  const key = await activeKey();
  if (!key) {
    return { required: true, valid: false, status: "missing", message: "Enter your license key to activate." };
  }
  if (cache && cache.key === key && Date.now() - cache.ts < CACHE_TTL_MS) return cache.result;
  const result = await validateKey(key);
  cache = { key, result, ts: Date.now() };
  return result;
}

export function clearLicenseCache(): void {
  cache = null;
}
