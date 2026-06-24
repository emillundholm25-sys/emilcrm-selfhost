// Quick directory-lookup links for finding phone numbers (especially Swedish HQ
// lines) when Apollo comes up empty — which is common, since Apollo only returns
// phone numbers when explicitly revealed, and often asynchronously.
//
// The app can't query these sites directly (CORS / no public API), but it can
// hand Claude-in-Chrome — or you — a ready search URL to open and read from.
// URL formats verified June 2026: hitta.se uses ?vad= with typ=ftg (company) /
// typ=prv (person); allabolag.se is a SPA with no stable deep-link, so we reach
// it via a scoped Google search.

export interface LookupLink {
  label: string;
  url: string;
  /** What you'll typically find there. */
  hint: string;
}

const q = (s: string) => encodeURIComponent(s.trim());

export function companyLookups(company?: string): LookupLink[] {
  if (!company?.trim()) return [];
  return [
    { label: "hitta.se", url: `https://www.hitta.se/sök?vad=${q(company)}&typ=ftg`, hint: "Swedish switchboard / HQ" },
    { label: "allabolag.se", url: `https://www.google.com/search?q=${q(`site:allabolag.se ${company}`)}`, hint: "Org registry + phone (via Google)" },
    { label: "Google", url: `https://www.google.com/search?q=${q(`${company} telefonnummer`)}`, hint: "Web fallback" },
  ];
}

export function personLookups(name: string, location?: string): LookupLink[] {
  if (!name.trim()) return [];
  const term = [name, location].filter(Boolean).join(" ");
  return [
    { label: "hitta.se", url: `https://www.hitta.se/sök?vad=${q(term)}&typ=prv`, hint: "Personal / mobile number" },
    { label: "Google", url: `https://www.google.com/search?q=${q(`${term} telefon`)}`, hint: "Web fallback" },
  ];
}
