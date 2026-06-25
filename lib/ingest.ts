// Server-side ingest: lets an external agent (the Cowork prospecting plugin)
// read a campaign's ICP and write enriched people into the CRM, without a
// browser. Reuses the SAME pure parsing/scoring the client uses, then merges
// into the single Neon JSONB document.
//
// The document is exactly what Zustand's persist writes: { state, version }.
// We only ever mutate `state`; `version` is preserved so the client rehydrates
// cleanly.

import { parseEnrichment } from "./apollo-parse";
import { buildSearchRecipe, campaignICPToProfile, computeICP } from "./icp";
import { campaignTemplates, renderEmailDraft, resolveTemplate } from "./templates";
import {
  Activity,
  ActivityType,
  Campaign,
  Contact,
  Meeting,
  Prospect,
  fullName,
} from "./types";
import { dedupePhones, pickAvatarColor, todayISODate, uid } from "./utils";

interface AppState {
  contacts: Contact[];
  meetings: Meeting[];
  activities: Activity[];
  prospects: Prospect[];
  campaigns: Campaign[];
  initialized: boolean;
}

export interface PersistDoc {
  state: AppState;
  version: number;
}

export type IngestMode = "prospect" | "contact";

export interface IngestBody {
  /** Target campaign; defaults to the first active campaign. */
  campaignId?: string;
  /** "prospect" → discovery pool (suggested); "contact" → straight into the pipeline. */
  mode?: IngestMode;
  /** Apollo person objects (or "Key: value" text blobs). */
  people?: unknown[];
  /** For mode "contact": the first-touch next action to queue on each new contact. */
  nextAction?: string;
  /** yyyy-mm-dd; defaults to today when nextAction is set. */
  nextActionDate?: string;
  /** Set/replace next actions on existing contacts by id. */
  nextActions?: Array<{ contactId: string; action: string; date?: string }>;
}

export interface IngestReport {
  campaignId: string;
  addedProspects: number;
  addedContacts: number;
  nextActionsApplied: number;
  added: Array<{ id: string; name: string; as: IngestMode }>;
  skipped: Array<{ name: string; reason: "duplicate" | "unparseable" }>;
  counts: { contacts: number; prospects: number; campaigns: number };
}

const STATE_VERSION = 0; // Zustand persist default (the store sets no `version`).

function generalCampaign(): Campaign {
  return {
    id: uid(),
    name: "General",
    color: "emerald",
    status: "active",
    createdAt: new Date().toISOString(),
  };
}

/** A fresh document for when the DB has no state yet (agent ran before any UI load). */
export function emptyDoc(): PersistDoc {
  return {
    version: STATE_VERSION,
    state: {
      contacts: [],
      meetings: [],
      activities: [],
      prospects: [],
      campaigns: [generalCampaign()],
      initialized: true,
    },
  };
}

/** Parse the stored JSON into a doc, tolerating a bare state object or null. */
export function parseDoc(json: string | null): PersistDoc {
  if (!json) return emptyDoc();
  try {
    const parsed = JSON.parse(json) as Partial<PersistDoc> & Partial<AppState>;
    // Wrapped form { state, version }
    if (parsed && typeof parsed === "object" && "state" in parsed && parsed.state) {
      const doc = parsed as PersistDoc;
      doc.state.contacts ??= [];
      doc.state.meetings ??= [];
      doc.state.activities ??= [];
      doc.state.prospects ??= [];
      doc.state.campaigns ??= [];
      if (doc.state.campaigns.length === 0) doc.state.campaigns.push(generalCampaign());
      doc.state.initialized = true;
      if (typeof doc.version !== "number") doc.version = STATE_VERSION;
      return doc;
    }
  } catch {
    // fall through
  }
  return emptyDoc();
}

function normEmail(e?: string): string | undefined {
  return e?.trim().toLowerCase() || undefined;
}

