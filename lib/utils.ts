import {
  format,
  formatDistanceToNowStrict,
  isThisYear,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfDay,
} from "date-fns";
import { sv } from "date-fns/locale";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// Locale for date-label words ("Today", month names, …). Plain module state,
// kept in sync by lib/i18n's setLocale/initLocale so the pure date helpers
// below can localise without every caller threading a locale through.
let _locale: "en" | "sv" = "en";
export function setDateLocale(l: "en" | "sv"): void {
  _locale = l;
}
const isSv = () => _locale === "sv";
/** date-fns options for the active locale (Swedish month/day names). */
const dfns = () => (isSv() ? { locale: sv } : undefined);

/** True if an entity's campaign matches the active campaign filter ("all" = any). */
export function matchesCampaign(active: string, campaignId?: string): boolean {
  return active === "all" || campaignId === active;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** yyyy-mm-dd for an offset of days from today (local). */
export function dateOffset(days: number): string {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

/** ISO datetime for an offset of days + hour-of-day from now. */
export function dateTimeOffset(days: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const todayISODate = (): string => format(startOfDay(new Date()), "yyyy-MM-dd");

/** Buckets a next-action date relative to today. */
export type DueBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "queue";

export function dueBucket(dateStr?: string): DueBucket {
  if (!dateStr) return "queue";
  const today = startOfDay(new Date());
  const d = startOfDay(parseISO(dateStr));
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return "week";
  return "later";
}

/** Friendly label for a due date, e.g. "Today", "2 days overdue", "Fri 26 Jun". */
export function dueLabel(dateStr?: string): string {
  if (!dateStr) return isSv() ? "Snarast" : "Asap";
  const d = parseISO(dateStr);
  if (isToday(d)) return isSv() ? "Idag" : "Today";
  if (isTomorrow(d)) return isSv() ? "Imorgon" : "Tomorrow";
  if (isYesterday(d)) return isSv() ? "Igår" : "Yesterday";
  const bucket = dueBucket(dateStr);
  if (bucket === "overdue") {
    const days = formatDistanceToNowStrict(startOfDay(d), { unit: "day", locale: isSv() ? sv : undefined });
    return isSv() ? `${days} försenat` : `${days} overdue`;
  }
  return format(d, isThisYear(d) ? "EEE d MMM" : "d MMM yyyy", dfns());
}

/** "in 3 days", "in 2 weeks" for upcoming non-urgent dates. */
export function relativeFuture(dateStr?: string): string {
  if (!dateStr) return "";
  return formatDistanceToNowStrict(parseISO(dateStr), { addSuffix: true, locale: isSv() ? sv : undefined });
}

export function formatMeetingTime(iso: string): string {
  const d = parseISO(iso);
  return format(d, "HH:mm");
}

export function formatMeetingDay(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return isSv() ? "Idag" : "Today";
  if (isTomorrow(d)) return isSv() ? "Imorgon" : "Tomorrow";
  if (isYesterday(d)) return isSv() ? "Igår" : "Yesterday";
  return format(d, isThisYear(d) ? "EEEE, d MMMM" : "EEEE, d MMMM yyyy", dfns());
}

export function formatActivityTime(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return `${isSv() ? "Idag" : "Today"}, ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `${isSv() ? "Igår" : "Yesterday"}, ${format(d, "HH:mm")}`;
  return format(d, isThisYear(d) ? "d MMM, HH:mm" : "d MMM yyyy", dfns());
}

export function formatCurrency(n?: number): string {
  if (!n) return "—";
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(n);
}

export const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-pink-500",
];

export function pickAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Named accent colors for campaigns (mapped to dot/bg/text/border classes in the UI). */
export const CAMPAIGN_COLORS = [
  "emerald",
  "blue",
  "violet",
  "amber",
  "rose",
  "cyan",
  "fuchsia",
  "indigo",
] as const;
export type CampaignColor = (typeof CAMPAIGN_COLORS)[number];

/** Tailwind class fragments for a campaign accent color. */
export const CAMPAIGN_COLOR_CLASSES: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  emerald: { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  blue: { dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  violet: { dot: "bg-violet-500", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  amber: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  rose: { dot: "bg-rose-500", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  cyan: { dot: "bg-cyan-500", bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  fuchsia: { dot: "bg-fuchsia-500", bg: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200" },
  indigo: { dot: "bg-indigo-500", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
};

export function campaignColorClasses(color?: string) {
  return CAMPAIGN_COLOR_CLASSES[color ?? "emerald"] ?? CAMPAIGN_COLOR_CLASSES.emerald;
}

/** Normalised digits-only form for comparing phone numbers. */
function normalizePhone(p: string): string {
  return p.replace(/[^\d+]/g, "");
}

/** Dedupe a list of phone numbers (by digits), dropping empties, keeping display form. */
export function dedupePhones(list: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw?.trim();
    if (!v) continue;
    const key = normalizePhone(v);
    if (key.length < 5 || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** `tel:` href with separators stripped. */
export function telHref(p: string): string {
  return `tel:${p.replace(/[^\d+]/g, "")}`;
}
