// EmilCRM data model — a OnePageCRM-style "Action Stream" CRM, oriented around booking meetings.

/** The booking pipeline a contact moves through, from cold to closed. */
export type Stage =
  | "to_contact" // identified, not yet reached out
  | "contacted" // reached out, awaiting a reply
  | "scheduling" // in conversation about times
  | "booked" // meeting is on the calendar
  | "met" // meeting happened
  | "follow_up" // nurturing after the meeting
  | "won" // converted to a client / deal
  | "lost"; // not moving forward

export const STAGES: Stage[] = [
  "to_contact",
  "contacted",
  "scheduling",
  "booked",
  "met",
  "follow_up",
  "won",
  "lost",
];

export interface StageMeta {
  label: string;
  /** Tailwind utility fragments for chips/columns. */
  text: string;
  bg: string;
  border: string;
  dot: string;
}

export const STAGE_META: Record<Stage, StageMeta> = {
  to_contact: { label: "To contact", text: "text-zinc-700", bg: "bg-zinc-100", border: "border-zinc-200", dot: "bg-zinc-400" },
  contacted: { label: "Contacted", text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-500" },
  scheduling: { label: "Scheduling", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
  booked: { label: "Meeting booked", text: "text-brand-700", bg: "bg-brand-50", border: "border-brand-200", dot: "bg-brand-500" },
  met: { label: "Met", text: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", dot: "bg-violet-500" },
  follow_up: { label: "Follow-up", text: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200", dot: "bg-cyan-500" },
  won: { label: "Won", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-600" },
  lost: { label: "Lost", text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", dot: "bg-rose-400" },
};

export type MeetingType = "video" | "call" | "in_person";

export const MEETING_TYPE_META: Record<MeetingType, { label: string }> = {
  video: { label: "Video call" },
  call: { label: "Phone call" },
  in_person: { label: "In person" },
};

export type MeetingStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string; // primary direct / mobile number
  phones?: string[]; // every direct / mobile number found for the person
  hqPhone?: string; // company / HQ main line
  // Firmographics — used to derive the ICP and match lookalike prospects.
  industry?: string;
  companySize?: string; // employee band, e.g. "11-50"
  location?: string; // city / country
  linkedinUrl?: string;
  source?: string; // where the lead came from, e.g. "LinkedIn + Apollo"
  campaignId?: string; // which campaign this contact belongs to
  tags: string[];
  stage: Stage;
  /** The single "Next Action" — the heart of the Action Stream. */
  nextAction?: string;
  /** ISO date (yyyy-mm-dd) the next action is due. Empty = "Asap / queue". */
  nextActionDate?: string;
  starred: boolean;
  /** Potential value of the relationship, for pipeline totals. */
  value?: number;
  avatarColor: string;
  createdAt: string; // ISO datetime
}

export interface Meeting {
  id: string;
  contactId: string;
  title: string;
  start: string; // ISO datetime
  durationMins: number;
  type: MeetingType;
  location?: string; // video link, phone number, or address
  notes?: string;
  status: MeetingStatus;
  createdAt: string;
}

export type ActivityType =
  | "created"
  | "note"
  | "call"
  | "email"
  | "action_set"
  | "action_done"
  | "meeting_booked"
  | "meeting_held"
  | "meeting_cancelled"
  | "stage_change";

export interface Activity {
  id: string;
  contactId: string;
  type: ActivityType;
  text: string;
  date: string; // ISO datetime
}

export function fullName(c: Pick<Contact, "firstName" | "lastName">): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

export function initials(c: Pick<Contact, "firstName" | "lastName">): string {
  return `${c.firstName[0] ?? ""}${c.lastName[0] ?? ""}`.toUpperCase();
}

/**
 * A candidate prospect in the discovery pool — a lookalike you could target.
 * Not yet in the pipeline; gets scored against your ICP and can be promoted
 * to a Contact ("Add to pipeline").
 */
export interface Prospect {
  id: string;
  firstName: string;
  lastName: string;
  title?: string;
  company: string;
  industry?: string;
  companySize?: string;
  location?: string;
  linkedinUrl?: string;
  email?: string;
  tags: string[];
  avatarColor: string;
  campaignId?: string; // which campaign this candidate is being sourced for
  /** Where this candidate came from. "sample" = built-in starter set. */
  source?: "sample" | "apollo" | "manual";
  /** "added" once promoted to a contact, "dismissed" if hidden. */
  status: "suggested" | "added" | "dismissed";
}

/** A campaign: a self-contained outreach effort with its own pipeline + ICP. */
export interface Campaign {
  id: string;
  name: string;
  description?: string;
  color: string; // tailwind text/bg accent base, e.g. "emerald"
  /** Manually-defined target profile. If absent, the ICP is derived from the
   * campaign's own contacts. */
  targetICP?: CampaignICP;
  status: "active" | "archived";
  createdAt: string;
}

export interface CampaignICP {
  industries: string[];
  companySizes: string[];
  locations: string[];
  titles: string[];
}

/** A single weighted facet of the derived Ideal Customer Profile. */
export interface ICPFacet {
  value: string;
  /** 0–1, share of weighted signal for this dimension. */
  weight: number;
  count: number;
}

export interface ICPProfile {
  industries: ICPFacet[];
  companySizes: ICPFacet[];
  titleKeywords: ICPFacet[];
  locations: ICPFacet[];
  tags: ICPFacet[];
  avgValue: number;
  /** Number of contacts (weighted) that informed the profile. */
  sampleSize: number;
}

export interface ProspectScore {
  score: number; // 0–100
  reasons: string[];
}
