"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { serverStorage } from "./server-storage";
import { parseEnrichment, parseLinkedInUrl } from "./apollo-parse";
import {
  Activity,
  ActivityType,
  CallRecord,
  CallScript,
  Campaign,
  CampaignICP,
  Contact,
  EmailTemplate,
  Meeting,
  MeetingStatus,
  MeetingType,
  Prospect,
  Stage,
  STAGE_META,
  fullName,
} from "./types";
import { renderEmailDraft, resolveTemplate } from "./templates";
import { CAMPAIGN_COLORS, dateOffset, dedupePhones, pickAvatarColor, todayISODate, uid } from "./utils";

export interface NewContactInput {
  firstName: string;
  lastName: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  phones?: string[];
  hqPhone?: string;
  industry?: string;
  companySize?: string;
  location?: string;
  linkedinUrl?: string;
  source?: string;
  campaignId?: string;
  tags?: string[];
  stage?: Stage;
  value?: number;
  nextAction?: string;
  nextActionDate?: string;
}

export interface BookMeetingInput {
  contactId: string;
  title: string;
  start: string;
  durationMins: number;
  type: MeetingType;
  location?: string;
  notes?: string;
}

export interface NewProspectInput {
  firstName: string;
  lastName?: string;
  company: string;
  title?: string;
  industry?: string;
  companySize?: string;
  location?: string;
  linkedinUrl?: string;
  email?: string;
  campaignId?: string;
  tags?: string[];
  source?: "apollo" | "manual";
}

export interface NewCampaignInput {
  name: string;
  description?: string;
  color?: string;
  targetICP?: CampaignICP;
  emailTemplates?: EmailTemplate[];
}

interface CRMState {
  contacts: Contact[];
  meetings: Meeting[];
  activities: Activity[];
  prospects: Prospect[];
  campaigns: Campaign[];
  initialized: boolean;
  hasHydrated: boolean;

  setHasHydrated: (v: boolean) => void;
  clearAll: () => void;
  migrate: () => void;

  // campaigns
  addCampaign: (input: NewCampaignInput) => string;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  archiveCampaign: (id: string) => void;
  deleteCampaign: (id: string) => void;
  defaultCampaignId: () => string | undefined;

  // contacts
  addContact: (input: NewContactInput) => string;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  deleteContact: (id: string) => void;
  toggleStar: (id: string) => void;
  setStage: (id: string, stage: Stage) => void;

  // prospecting / discovery
  importEnrichment: (text: string) => string | null;
  importLinkedInUrl: (url: string) => string | null;
  addProspect: (input: NewProspectInput) => string;
  addProspectToPipeline: (prospectId: string) => string | null;
  dismissProspect: (prospectId: string) => void;

  // next action (the Action Stream)
  setNextAction: (id: string, action: string, date?: string) => void;
  completeNextAction: (id: string) => void;

  // intro email drafts (from a campaign template)
  generateDraft: (id: string, templateId?: string) => boolean;
  updateDraft: (id: string, patch: { subject?: string; body?: string }) => void;
  markDraftSent: (id: string) => void;
  discardDraft: (id: string) => void;

  // cold-call scripts + logged calls
  setCallScript: (id: string, script: CallScript) => void;
  updateCallScript: (id: string, text: string) => void;
  discardCallScript: (id: string) => void;
  addCallRecord: (id: string, partial: Partial<CallRecord>) => string;

  // meetings
  bookMeeting: (input: BookMeetingInput) => string;
  setMeetingStatus: (id: string, status: MeetingStatus) => void;
  deleteMeeting: (id: string) => void;

  // activity log
  logActivity: (contactId: string, type: ActivityType, text: string) => void;
}

function makeActivity(contactId: string, type: ActivityType, text: string): Activity {
  return { id: uid(), contactId, type, text, date: new Date().toISOString() };
}

