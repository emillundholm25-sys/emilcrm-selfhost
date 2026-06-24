import { CampaignICP, Contact, ICPFacet, ICPProfile, Prospect, ProspectScore, Stage } from "./types";

/**
 * How strongly each pipeline stage informs the ICP. Contacts that converted
 * (won / met / booked) describe the ideal customer far better than cold ones,
 * and lost deals are excluded.
 */
const STAGE_QUALITY: Record<Stage, number> = {
  to_contact: 0.4,
  contacted: 0.8,
  scheduling: 1.4,
  booked: 2.0,
  met: 2.4,
  follow_up: 2.2,
  won: 3.2,
  lost: 0,
};

const TITLE_STOPWORDS = new Set([
  "of",
  "the",
  "and",
  "for",
  "to",
  "at",
  "in",
  "&",
  "a",
  "an",
]);

export function titleKeywords(title?: string): string[] {
  if (!title) return [];
  return title
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !TITLE_STOPWORDS.has(w));
}

function topFacets(map: Map<string, number>, counts: Map<string, number>, limit: number): ICPFacet[] {
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
  return Array.from(map.entries())
    .map(([value, w]) => ({ value, weight: w / total, count: counts.get(value) ?? 0 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

export function computeICP(contacts: Contact[]): ICPProfile {
  const industries = new Map<string, number>();
  const industryCounts = new Map<string, number>();
  const sizes = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  const titles = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  const locations = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const tags = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  let valueSum = 0;
  let valueWeight = 0;
  let sampleSize = 0;

  const add = (m: Map<string, number>, c: Map<string, number>, key: string | undefined, w: number) => {
    if (!key) return;
    m.set(key, (m.get(key) ?? 0) + w);
    c.set(key, (c.get(key) ?? 0) + 1);
  };

  for (const contact of contacts) {
    const w = STAGE_QUALITY[contact.stage];
    if (w <= 0) continue;
    sampleSize += 1;
    add(industries, industryCounts, contact.industry, w);
    add(sizes, sizeCounts, contact.companySize, w);
    add(locations, locationCounts, contact.location, w);
    for (const kw of titleKeywords(contact.title)) add(titles, titleCounts, kw, w);
    for (const tag of contact.tags) add(tags, tagCounts, tag, w);
    if (contact.value) {
      valueSum += contact.value * w;
      valueWeight += w;
    }
  }

  return {
    industries: topFacets(industries, industryCounts, 4),
    companySizes: topFacets(sizes, sizeCounts, 3),
    titleKeywords: topFacets(titles, titleCounts, 6),
    locations: topFacets(locations, locationCounts, 4),
    tags: topFacets(tags, tagCounts, 5),
    avgValue: valueWeight ? Math.round(valueSum / valueWeight) : 0,
    sampleSize,
  };
}

/** Turn an ordered list of values into descending-weight facets. */
function listToFacets(values: string[]): ICPFacet[] {
  const n = values.length || 1;
  return values.filter(Boolean).map((value, i) => ({ value, weight: (n - i) / n, count: 0 }));
}

/** Build a scoring profile from a campaign's *defined* target ICP. */
export function campaignICPToProfile(icp: CampaignICP): ICPProfile {
  const titleToks = Array.from(new Set(icp.titles.flatMap((t) => titleKeywords(t))));
  return {
    industries: listToFacets(icp.industries),
    companySizes: listToFacets(icp.companySizes),
    titleKeywords: listToFacets(titleToks),
    locations: listToFacets(icp.locations),
    tags: [],
    avgValue: 0,
    sampleSize: 0,
  };
}

const DIMENSION_MAX = {
  industry: 35,
  title: 20,
  size: 15,
  location: 15,
  tags: 15,
};

/** Best contribution for matching a single value against a list of facets. */
function facetContribution(value: string | undefined, facets: ICPFacet[], max: number): number {
  if (!value || facets.length === 0) return 0;
  const facet = facets.find((f) => f.value.toLowerCase() === value.toLowerCase());
  if (!facet) return 0;
  const topWeight = facets[0].weight || 1;
  return max * Math.min(1, facet.weight / topWeight);
}

export function scoreProspect(prospect: Prospect, icp: ICPProfile): ProspectScore {
  const reasons: string[] = [];
  let score = 0;

  const ind = facetContribution(prospect.industry, icp.industries, DIMENSION_MAX.industry);
  if (ind > 0) {
    score += ind;
    const rank = icp.industries.findIndex((f) => f.value.toLowerCase() === prospect.industry!.toLowerCase());
    reasons.push(rank === 0 ? `${prospect.industry} — your #1 industry` : `${prospect.industry} matches your ICP`);
  }

  const size = facetContribution(prospect.companySize, icp.companySizes, DIMENSION_MAX.size);
  if (size > 0) {
    score += size;
    reasons.push(`Company size fits (${prospect.companySize})`);
  }

  const loc = facetContribution(prospect.location, icp.locations, DIMENSION_MAX.location);
  if (loc > 0) {
    score += loc;
    reasons.push(`In your core region (${prospect.location})`);
  }

  // Title: reward the single best-matching keyword.
  const kws = titleKeywords(prospect.title);
  let bestTitle = 0;
  let bestKw = "";
  for (const kw of kws) {
    const c = facetContribution(kw, icp.titleKeywords, DIMENSION_MAX.title);
    if (c > bestTitle) {
      bestTitle = c;
      bestKw = kw;
    }
  }
  if (bestTitle > 0) {
    score += bestTitle;
    reasons.push(`Similar role (${bestKw})`);
  }

  // Tags: reward the best-matching tag.
  let bestTag = 0;
  let bestTagName = "";
  for (const tag of prospect.tags) {
    const c = facetContribution(tag, icp.tags, DIMENSION_MAX.tags);
    if (c > bestTag) {
      bestTag = c;
      bestTagName = tag;
    }
  }
  if (bestTag > 0) {
    score += bestTag;
    reasons.push(`Tagged ${bestTagName}`);
  }

  return { score: Math.round(Math.min(100, score)), reasons };
}

export interface SearchRecipe {
  industries: string[];
  sizes: string[];
  locations: string[];
  titles: string[];
  /** Whether the ICP has enough signal to build a useful search. */
  hasSignal: boolean;
  /** LinkedIn people-search deep link (keyword approximation). */
  linkedinUrl: string;
  /** Apollo People Search page (filters applied there / via Claude-in-Chrome). */
  apolloUrl: string;
  /** Plain-text filter spec for copy/paste. */
  copyText: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Turns the derived ICP into a concrete search to run in Apollo / LinkedIn —
 * the part the app can honestly do. Actual discovery happens there (and the
 * results come back via Import or window.emilCRM.addProspect).
 */
export function buildSearchRecipe(icp: ICPProfile): SearchRecipe {
  const industries = icp.industries.slice(0, 3).map((f) => f.value);
  const sizes = icp.companySizes.slice(0, 2).map((f) => f.value);
  const locations = icp.locations.slice(0, 2).map((f) => f.value);
  const titles = icp.titleKeywords.slice(0, 4).map((f) => cap(f.value));

  const keywords = [industries[0], titles.slice(0, 2).join(" "), locations[0]]
    .filter(Boolean)
    .join(" ");
  const linkedinUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;

  const copyText = [
    industries.length && `Industry: ${industries.join(", ")}`,
    sizes.length && `Company size: ${sizes.join(", ")} employees`,
    locations.length && `Location: ${locations.join("; ")}`,
    titles.length && `Titles: ${titles.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    industries,
    sizes,
    locations,
    titles,
    hasSignal: industries.length > 0 || titles.length > 0,
    linkedinUrl,
    apolloUrl: "https://app.apollo.io/#/people",
    copyText,
  };
}
