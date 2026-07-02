"use client";

import { useMemo } from "react";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useT } from "@/lib/i18n";
import { Meeting } from "@/lib/types";
import { formatMeetingDay, matchesCampaign } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui";
import { MeetingCard } from "@/components/meeting-card";

function groupByDay(meetings: Meeting[]): Array<[string, Meeting[]]> {
  const map = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const key = formatMeetingDay(m.start);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries());
}

export default function MeetingsPage() {
  const allMeetings = useCRM((s) => s.meetings);
  const contacts = useCRM((s) => s.contacts);
  const openModal = useUI((s) => s.openModal);
  const activeCampaignId = useUI((s) => s.activeCampaignId);
  const t = useT();

  const { upcoming, past, weekCount } = useMemo(() => {
    const now = Date.now();
    const weekFromNow = now + 7 * 86_400_000;
    // A meeting belongs to its contact's campaign.
    const campaignOf = new Map(contacts.map((c) => [c.id, c.campaignId]));
    const meetings = allMeetings.filter((m) => matchesCampaign(activeCampaignId, campaignOf.get(m.contactId)));
    const sorted = [...meetings].sort((a, b) => a.start.localeCompare(b.start));
    const upcoming = sorted.filter(
      (m) => m.status === "scheduled" && new Date(m.start).getTime() >= now
    );
    const past = sorted
      .filter((m) => !(m.status === "scheduled" && new Date(m.start).getTime() >= now))
      .reverse();
    const weekCount = upcoming.filter((m) => new Date(m.start).getTime() <= weekFromNow).length;
    return { upcoming, past, weekCount };
  }, [allMeetings, contacts, activeCampaignId]);

  return (
    <>
      <PageHeader
        title={t("Meetings", "Möten")}
        subtitle={t(
          `${upcoming.length} upcoming · ${weekCount} in the next 7 days`,
          `${upcoming.length} kommande · ${weekCount} inom 7 dagar`
        )}
        actions={
          <Button onClick={() => openModal({ kind: "book-meeting" })}>
            <CalendarPlus className="h-4 w-4" />
            {t("Book meeting", "Boka möte")}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {upcoming.length === 0 && past.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-surface py-20 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                <CalendarDays className="h-6 w-6 text-brand-600" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-zinc-900">{t("No meetings yet", "Inga möten än")}</h3>
              <p className="mt-1 max-w-xs text-sm text-zinc-500">
                {t(
                  "Book your first meeting and it'll show up here, grouped by day.",
                  "Boka ditt första möte så dyker det upp här, grupperat per dag."
                )}
              </p>
              <Button className="mt-4" onClick={() => openModal({ kind: "book-meeting" })}>
                <CalendarPlus className="h-4 w-4" />
                {t("Book meeting", "Boka möte")}
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              {upcoming.length > 0 && (
                <DaySections title={t("Upcoming", "Kommande")} days={groupByDay(upcoming)} />
              )}
              {past.length > 0 && (
                <DaySections title={t("Past", "Tidigare")} days={groupByDay(past)} muted />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DaySections({
  title,
  days,
  muted,
}: {
  title: string;
  days: Array<[string, Meeting[]]>;
  muted?: boolean;
}) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
      <div className="space-y-4">
        {days.map(([day, items]) => (
          <section
            key={day}
            className={`overflow-hidden rounded-xl border border-zinc-200 bg-surface shadow-sm ${muted ? "opacity-80" : ""}`}
          >
            <div className="border-b border-zinc-100 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-zinc-700">{day}</h3>
            </div>
            <div className="divide-y divide-zinc-100">
              {items.map((m) => (
                <MeetingCard key={m.id} meeting={m} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