export const useCRM = create<CRMState>()(
  persist(
    (set, get) => ({
      contacts: [],
      meetings: [],
      activities: [],
      prospects: [],
      campaigns: [],
      initialized: false,
      hasHydrated: false,

      setHasHydrated: (v) => set({ hasHydrated: v }),

      // Wipe everything to an empty book with a single default campaign.
      clearAll: () => {
        set({
          contacts: [],
          meetings: [],
          activities: [],
          prospects: [],
          campaigns: [
            {
              id: uid(),
              name: "General",
              color: "emerald",
              status: "active",
              createdAt: new Date().toISOString(),
            },
          ],
          initialized: true,
        });
      },

      // Non-destructive: bring older saved data up to date — assign a default
      // campaign to orphaned records, and migrate the legacy single
      // `emailTemplate` to the new `emailTemplates` array.
      migrate: () => {
        const s = get();
        // Legacy single-template → array (runs regardless of campaign count).
        const migrateTemplates = (c: Campaign): Campaign => {
          const legacy = (c as { emailTemplate?: { subject?: string; body?: string } }).emailTemplate;
          if (c.emailTemplates || !legacy || !(legacy.subject || legacy.body)) return c;
          const { emailTemplate: _drop, ...rest } = c as Campaign & { emailTemplate?: unknown };
          return {
            ...(rest as Campaign),
            emailTemplates: [{ id: uid(), name: "Intro", subject: legacy.subject ?? "", body: legacy.body ?? "" }],
          };
        };

        if (s.campaigns.length === 0) {
          const def: Campaign = {
            id: uid(),
            name: "General",
            color: "emerald",
            status: "active",
            createdAt: new Date().toISOString(),
          };
          set({
            campaigns: [def],
            contacts: s.contacts.map((c) => (c.campaignId ? c : { ...c, campaignId: def.id })),
            prospects: s.prospects.map((p) => (p.campaignId ? p : { ...p, campaignId: def.id })),
          });
          return;
        }

        const migrated = s.campaigns.map(migrateTemplates);
        if (migrated.some((c, i) => c !== s.campaigns[i])) set({ campaigns: migrated });
      },

      addCampaign: (input) => {
        const id = uid();
        const used = get().campaigns.length;
        const campaign: Campaign = {
          id,
          name: input.name.trim() || "Untitled campaign",
          description: input.description?.trim() || undefined,
          color: input.color || CAMPAIGN_COLORS[used % CAMPAIGN_COLORS.length],
          targetICP: input.targetICP,
          emailTemplates: input.emailTemplates,
          status: "active",
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ campaigns: [...s.campaigns, campaign] }));
        return id;
      },

      updateCampaign: (id, patch) =>
        set((s) => ({ campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

      archiveCampaign: (id) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...c, status: c.status === "archived" ? "active" : "archived" } : c
          ),
        })),

      deleteCampaign: (id) => {
        const remaining = get().campaigns.filter((c) => c.id !== id);
        const fallback = remaining.find((c) => c.status === "active")?.id ?? remaining[0]?.id;
        set((s) => ({
          campaigns: remaining,
          // Reassign orphaned contacts/prospects to a remaining campaign.
          contacts: s.contacts.map((c) => (c.campaignId === id ? { ...c, campaignId: fallback } : c)),
          prospects: s.prospects.map((p) => (p.campaignId === id ? { ...p, campaignId: fallback } : p)),
        }));
      },

      defaultCampaignId: () => {
        const cs = get().campaigns;
        return cs.find((c) => c.status === "active")?.id ?? cs[0]?.id;
      },

      addContact: (input) => {
        const id = uid();
        const phones = dedupePhones([input.phone, ...(input.phones ?? [])]);
        const contact: Contact = {
          id,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          company: input.company?.trim() || undefined,
          title: input.title?.trim() || undefined,
          email: input.email?.trim() || undefined,
          phone: phones[0],
          phones: phones.length ? phones : undefined,
          hqPhone: input.hqPhone?.trim() || undefined,
          industry: input.industry?.trim() || undefined,
          companySize: input.companySize?.trim() || undefined,
          location: input.location?.trim() || undefined,
          linkedinUrl: input.linkedinUrl?.trim() || undefined,
          source: input.source?.trim() || undefined,
          campaignId: input.campaignId ?? get().defaultCampaignId(),
          tags: input.tags ?? [],
          stage: input.stage ?? "to_contact",
          value: input.value,
          nextAction: input.nextAction?.trim() || undefined,
          nextActionDate: input.nextActionDate || undefined,
          starred: false,
          avatarColor: pickAvatarColor(id),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          contacts: [contact, ...s.contacts],
          activities: [
            makeActivity(id, "created", `Added ${contact.company ?? fullName(contact)} to the pipeline`),
            ...s.activities,
          ],
        }));
        if (contact.nextAction) {
          get().logActivity(id, "action_set", `Next action set: ${contact.nextAction}`);
        }
        return id;
      },

      updateContact: (id, patch) =>
        set((s) => ({
          contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      deleteContact: (id) =>
        set((s) => ({
          contacts: s.contacts.filter((c) => c.id !== id),
          meetings: s.meetings.filter((m) => m.contactId !== id),
          activities: s.activities.filter((a) => a.contactId !== id),
        })),

      toggleStar: (id) =>
        set((s) => ({
          contacts: s.contacts.map((c) => (c.id === id ? { ...c, starred: !c.starred } : c)),
        })),

      setStage: (id, stage) => {
        const prev = get().contacts.find((c) => c.id === id);
        if (!prev || prev.stage === stage) return;
        set((s) => ({
          contacts: s.contacts.map((c) => (c.id === id ? { ...c, stage } : c)),
        }));
        get().logActivity(
          id,
          "stage_change",
          `Moved ${STAGE_META[prev.stage].label} → ${STAGE_META[stage].label}`
        );
      },

      importEnrichment: (text) => {
        const parsed = parseEnrichment(text);
        if (!parsed || (!parsed.firstName && !parsed.lastName && !parsed.company)) return null;
        const hasContact = parsed.email || parsed.phone || (parsed.phones?.length ?? 0) > 0;
        return get().addContact({
          firstName: parsed.firstName || parsed.company || "Unknown",
          lastName: parsed.lastName,
          company: parsed.company,
          title: parsed.title,
          email: parsed.email,
          phone: parsed.phone,
          phones: parsed.phones,
          hqPhone: parsed.hqPhone,
          industry: parsed.industry,
          companySize: parsed.companySize,
          location: parsed.location,
          linkedinUrl: parsed.linkedinUrl,
          tags: parsed.tags,
          source: "LinkedIn + Apollo",
          stage: "to_contact",
          nextAction: hasContact
            ? "Send personalised intro to book a meeting"
            : "Enrich contact details (Apollo / hitta.se), then reach out",
          nextActionDate: todayISODate(),
        });
      },

      importLinkedInUrl: (url) => {
        const parsed = parseLinkedInUrl(url);
        if (!parsed) return null;
        return get().addContact({
          firstName: parsed.firstName || parsed.company || "Unknown",
          lastName: parsed.lastName,
          company: parsed.company,
          linkedinUrl: parsed.linkedinUrl,
          tags: parsed.tags,
          source: "LinkedIn URL",
          stage: "to_contact",
          nextAction: "Enrich from LinkedIn — pull title, email & phone numbers (Apollo / hitta.se)",
          nextActionDate: todayISODate(),
        });
      },

      addProspect: (input) => {
        const id = uid();
        const prospect: Prospect = {
          id,
          firstName: input.firstName.trim(),
          lastName: (input.lastName ?? "").trim(),
          company: input.company.trim(),
          title: input.title?.trim() || undefined,
          industry: input.industry?.trim() || undefined,
          companySize: input.companySize?.trim() || undefined,
          location: input.location?.trim() || undefined,
          linkedinUrl: input.linkedinUrl?.trim() || undefined,
          email: input.email?.trim() || undefined,
          campaignId: input.campaignId ?? get().defaultCampaignId(),
          tags: input.tags ?? (input.industry ? [input.industry] : []),
          avatarColor: pickAvatarColor(id),
          source: input.source ?? "apollo",
          status: "suggested",
        };
        set((s) => ({ prospects: [prospect, ...s.prospects] }));
        return id;
      },

      addProspectToPipeline: (prospectId) => {
        const p = get().prospects.find((x) => x.id === prospectId);
        if (!p || p.status === "added") return null;
        const contactId = get().addContact({
          firstName: p.firstName,
          lastName: p.lastName,
          company: p.company,
          title: p.title,
          email: p.email,
          industry: p.industry,
          companySize: p.companySize,
          location: p.location,
          linkedinUrl: p.linkedinUrl,
          campaignId: p.campaignId,
          tags: p.tags,
          source: "Prospect discovery",
          stage: "to_contact",
          nextAction: "Find on LinkedIn + enrich via Apollo",
          nextActionDate: todayISODate(),
        });
        set((s) => ({
          prospects: s.prospects.map((x) => (x.id === prospectId ? { ...x, status: "added" } : x)),
        }));
        return contactId;
      },

      dismissProspect: (prospectId) =>
        set((s) => ({
          prospects: s.prospects.map((x) =>
            x.id === prospectId ? { ...x, status: "dismissed" } : x
          ),
        })),

      setNextAction: (id, action, date) => {
        set((s) => ({
          contacts: s.contacts.map((c) =>
            c.id === id ? { ...c, nextAction: action.trim(), nextActionDate: date || undefined } : c
          ),
        }));
        get().logActivity(id, "action_set", `Next action: ${action.trim()}`);
      },

      completeNextAction: (id) => {
        const c = get().contacts.find((x) => x.id === id);
        if (!c?.nextAction) return;
        const done = c.nextAction;
        set((s) => ({
          contacts: s.contacts.map((x) =>
            x.id === id ? { ...x, nextAction: undefined, nextActionDate: undefined } : x
          ),
        }));
        get().logActivity(id, "action_done", `Completed: ${done}`);
      },

      // Render one of the campaign's templates into a personalised draft.
      generateDraft: (id, templateId) => {
        const c = get().contacts.find((x) => x.id === id);
        if (!c) return false;
        const campaign = get().campaigns.find((cm) => cm.id === c.campaignId);
        const template = resolveTemplate(campaign, templateId);
        const { subject, body } = renderEmailDraft(template, c, campaign);
        set((s) => ({
          contacts: s.contacts.map((x) =>
            x.id === id
              ? {
                  ...x,
                  emailDraft: {
                    subject,
                    body,
                    status: "draft",
                    updatedAt: new Date().toISOString(),
                    templateName: template.name,
                  },
                }
              : x
          ),
        }));
        return true;
      },

      updateDraft: (id, patch) =>
        set((s) => ({
          contacts: s.contacts.map((x) =>
            x.id === id && x.emailDraft
              ? { ...x, emailDraft: { ...x.emailDraft, ...patch, status: "draft", updatedAt: new Date().toISOString() } }
              : x
          ),
        })),

      // Mark the intro as sent, advance the contact, and queue the follow-up —
      // the Action Stream loop: every send leaves a next move on the board.
      markDraftSent: (id) => {
        const c = get().contacts.find((x) => x.id === id);
        if (!c?.emailDraft) return;
        const subject = c.emailDraft.subject.trim();
        set((s) => ({
          contacts: s.contacts.map((x) =>
            x.id === id && x.emailDraft
              ? { ...x, emailDraft: { ...x.emailDraft, status: "sent", updatedAt: new Date().toISOString() } }
              : x
          ),
        }));
        get().logActivity(id, "email", `Sent intro: ${subject || "(no subject)"}`);
        if (c.stage === "to_contact") get().setStage(id, "contacted");
        get().setNextAction(id, "Follow up if no reply", dateOffset(3));
      },

      discardDraft: (id) =>
        set((s) => ({
          contacts: s.contacts.map((x) => (x.id === id ? { ...x, emailDraft: undefined } : x)),
        })),

      setCallScript: (id, script) =>
        set((s) => ({
          contacts: s.contacts.map((x) => (x.id === id ? { ...x, callScript: script } : x)),
        })),

      updateCallScript: (id, text) =>
        set((s) => ({
          contacts: s.contacts.map((x) =>
            x.id === id && x.callScript ? { ...x, callScript: { ...x.callScript, text } } : x
          ),
        })),

      discardCallScript: (id) =>
        set((s) => ({
          contacts: s.contacts.map((x) => (x.id === id ? { ...x, callScript: undefined } : x)),
        })),

      // Log an optimistic call record on dial; the webhook later enriches it
      // (transcript/summary) by matching cloudtalkCallId or the callee number.
      addCallRecord: (id, partial) => {
        const recordId = uid();
        const record: CallRecord = {
          id: recordId,
          direction: "outbound",
          startedAt: new Date().toISOString(),
          status: "initiated",
          ...partial,
        };
        const c = get().contacts.find((x) => x.id === id);
        set((s) => ({
          contacts: s.contacts.map((x) =>
            x.id === id ? { ...x, calls: [record, ...(x.calls ?? [])] } : x
          ),
        }));
        if (c) get().logActivity(id, "call", `Called ${fullName(c)} via CloudTalk`);
        return recordId;
      },

      bookMeeting: (input) => {
        const id = uid();
        const meeting: Meeting = {
          id,
          contactId: input.contactId,
          title: input.title.trim(),
          start: input.start,
          durationMins: input.durationMins,
          type: input.type,
          location: input.location?.trim() || undefined,
          notes: input.notes?.trim() || undefined,
          status: "scheduled",
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          meetings: [...s.meetings, meeting],
          contacts: s.contacts.map((c) =>
            c.id === input.contactId && (c.stage === "to_contact" || c.stage === "contacted" || c.stage === "scheduling")
              ? { ...c, stage: "booked" }
              : c
          ),
        }));
        const when = new Date(input.start).toLocaleString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        get().logActivity(input.contactId, "meeting_booked", `Meeting booked: ${meeting.title} — ${when}`);
        return id;
      },

      setMeetingStatus: (id, status) => {
        const m = get().meetings.find((x) => x.id === id);
        if (!m) return;
        set((s) => ({
          meetings: s.meetings.map((x) => (x.id === id ? { ...x, status } : x)),
        }));
        if (status === "completed") {
          get().logActivity(m.contactId, "meeting_held", `Meeting held: ${m.title}`);
          const c = get().contacts.find((x) => x.id === m.contactId);
          if (c && c.stage === "booked") get().setStage(m.contactId, "met");
        } else if (status === "cancelled" || status === "no_show") {
          get().logActivity(
            m.contactId,
            "meeting_cancelled",
            `${status === "no_show" ? "No-show" : "Cancelled"}: ${m.title}`
          );
        }
      },

      deleteMeeting: (id) =>
        set((s) => ({ meetings: s.meetings.filter((m) => m.id !== id) })),

      logActivity: (contactId, type, text) =>
        set((s) => ({ activities: [makeActivity(contactId, type, text), ...s.activities] })),
    }),
    {
      // v2 adds firmographics + the prospect discovery pool; the bump reseeds
      // existing browsers with the richer demo book.
      name: "emilcrm-store-v2",
      // Server-backed (Neon Postgres) with a localStorage mirror for offline use.
      storage: createJSONStorage(() => serverStorage),
      partialize: (s) => ({
        contacts: s.contacts,
        meetings: s.meetings,
        activities: s.activities,
        prospects: s.prospects,
        campaigns: s.campaigns,
        initialized: s.initialized,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // First ever load: start empty with a default campaign (no demo data).
        if (!state.initialized) state.clearAll();
        // Existing saved data without campaigns: assign a default (non-destructive).
        state.migrate();
        state.setHasHydrated(true);
      },
    }
  )
);
