"use client";

import { useMemo } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Inbox } from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useT } from "@/lib/i18n";
import { Contact, fullName } from "@/lib/types";
import { DueBucket, dueBucket, matchesCampaign } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ActionRow } from "@/components/action-row";
import { Avatar, Button } from "@/components/ui";

const BUCKET_ORDER: DueBucket[] = ["overdue", "today", "tomorrow", "week", "later", "queue"];
const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  queue: "Asap · no date",
};
const BUCKET_LABEL_SV: Record<DueBucket, string> = {
  overdue: "Försenade",
  today: "Idag",
  tomorrow: "Imorgon",
  week: "Denna vecka",
  later: "Senare",
  queue: "Snarast · inget datum",
};
const BUCKET_ACCENT: Record<DueBucket, string> = {
  overdue: "text-rose-600",
  today: "text-brand-600",
  tomorrow: "text-amber-600",
  week: "text-zinc-500",
  later: "text-zinc-400",
  queue: "text-zinc-400",
};

export default function ActionStreamPage() {
  const allContacts = useCRM((s) => s.contacts);
  const openModal = useUI((s) => s.openModal);
  const activeCampaignId = useUI((s) => s.activeCampaignId);
  const t = useT();

  const { groups, needsAction, dueTodayCount } = useMemo(() => {
    const contacts = allContacts.filter((c) => matchesCampaign(activeCampaignId, c.campaignId));
    const withAction = contacts.filter((c) => c.nextAction);
    const groups: Record<DueBucket, Contact[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      week: [],
      later: [],
      queue: [],
    };
    for (const c of withAction) groups[dueBucket(c.nextActionDate)].push(c);
    for (const b of BUCKET_ORDER) {
      groups[b].sort((a, z) => (a.nextActionDate ?? "9999").localeCompare(z.nextActionDate ?? "9999"));
    }
    const needsAction = contacts.filter(
      (c) => !c.nextAction && c.stage !== "won" && c.stage !== "lost"
    );
    const dueTodayCount = groups.overdue.length + groups.today.length;
    return { groups, needsAction, dueTodayCount };
  }, [allContacts, activeCampaignId]);

  const hasAnyAction = BUCKET_ORDER.some((b) => groups[b].length > 0);

  return (
    <>
      <PageHeader
        title="Action Stream"
        subtitle={
          dueTodayCount > 0
            ? t(
                `${dueTodayCount} action${dueTodayCount > 1 ? "s" : ""} need attention today`,
                `${dueTodayCount} ${dueTodayCount > 1 ? "åtgärder behöver" : "åtgärd behöver"} uppmärksamhet idag`
              )
            : t("You're all caught up for today", "Du är ikapp för idag")
        }
        actions={
          <Button variant="secondary" onClick={() => openModal({ kind: "book-meeting" })}>
            <CalendarDays className="h-4 w-4 text-zinc-400" />
            {t("Book meeting", "Boka möte")}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {!hasAnyAction && needsAction.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {BUCKET_ORDER.filter((b) => groups[b].length > 0).map((b) => (
                <section
                  key={b}
                  className="overflow-hidden rounded-xl border border-zinc-200 bg-surface shadow-sm"
                >
                  <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
                    {b === "overdue" && <AlertCircle className="h-4 w-4 text-rose-500" />}
                    <h2 className={`text-xs font-semibold uppercase tracking-wide ${BUCKET_ACCENT[b]}`}>
                      {t(BUCKET_LABEL[b], BUCKET_LABEL_SV[b])}
                    </h2>
                    <span className="text-xs font-medium text-zinc-400">{groups[b].length}</span>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {groups[b].map((c) => (
                      <ActionRow key={c.id} contact={c} />
                    ))}
                  </div>
                </section>
              ))}

              {needsAction.length > 0 && (
                <section className="overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-surface/60">
                  <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
                    <Inbox className="h-4 w-4 text-zinc-400" />
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {t("Needs a next action", "Saknar nästa åtgärd")}
                    </h2>
                    <span className="text-xs font-medium text-zinc-400">{needsAction.length}</span>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {needsAction.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openModal({ kind: "next-action", contactId: c.id })}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
                      >
                        <Avatar contact={c} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-zinc-900">{fullName(c)}</div>
                          {c.company && <div className="truncate text-xs text-zinc-400">{c.company}</div>}
                        </div>
                        <span className="text-xs font-medium text-brand-600">{t("+ Add action", "+ Lägg till åtgärd")}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-surface py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
        <CheckCircle2 className="h-6 w-6 text-brand-600" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-900">{t("Inbox zero on actions", "Inga åtgärder kvar")}</h3>
      <p className="mt-1 max-w-xs text-sm text-zinc-500">
        {t(
          "Every contact is either parked or closed. Add a contact to start booking meetings.",
          "Alla kontakter är antingen parkerade eller avslutade. Lägg till en kontakt för att börja boka möten."
        )}
      </p>
    </div>
  );
}
