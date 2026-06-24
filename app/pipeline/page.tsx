"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { Contact, Stage, STAGES, STAGE_META, fullName } from "@/lib/types";
import { cn, dueLabel, formatCurrency, matchesCampaign } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Avatar, Button, DueBadge } from "@/components/ui";

export default function PipelinePage() {
  const allContacts = useCRM((s) => s.contacts);
  const setStage = useCRM((s) => s.setStage);
  const openModal = useUI((s) => s.openModal);
  const activeCampaignId = useUI((s) => s.activeCampaignId);
  const router = useRouter();
  const [dragOver, setDragOver] = useState<Stage | null>(null);

  const contacts = useMemo(
    () => allContacts.filter((c) => matchesCampaign(activeCampaignId, c.campaignId)),
    [allContacts, activeCampaignId]
  );

  const byStage = useMemo(() => {
    const map: Record<Stage, Contact[]> = {
      to_contact: [],
      contacted: [],
      scheduling: [],
      booked: [],
      met: [],
      follow_up: [],
      won: [],
      lost: [],
    };
    for (const c of contacts) map[c.stage].push(c);
    return map;
  }, [contacts]);

  const openValue = useMemo(
    () =>
      contacts
        .filter((c) => c.stage !== "lost" && c.stage !== "won")
        .reduce((sum, c) => sum + (c.value ?? 0), 0),
    [contacts]
  );
  const wonValue = useMemo(
    () => contacts.filter((c) => c.stage === "won").reduce((s, c) => s + (c.value ?? 0), 0),
    [contacts]
  );

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={`${formatCurrency(openValue)} open · ${formatCurrency(wonValue)} won`}
        actions={
          <Button onClick={() => openModal({ kind: "add-contact" })}>
            <Plus className="h-4 w-4" />
            Add contact
          </Button>
        }
      />

      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-zinc-50">
        <div className="flex h-full gap-3 px-6 py-5">
          {STAGES.map((stage) => {
            const items = byStage[stage];
            const meta = STAGE_META[stage];
            const colValue = items.reduce((s, c) => s + (c.value ?? 0), 0);
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(stage);
                }}
                onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) setStage(id, stage);
                  setDragOver(null);
                }}
                className={cn(
                  "flex h-full w-72 shrink-0 flex-col rounded-xl border bg-white/60 transition-colors",
                  dragOver === stage ? "border-brand-400 bg-brand-50/50" : "border-zinc-200"
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                    <h2 className="text-sm font-semibold text-zinc-700">{meta.label}</h2>
                    <span className="text-xs font-medium text-zinc-400">{items.length}</span>
                  </div>
                  {colValue > 0 && (
                    <span className="text-xs font-medium tabular-nums text-zinc-400">
                      {formatCurrency(colValue)}
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {items.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-zinc-300">Drop contacts here</p>
                  ) : (
                    items.map((c) => (
                      <article
                        key={c.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                        onClick={() => router.push(`/contacts/${c.id}`)}
                        className="cursor-grab rounded-lg border border-zinc-200 bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar contact={c} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-zinc-900">{fullName(c)}</div>
                            {c.company && <div className="truncate text-xs text-zinc-400">{c.company}</div>}
                          </div>
                        </div>
                        {c.nextAction && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <DueBadge date={c.nextActionDate} label={dueLabel(c.nextActionDate)} />
                            <span className="truncate text-xs text-zinc-500">{c.nextAction}</span>
                          </div>
                        )}
                        {c.value ? (
                          <div className="mt-2 text-xs font-medium tabular-nums text-zinc-500">
                            {formatCurrency(c.value)}
                          </div>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
