"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Plus, Search, Star } from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useT, STAGE_LABEL_SV } from "@/lib/i18n";
import { Stage, STAGES, STAGE_META, fullName } from "@/lib/types";
import { cn, dueLabel, formatCurrency, matchesCampaign } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Avatar, Button, DueBadge, StageBadge, Tag, inputClass } from "@/components/ui";

export default function ContactsPage() {
  const allContacts = useCRM((s) => s.contacts);
  const toggleStar = useCRM((s) => s.toggleStar);
  const openModal = useUI((s) => s.openModal);
  const activeCampaignId = useUI((s) => s.activeCampaignId);
  const t = useT();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");

  const contacts = useMemo(
    () => allContacts.filter((c) => matchesCampaign(activeCampaignId, c.campaignId)),
    [allContacts, activeCampaignId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) => (stageFilter === "all" ? true : c.stage === stageFilter))
      .filter((c) => {
        if (!q) return true;
        return (
          fullName(c).toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => Number(b.starred) - Number(a.starred) || fullName(a).localeCompare(fullName(b)));
  }, [contacts, query, stageFilter]);

  return (
    <>
      <PageHeader
        title={t("Contacts", "Kontakter")}
        subtitle={t(`${contacts.length} in your book`, `${contacts.length} i din bok`)}
        actions={
          <Button onClick={() => openModal({ kind: "add-contact" })}>
            <Plus className="h-4 w-4" />
            {t("Add contact", "Lägg till kontakt")}
          </Button>
        }
      />

      <div className="border-b border-zinc-200 bg-surface px-7 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              className={cn(inputClass, "pl-9")}
              placeholder={t("Search name, company, tag…", "Sök namn, företag, tagg…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill active={stageFilter === "all"} onClick={() => setStageFilter("all")}>
              {t("All", "Alla")}
            </FilterPill>
            {STAGES.map((s) => (
              <FilterPill key={s} active={stageFilter === s} onClick={() => setStageFilter(s)}>
                {t(STAGE_META[s].label, STAGE_LABEL_SV[s])}
              </FilterPill>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-5">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-zinc-400">{t("No contacts match your filters.", "Inga kontakter matchar dina filter.")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-surface shadow-sm">
            <div className="divide-y divide-zinc-100">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  onClick={() => router.push(`/contacts/${c.id}`)}
                  className="group flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-zinc-50"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStar(c.id);
                    }}
                    className="shrink-0 text-zinc-300 hover:text-amber-400"
                  >
                    <Star className={cn("h-4 w-4", c.starred && "fill-amber-400 text-amber-400")} />
                  </button>
                  <Avatar contact={c} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-900">{fullName(c)}</span>
                      {c.tags.slice(0, 2).map((t) => (
                        <Tag key={t} label={t} />
                      ))}
                    </div>
                    <div className="truncate text-xs text-zinc-400">
                      {[c.title, c.company].filter(Boolean).join(" · ") || c.email || "—"}
                    </div>
                  </div>

                  <div className="hidden min-w-0 flex-1 md:block">
                    {c.nextAction ? (
                      <div className="flex items-center gap-2">
                        <DueBadge date={c.nextActionDate} label={dueLabel(c.nextActionDate)} />
                        <span className="truncate text-xs text-zinc-500">{c.nextAction}</span>
                      </div>
                    ) : (
                      <span className="text-xs italic text-zinc-300">{t("No next action", "Ingen nästa åtgärd")}</span>
                    )}
                  </div>

                  <div className="hidden w-28 text-right text-sm tabular-nums text-zinc-600 lg:block">
                    {formatCurrency(c.value)}
                  </div>
                  <div className="w-32 shrink-0">
                    <StageBadge stage={c.stage} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openModal({ kind: "book-meeting", contactId: c.id });
                    }}
                    title={t("Book meeting", "Boka möte")}
                    className="shrink-0 rounded-md p-1.5 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200/70 hover:text-brand-600 group-hover:opacity-100"
                  >
                    <CalendarPlus className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
      )}
    >
      {children}
    </button>
  );
}