function normLinkedin(u?: string): string | undefined {
  if (!u) return undefined;
  const m = u.trim().toLowerCase().match(/linkedin\.com\/(?:in|company|pub|school)\/([^/?#]+)/);
  return m ? m[1].replace(/\/$/, "") : undefined;
}

function normNameCompany(first?: string, last?: string, company?: string): string | undefined {
  const name = `${first ?? ""} ${last ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ");
  const co = (company ?? "").trim().toLowerCase();
  if (!name && !co) return undefined;
  return `${name}@@${co}`;
}

/** Keys that identify a person, used to skip duplicates against existing data. */
function keysFor(p: {
  email?: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}): string[] {
  return [
    normEmail(p.email) && `e:${normEmail(p.email)}`,
    normLinkedin(p.linkedinUrl) && `l:${normLinkedin(p.linkedinUrl)}`,
    normNameCompany(p.firstName, p.lastName, p.company) &&
      `n:${normNameCompany(p.firstName, p.lastName, p.company)}`,
  ].filter(Boolean) as string[];
}

function makeActivity(contactId: string, type: ActivityType, text: string): Activity {
  return { id: uid(), contactId, type, text, date: new Date().toISOString() };
}

/** Resolve the campaign to write into; guarantees one exists. */
function resolveCampaignId(state: AppState, requested?: string): string {
  if (requested && state.campaigns.some((c) => c.id === requested)) return requested;
  const active = state.campaigns.find((c) => c.status === "active");
  if (active) return active.id;
  if (state.campaigns[0]) return state.campaigns[0].id;
  const c = generalCampaign();
  state.campaigns.push(c);
  return c.id;
}

/**
 * Merge a batch of people into the document. Dedupes against existing contacts
 * and prospects (and within the batch) by email / LinkedIn / name+company.
 * Returns the report; the caller persists `doc`.
 */
export function applyIngest(doc: PersistDoc, body: IngestBody): IngestReport {
  const state = doc.state;
  const mode: IngestMode = body.mode === "contact" ? "contact" : "prospect";
  const campaignId = resolveCampaignId(state, body.campaignId);

  const seen = new Set<string>();
  for (const c of state.contacts) for (const k of keysFor(c)) seen.add(k);
  for (const p of state.prospects) for (const k of keysFor(p)) seen.add(k);

  const report: IngestReport = {
    campaignId,
    addedProspects: 0,
    addedContacts: 0,
    nextActionsApplied: 0,
    added: [],
    skipped: [],
    counts: { contacts: 0, prospects: 0, campaigns: 0 },
  };

  for (const raw of body.people ?? []) {
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    const parsed = parseEnrichment(text);
    if (!parsed || (!parsed.firstName && !parsed.lastName && !parsed.company)) {
      report.skipped.push({ name: "(unrecognised)", reason: "unparseable" });
      continue;
    }
    const name = `${parsed.firstName} ${parsed.lastName}`.trim() || parsed.company || "—";
    const keys = keysFor(parsed);
    if (keys.some((k) => seen.has(k))) {
      report.skipped.push({ name, reason: "duplicate" });
      continue;
    }
    for (const k of keys) seen.add(k);

    if (mode === "contact") {
      const id = uid();
      const phones = dedupePhones([parsed.phone, ...(parsed.phones ?? [])]);
      const hasAction = !!body.nextAction?.trim();
      const contact: Contact = {
        id,
        firstName: parsed.firstName.trim() || parsed.company || "Unknown",
        lastName: parsed.lastName.trim(),
        company: parsed.company || undefined,
        title: parsed.title || undefined,
        email: parsed.email || undefined,
        phone: phones[0],
        phones: phones.length ? phones : undefined,
        hqPhone: parsed.hqPhone || undefined,
        industry: parsed.industry || undefined,
        companySize: parsed.companySize || undefined,
        location: parsed.location || undefined,
        linkedinUrl: parsed.linkedinUrl || undefined,
        source: "Apollo (Cowork)",
        campaignId,
        tags: parsed.tags ?? [],
        stage: "to_contact",
        nextAction: hasAction ? body.nextAction!.trim() : undefined,
        nextActionDate: hasAction ? body.nextActionDate || todayISODate() : undefined,
        starred: false,
        avatarColor: pickAvatarColor(id),
        createdAt: new Date().toISOString(),
      };
      state.contacts.unshift(contact);
      state.activities.unshift(
        makeActivity(id, "created", `Added ${contact.company ?? fullName(contact)} via Cowork prospecting`)
      );
      if (hasAction) {
        state.activities.unshift(makeActivity(id, "action_set", `Next action set: ${contact.nextAction}`));
      }
      report.addedContacts += 1;
      report.added.push({ id, name, as: "contact" });
    } else {
      const id = uid();
      const prospect: Prospect = {
        id,
        firstName: parsed.firstName.trim() || parsed.company || "Unknown",
        lastName: parsed.lastName.trim(),
        company: (parsed.company || "").trim(),
        title: parsed.title || undefined,
        industry: parsed.industry || undefined,
        companySize: parsed.companySize || undefined,
        location: parsed.location || undefined,
        linkedinUrl: parsed.linkedinUrl || undefined,
        email: parsed.email || undefined,
        tags: parsed.tags ?? (parsed.industry ? [parsed.industry] : []),
        avatarColor: pickAvatarColor(id),
        campaignId,
        source: "apollo",
        status: "suggested",
      };
      state.prospects.unshift(prospect);
      report.addedProspects += 1;
      report.added.push({ id, name, as: "prospect" });
    }
  }

  for (const na of body.nextActions ?? []) {
    const contact = state.contacts.find((c) => c.id === na.contactId);
    if (!contact || !na.action?.trim()) continue;
    contact.nextAction = na.action.trim();
    contact.nextActionDate = na.date || undefined;
    state.activities.unshift(makeActivity(contact.id, "action_set", `Next action: ${contact.nextAction}`));
    report.nextActionsApplied += 1;
  }

  report.counts = {
    contacts: state.contacts.length,
    prospects: state.prospects.length,
    campaigns: state.campaigns.length,
  };
  return report;
}

export interface DraftBody {
  /** Specific contacts to draft for (e.g. the ids emilcrm_add_contacts just returned). */
  contactIds?: string[];
  /** When no contactIds: the campaign whose contacts to draft for. Defaults to first active. */
  campaignId?: string;
  /** Which campaign template to use (id from emilcrm_get_overview). Defaults to the first. */
  templateId?: string;
  /** When drafting by campaign, skip contacts that already have a draft. Default true. */
  onlyMissing?: boolean;
}

export interface DraftReport {
  drafted: Array<{ contactId: string; name: string; email: string | null; subject: string; body: string }>;
  skipped: Array<{ contactId: string; name: string; reason: string }>;
  counts: { drafted: number };
}

/**
 * Render personalised intro drafts from each contact's campaign template (or the
 * default when the campaign has none) and store them on the contacts as status
 * "draft" — exactly what the in-app composer produces. Returns the rendered
 * subject/body so the agent can also push them to Gmail. Caller persists `doc`.
 */
export function applyDrafts(doc: PersistDoc, body: DraftBody): DraftReport {
  const state = doc.state;
  const report: DraftReport = { drafted: [], skipped: [], counts: { drafted: 0 } };

  let targets: Contact[];
  if (body.contactIds?.length) {
    targets = [];
    for (const id of body.contactIds) {
      const c = state.contacts.find((x) => x.id === id);
      if (!c) report.skipped.push({ contactId: id, name: id, reason: "not found" });
      else targets.push(c);
    }
  } else {
    const campaignId = resolveCampaignId(state, body.campaignId);
    const onlyMissing = body.onlyMissing !== false;
    targets = state.contacts.filter((c) => c.campaignId === campaignId && (!onlyMissing || !c.emailDraft));
  }

  for (const c of targets) {
    const campaign = state.campaigns.find((cm) => cm.id === c.campaignId);
    const template = resolveTemplate(campaign, body.templateId);
    const rendered = renderEmailDraft(template, c, campaign);
    c.emailDraft = { ...rendered, status: "draft", updatedAt: new Date().toISOString(), templateName: template.name };
    report.drafted.push({ contactId: c.id, name: fullName(c), email: c.email ?? null, ...rendered });
  }
  report.counts.drafted = report.drafted.length;
  return report;
}

/** A read-only digest the agent uses to pick a campaign, read its ICP, and avoid repeats. */
export function buildDigest(doc: PersistDoc) {
  const { campaigns, contacts, prospects, meetings } = doc.state;
  return {
    campaigns: campaigns.map((c) => {
      const own = contacts.filter((k) => k.campaignId === c.id);
      const profile = c.targetICP ? campaignICPToProfile(c.targetICP) : computeICP(own);
      const recipe = buildSearchRecipe(profile);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        color: c.color,
        targetICP: c.targetICP ?? null,
        derivedFrom: c.targetICP ? "defined" : "contacts",
        emailTemplates: campaignTemplates(c).map((t) => ({
          id: t.id,
          name: t.name,
          subject: t.subject,
          body: t.body,
        })),
        searchRecipe: {
          industries: recipe.industries,
          sizes: recipe.sizes,
          locations: recipe.locations,
          titles: recipe.titles,
          hasSignal: recipe.hasSignal,
          copyText: recipe.copyText,
        },
        counts: {
          contacts: own.length,
          prospects: prospects.filter((p) => p.campaignId === c.id).length,
        },
      };
    }),
    contacts: contacts.map((c) => ({
      id: c.id,
      name: fullName(c),
      company: c.company ?? null,
      email: c.email ?? null,
      linkedinUrl: c.linkedinUrl ?? null,
      stage: c.stage,
      campaignId: c.campaignId ?? null,
      hasDraft: !!c.emailDraft,
    })),
    counts: {
      contacts: contacts.length,
      prospects: prospects.length,
      campaigns: campaigns.length,
      meetings: meetings.length,
    },
  };
}
