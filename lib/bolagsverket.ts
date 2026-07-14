// Server-only client for Bolagsverket's "Värdefulla datamängder" API — the
// Swedish company register, made free (no fee, no agreement) under the EU
// high-value-datasets directive since Feb 2025. Given an organisationsnummer we
// fetch official firmographics (name, SNI industry, address, legal form,
// business description, active status) and score a company against an ICP.
//
// This is the Swedish-data wedge: real registry firmographics Apollo lacks for
// the Nordics, at ~zero data cost. It powers the in-app `emilcrm_enrich_company`
// MCP tool and the public "Företagskoll / ICP-fit" lookup on the landing.
//
// Auth is OAuth2 client-credentials: POST client_id/secret (HTTP Basic) to the
// token endpoint, then Bearer the access token on data calls. Everything
// degrades gracefully when the credentials aren't set (see bolagsverketEnabled)
// — exactly like llm/cloudtalk/license — so a deploy without them never breaks.
//
// Contract verified against Bolagsverket's published OpenAPI (v1):
//   token: POST https://portal.api.bolagsverket.se/oauth2/token
//          grant_type=client_credentials, scope "vardefulla-datamangder:read"
//   data:  POST {API_BASE}/organisationer  { identitetsbeteckning: "<orgnr>" }
//          -> { organisationer: [ Organisation ] }
// NOTE: response field-mapping below matches that spec but has NOT yet been
// exercised against a live response (credentials require a one-time kundanmälan
// at bolagsverket.se). The parser is deliberately forgiving; verify field names
// against the first real payload and tighten if needed.

import { CampaignICP } from "./types";

const TOKEN_URL =
  process.env.BOLAGSVERKET_TOKEN_URL ||
  "https://portal.api.bolagsverket.se/oauth2/token";
const API_BASE =
  process.env.BOLAGSVERKET_API_BASE ||
  "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1";
const SCOPE = "vardefulla-datamangder:read";

/** Enrichment is only available once Bolagsverket API credentials are set. */
export function bolagsverketEnabled(): boolean {
  return !!(process.env.BOLAGSVERKET_CLIENT_ID && process.env.BOLAGSVERKET_CLIENT_SECRET);
}

/** Normalised firmographics we extract from an Organisation record. */
export interface CompanyFirmographics {
  orgnr: string;
  name: string;
  legalForm?: string; // e.g. "Aktiebolag"
  sni: { code: string; text: string }[]; // SNI industry codes + descriptions
  industry?: string; // primary SNI description, for ICP matching
  city?: string; // postort
  postalCode?: string;
  street?: string;
  description?: string; // verksamhetsbeskrivning
  active?: boolean; // registered + not struck off
  registeredAt?: string; // yyyy-mm-dd
}

// --- OAuth2 token (cached in-process, refreshed a minute before expiry) ---

let cachedToken: { token: string; expiresAt: number } | null = null;
const REFRESH_MARGIN_MS = 60_000;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - REFRESH_MARGIN_MS) {
    return cachedToken.token;
  }
  const id = process.env.BOLAGSVERKET_CLIENT_ID!;
  const secret = process.env.BOLAGSVERKET_CLIENT_SECRET!;
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Bolagsverket token request failed (${res.status}). Check BOLAGSVERKET_CLIENT_ID/SECRET. ${body.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Bolagsverket token response had no access_token.");
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/** Strip formatting; a Swedish org-nr is 10 digits (accepts the 12-digit form). */
export function normalizeOrgnr(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("16")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}

// --- Defensive readers for the nested Organisation shape ---

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

function normalize(org: Obj): CompanyFirmographics {
  const ident = asObj(org.organisationsidentitet);
  const orgnr = str(ident.identitetsbeteckning) ?? "";

  const nameList = asArr(asObj(org.organisationsnamn).organisationsnamnLista);
  const name = str(asObj(nameList[0]).namn) ?? "";

  const sni = asArr(asObj(org.naringsgrenOrganisation).sni)
    .map((s) => {
      const o = asObj(s);
      return { code: str(o.kod) ?? "", text: str(o.klartext) ?? "" };
    })
    .filter((s) => s.code || s.text);

  const post = asObj(asObj(org.postadressOrganisation).postadress);
  const verksam = str(asObj(org.verksamOrganisation).kod); // "Ja" / "Nej"

  return {
    orgnr,
    name,
    legalForm: str(asObj(org.juridiskForm).klartext),
    sni,
    industry: sni[0]?.text || undefined,
    city: str(post.postort),
    postalCode: str(post.postnummer),
    street: str(post.utdelningsadress),
    description: str(asObj(org.verksamhetsbeskrivning).beskrivning),
    active: verksam ? /ja/i.test(verksam) : undefined,
    registeredAt: str(asObj(org.organisationsdatum).registreringsdatum),
  };
}

/**
 * Look up a company by organisationsnummer. Returns null when the register has
 * no match. Throws (with a friendly message) when not configured or on an API
 * error — callers surface that to the user.
 */
export async function getCompany(orgnrInput: string): Promise<CompanyFirmographics | null> {
  if (!bolagsverketEnabled()) {
    throw new Error(
      "Bolagsverket-uppslag är inte aktiverat. Sätt BOLAGSVERKET_CLIENT_ID och BOLAGSVERKET_CLIENT_SECRET.",
    );
  }
  const orgnr = normalizeOrgnr(orgnrInput);
  if (!orgnr) throw new Error(`Ogiltigt organisationsnummer: "${orgnrInput}" (ska vara 10 siffror).`);

  const token = await getToken();
  const res = await fetch(`${API_BASE}/organisationer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ identitetsbeteckning: orgnr }),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bolagsverket API-fel (${res.status}). ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { organisationer?: unknown[] };
  const org = asArr(data.organisationer)[0];
  if (!org) return null;
  const company = normalize(asObj(org));
  return company.orgnr || company.name ? company : null;
}

// --- ICP-fit scoring ------------------------------------------------------
//
// The free register gives us industry (SNI) + location cleanly; revenue/size
// come from the annual-report documents (a v2). So we score on the two signals
// we actually have, weighted to sum to 100 so the number stays interpretable.

export interface CompanyFit {
  score: number; // 0–100 (undefined ICP → 0 with no reasons)
  reasons: string[];
}

const FIT_WEIGHTS = { industry: 70, location: 30 };

/** Best-effort, case-insensitive containment either direction. */
function loosely(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

/**
 * Score a company against an ICP's industries + locations. Industry matches SNI
 * descriptions loosely (the register speaks Swedish SNI text, the ICP speaks
 * the user's own words), location matches the postort. Returns 0 with no
 * reasons when the ICP has no industry/location signal.
 */
export function scoreCompanyFit(
  c: CompanyFirmographics,
  icp: Pick<CampaignICP, "industries" | "locations">,
): CompanyFit {
  const reasons: string[] = [];
  let score = 0;

  const industries = (icp.industries ?? []).filter(Boolean);
  if (industries.length && c.sni.length) {
    const hit = c.sni.find((s) => industries.some((ind) => loosely(s.text, ind) || s.code.startsWith(ind)));
    if (hit) {
      score += FIT_WEIGHTS.industry;
      reasons.push(`Bransch matchar din ICP: ${hit.text || hit.code}`);
    }
  }

  const locations = (icp.locations ?? []).filter(Boolean);
  if (locations.length && c.city) {
    if (locations.some((loc) => loosely(c.city!, loc))) {
      score += FIT_WEIGHTS.location;
      reasons.push(`Ligger i din målregion: ${c.city}`);
    }
  }

  return { score: Math.round(Math.min(100, score)), reasons };
}
