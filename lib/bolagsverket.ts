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
// Contract verified against Bolagsverket's published OpenAPI (v1) AND the live
// API (Spotify/H&M/Volvo/Ericsson all resolve):
//   token: POST https://portal.api.bolagsverket.se/oauth2/token
//          grant_type=client_credentials, scope "vardefulla-datamangder:read"
//   data:  POST {API_BASE}/organisationer  { identitetsbeteckning: "<orgnr>" }
//          -> { organisationer: [ Organisation ] }
//   docs:  POST {API_BASE}/dokumentlista   { identitetsbeteckning: "<orgnr>" }
//          -> { dokument: [{ dokumentId, filformat, rapporteringsperiodTom }] }
//          GET  {API_BASE}/dokument/{id}    -> application/zip (single iXBRL .xhtml)
// Financials come only from *digitally-filed* annual reports — present for many
// smaller AB, absent for large/listed companies — so getFinancials() returns
// null when nothing is filed (callers degrade gracefully).

import { inflateRawSync } from "node:zlib";
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

// --- Financials from digitally-filed annual reports -----------------------
//
// /dokument returns a ZIP holding a single inline-XBRL (.xhtml) annual report.
// We extract it (no zip dependency — walk the ZIP central directory + inflate)
// and pull the headline facts from the Swedish taxonomy (se-gen-base). Values
// carry a `scale` (10^n) and optional `sign="-"`; each fact's contextRef maps
// to a fiscal-year end date, so we keep the fact from the latest period.

export interface CompanyFinancials {
  year?: string; // fiscal-year end, e.g. "2024-12-31"
  revenue?: number; // Nettoomsättning, SEK
  result?: number; // Årets resultat (net), SEK
  employees?: number; // Medelantalet anställda
}

/** Return the decompressed bytes of the first *.xhtml entry in a ZIP buffer. */
function unzipXhtml(buf: Buffer): string | null {
  // Locate the End Of Central Directory record (sig 0x06054b50), scanning back.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  let p = buf.readUInt32LE(eocd + 16); // central directory offset
  const count = buf.readUInt16LE(eocd + 10);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (/\.x?html?$/i.test(name)) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtra = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtra;
      const comp = buf.subarray(start, start + compSize);
      try {
        return (method === 0 ? comp : inflateRawSync(comp)).toString("utf8");
      } catch {
        return null;
      }
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Parse the headline financial facts out of an inline-XBRL annual report. */
export function parseAnnualReport(xhtml: string): CompanyFinancials {
  // context id -> period/instant end date
  const ctx: Record<string, string> = {};
  const cre = /<xbrli:context\b[^>]*\bid="([^"]+)"([\s\S]*?)<\/xbrli:context>/g;
  for (let m; (m = cre.exec(xhtml)); ) {
    const end = /<xbrli:(?:endDate|instant)>([\d-]+)</.exec(m[2]);
    if (end) ctx[m[1]] = end[1];
  }
  const latest = (localName: string): number | undefined => {
    const re = new RegExp(`<ix:nonFraction([^>]*name="[^"]*:${localName}"[^>]*)>([^<]*)</ix:nonFraction>`, "g");
    let best: { val: number; end: string } | undefined;
    for (let m; (m = re.exec(xhtml)); ) {
      const attrs = m[1];
      const raw = m[2].replace(/\s| /g, "").replace(",", ".");
      const val = parseFloat(raw);
      if (isNaN(val)) continue;
      const scale = parseInt(/scale="(-?\d+)"/.exec(attrs)?.[1] ?? "0", 10);
      const sign = /sign="-"/.test(attrs) ? -1 : 1;
      const end = ctx[/contextRef="([^"]+)"/.exec(attrs)?.[1] ?? ""] ?? "";
      const n = sign * val * Math.pow(10, scale);
      if (!best || end > best.end) best = { val: n, end };
    }
    return best?.val;
  };
  const revenue = latest("Nettoomsattning");
  const result = latest("AretsResultat");
  const employees = latest("MedelantaletAnstallda");
  // fiscal year = the latest end date among any context
  const year = Object.values(ctx).sort().pop();
  return {
    year,
    revenue,
    result,
    employees: employees != null ? Math.round(employees) : undefined,
  };
}

/**
 * Fetch headline financials (revenue, result, employees) for a company from its
 * latest digitally-filed annual report. Returns null when nothing is filed —
 * common for large/listed companies. Throws only on a hard API error.
 */
export async function getFinancials(orgnrInput: string): Promise<CompanyFinancials | null> {
  if (!bolagsverketEnabled()) return null;
  const orgnr = normalizeOrgnr(orgnrInput);
  if (!orgnr) return null;
  const token = await getToken();
  const list = await fetch(`${API_BASE}/dokumentlista`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ identitetsbeteckning: orgnr }),
  });
  if (!list.ok) return null;
  const docs = asArr((await list.json())?.dokument);
  if (!docs.length) return null;
  // newest by reporting period end
  const newest = docs
    .map(asObj)
    .filter((d) => str(d.dokumentId))
    .sort((a, b) => String(b.rapporteringsperiodTom ?? "").localeCompare(String(a.rapporteringsperiodTom ?? "")))[0];
  const id = newest && str(newest.dokumentId);
  if (!id) return null;
  const doc = await fetch(`${API_BASE}/dokument/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/zip" },
  });
  if (!doc.ok) return null;
  const xhtml = unzipXhtml(Buffer.from(await doc.arrayBuffer()));
  if (!xhtml) return null;
  const fin = parseAnnualReport(xhtml);
  return fin.revenue != null || fin.result != null || fin.employees != null ? fin : null;
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
