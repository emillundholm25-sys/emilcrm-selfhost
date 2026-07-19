import { NextResponse } from "next/server";
import { bolagsverketEnabled, getCompany, getFinancials, normalizeOrgnr, scoreCompanyFit } from "@/lib/bolagsverket";

// Public, read-only company lookup — the backend for the landing-page
// "Företagskoll / ICP-fit" lead magnet. Calls straight into lib/bolagsverket
// (the free official Swedish register). It returns only public registry data,
// carries no cookies/session, and self-limits by IP — so it is proxy-exempt
// (see proxy.ts) and CORS-open for the marketing site to fetch cross-origin.
//
//   GET /api/company-lookup?orgnr=556703-7485[&industries=a,b][&locations=x,y]
//     -> { ok, found, company?, fit? }

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // public registry data, no credentials
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

// Tiny per-IP limiter (in-memory, per serverless instance — a cold start
// resets it). Enough to blunt casual abuse of a public endpoint that fans out
// to a rate-limited upstream (Bolagsverket allows 60 req/min).
const HITS = new Map<string, { n: number; reset: number }>();
const LIMIT = 30;
const WINDOW_MS = 5 * 60_000;
function limited(ip: string): boolean {
  const now = Date.now();
  if (HITS.size > 1000) for (const [k, v] of HITS) if (v.reset < now) HITS.delete(k);
  let e = HITS.get(ip);
  if (!e || e.reset < now) {
    e = { n: 0, reset: now + WINDOW_MS };
    HITS.set(ip, e);
  }
  e.n += 1;
  return e.n > LIMIT;
}

const splitList = (s: string | null) =>
  (s || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  if (!bolagsverketEnabled()) {
    return json({ ok: false, error: "Företagsuppslag är inte aktiverat på denna instans." }, 503);
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (limited(ip)) {
    return json({ ok: false, error: "För många förfrågningar — försök igen om en stund." }, 429);
  }

  const url = new URL(req.url);
  const orgnr = normalizeOrgnr(url.searchParams.get("orgnr") || "");
  if (!orgnr) {
    return json({ ok: false, error: "Ange ett giltigt organisationsnummer (10 siffror)." }, 400);
  }

  const industries = splitList(url.searchParams.get("industries"));
  const locations = splitList(url.searchParams.get("locations"));
  const wantFinancials = /^(1|true|yes)$/i.test(url.searchParams.get("financials") || "");

  try {
    // Financials are an extra fetch (doc download + parse) — run it in parallel
    // and only when asked, so the base lookup and the landing tool stay fast.
    const [company, financials] = await Promise.all([
      getCompany(orgnr),
      wantFinancials ? getFinancials(orgnr).catch(() => null) : Promise.resolve(null),
    ]);
    if (!company) return json({ ok: true, found: false });
    const fit = industries.length || locations.length ? scoreCompanyFit(company, { industries, locations }) : undefined;
    return json({ ok: true, found: true, company, fit, financials: financials ?? undefined });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Uppslaget misslyckades." }, 502);
  }
}
