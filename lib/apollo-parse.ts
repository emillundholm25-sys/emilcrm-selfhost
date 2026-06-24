// Parse enrichment data (Apollo person JSON, LinkedIn exports, or loose
// "Key: value" text) into the fields EmilCRM needs. Deliberately forgiving —
// it's fed by Claude-in-Chrome scraping a prospect, so shapes vary.

import { dedupePhones } from "./utils";

export interface ParsedProspect {
  firstName: string;
  lastName: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string; // primary (= phones[0])
  phones?: string[]; // all direct / mobile numbers
  hqPhone?: string; // company / HQ main line
  industry?: string;
  companySize?: string;
  location?: string;
  linkedinUrl?: string;
  tags: string[];
}

function employeesToBand(n?: number): string | undefined {
  if (!n || Number.isNaN(n)) return undefined;
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 1000) return "201-1000";
  return "1000+";
}

function splitName(full?: string): { firstName: string; lastName: string } {
  if (!full) return { firstName: "", lastName: "" };
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

/** Pull a contact out of an Apollo-shaped object (handles a few nesting variants). */
function fromObject(root: Record<string, unknown>): ParsedProspect {
  const person =
    (root.person as Record<string, unknown>) ||
    (root.contact as Record<string, unknown>) ||
    root;
  const org =
    (person.organization as Record<string, unknown>) ||
    (person.account as Record<string, unknown>) ||
    (root.organization as Record<string, unknown>) ||
    {};

  let firstName = firstString(person.first_name, person.firstName) ?? "";
  let lastName = firstString(person.last_name, person.lastName) ?? "";
  if (!firstName && !lastName) {
    const split = splitName(firstString(person.name, root.name));
    firstName = split.firstName;
    lastName = split.lastName;
  }

  // Phones: collect EVERY personal/direct/mobile number Apollo returns.
  // Apollo phone_numbers is [{ raw_number, sanitized_number, type }] — but only
  // when revealed, and revealed numbers often land on a nested `contact` object.
  // Items can also come through as plain strings, so handle both shapes.
  const contact = person.contact as Record<string, unknown> | undefined;
  const collected: Array<string | undefined> = [
    firstString(person.phone, person.mobile_phone, person.phone_number, person.direct_phone),
    firstString(contact?.phone, contact?.mobile_phone),
  ];
  const pushFromArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const pn of arr) {
      if (typeof pn === "string") collected.push(pn);
      else if (pn && typeof pn === "object") {
        const o = pn as Record<string, unknown>;
        collected.push(firstString(o.sanitized_number, o.raw_number, o.number));
      }
    }
  };
  pushFromArray(person.phone_numbers);
  pushFromArray(contact?.phone_numbers);
  pushFromArray(root.phone_numbers);
  const phones = dedupePhones(collected);
  const phone = phones[0];

  // HQ / switchboard from the organization.
  const orgPrimary = org.primary_phone as Record<string, unknown> | undefined;
  const hqPhone = firstString(
    org.phone,
    org.sanitized_phone,
    org.phone_number,
    orgPrimary?.number,
    orgPrimary?.sanitized_number
  );

  // Location from city / state / country
  const city = firstString(person.city, root.city, org.city);
  const country = firstString(person.country, root.country, org.country);
  const region = firstString(person.state, root.state, org.state);
  const location = [city, country || region].filter(Boolean).join(", ") || undefined;

  const employees = Number(
    firstString(org.estimated_num_employees, org.employee_count, root.estimated_num_employees)
  );

  const industry = firstString(org.industry, person.industry, root.industry);

  return {
    firstName,
    lastName,
    company: firstString(org.name, person.organization_name, person.company, root.company),
    title: firstString(person.title, person.headline, root.title),
    email: firstString(person.email, root.email),
    phone,
    phones,
    hqPhone,
    industry,
    companySize: employeesToBand(employees),
    location,
    linkedinUrl: firstString(person.linkedin_url, person.linkedinUrl, root.linkedin_url, root.linkedinUrl),
    tags: industry ? [industry] : [],
  };
}

/** Parse "Key: value" lines (e.g. copied from a LinkedIn profile). Keeps all
 * values per key, so multiple phone lines are all captured. */
function fromText(input: string): ParsedProspect {
  const map = new Map<string, string[]>();
  for (const line of input.split(/\n+/)) {
    const m = line.match(/^\s*([A-Za-z åäöÅÄÖ]+?)\s*[:=]\s*(.+?)\s*$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      (map.get(key) ?? map.set(key, []).get(key)!).push(m[2].trim());
    }
  }
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = map.get(k);
      if (v?.length) return v[0];
    }
    return undefined;
  };
  const getAll = (...keys: string[]) => {
    const out: string[] = [];
    for (const k of keys) for (const v of map.get(k) ?? []) out.push(...v.split(/[;,/]| or /i));
    return out;
  };

  let firstName = get("first name", "firstname") ?? "";
  let lastName = get("last name", "lastname") ?? "";
  if (!firstName && !lastName) {
    const split = splitName(get("name", "full name"));
    firstName = split.firstName;
    lastName = split.lastName;
  }
  const industry = get("industry");
  const employees = Number(get("employees", "company size", "headcount")?.replace(/[^\d]/g, ""));
  const phones = dedupePhones(
    getAll("phone", "mobile", "tel", "cell", "direct", "telefon", "mobil", "phone numbers")
  );
  return {
    firstName,
    lastName,
    company: get("company", "organization", "current company"),
    title: get("title", "role", "position", "headline"),
    email: get("email", "e-mail"),
    phone: phones[0],
    phones,
    hqPhone: get("hq", "hq phone", "company phone", "switchboard", "headquarters", "main line", "växel"),
    industry,
    companySize: get("company size") ?? employeesToBand(employees),
    location: get("location", "city"),
    linkedinUrl: get("linkedin", "linkedin url", "profile"),
    tags: industry ? [industry] : [],
  };
}

/**
 * Best-effort parse of a LinkedIn profile/company URL into a stub. The URL
 * carries no contact data, so this only seeds a name/company + the URL; full
 * enrichment (phones, email, title) comes from Apollo / Claude-in-Chrome.
 */
export function parseLinkedInUrl(input: string): ParsedProspect | null {
  const trimmed = input.trim();
  const m = trimmed.match(/linkedin\.com\/(in|company|pub|school)\/([^/?#]+)/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const slug = decodeURIComponent(m[2]).replace(/\/$/, "");
  const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  const titleCase = (s: string) =>
    s
      .split(/[-_]/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ")
      .trim();

  if (kind === "in" || kind === "pub") {
    // Keep leading alphabetic segments; LinkedIn appends a hash id (has digits).
    const parts = slug.split("-");
    const nameParts: string[] = [];
    for (const p of parts) {
      if (/\d/.test(p) || p.length > 20) break;
      nameParts.push(p);
    }
    const name = titleCase((nameParts.length ? nameParts : parts.slice(0, 2)).join("-"));
    const split = splitName(name);
    return { firstName: split.firstName, lastName: split.lastName, linkedinUrl: url, tags: [] };
  }
  // company / school
  return { firstName: "", lastName: "", company: titleCase(slug), linkedinUrl: url, tags: [] };
}

export function parseEnrichment(input: string): ParsedProspect | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      const result = fromObject(obj as Record<string, unknown>);
      if (result.firstName || result.lastName || result.company) return result;
    }
  } catch {
    // not JSON — fall through to text parsing
  }
  const text = fromText(trimmed);
  if (text.firstName || text.lastName || text.company) return text;
  return null;
}
