"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowRight, Pencil, Plus, Target, Users } from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useT } from "@/lib/i18n";
import { Campaign } from "@/lib/types";
import { campaignColorClasses, cn, formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui";

export default function CampaignsPage() {
  const campaigns = useCRM((s) => s.campaigns);
  const contacts = useCRM((s) => s.contacts);
  const meetings = useCRM((s) => s.meetings);
  const archiveCampaign = useCRM((s) => s.archiveCampaign);
  const openModal = useUI((s) => s.openModal);
  const setActiveCampaign = useUI((s) => s.setActiveCampaign);
  const toast = useUI((s) => s.toast);
  const t = useT();
  const router = useRouter();

  const stats = useMemo(() => {
    const m: Record<string, { count: number; open: number; won: number; meetings: number }> = {};
    for (const c of campaigns) m[c.id] = { count: 0, open: 0, won: 0, meetings: 0 };
    const campaignOf = new Map(contacts.map((c) => [c.id, c.campaignId]));
    for (const c of contacts) {
      const s = c.campaignId && m[c.campaignId];
      if (!s) continue;
      s.count += 1;
      if (c.stage === "won") s.won += c.value ?? 0;
      else if (c.stage !== "lost") s.open += c.value ?? 0;
    }
    for (const mt of meetings) {
      const cid = campaignOf.get(mt.contactId);
      if (cid && m[cid] && mt.status === "scheduled" && new Date(mt.start).getTime() >= Date.now()) {
        m[cid].meetings += 1;
      }
    }
    return m;
  }, [campaigns, contacts, meetings]);

  const sorted = [...campaigns].sort(
    (a, b) => Number(a.status === "archived") - Number(b.status === "archived")
  );

  const open = (c: Campaign) => {
    setActiveCampaign(c.id);
    router.push("/pipeline");
  };

  return (
    <>
      <PageHeader
        title={t("Campaigns", "Kampanjer")}
        subtitle={t(
          "Each campaign is a self-contained pipeline with its own ICP",
          "Varje kampanj är en egen pipeline med sin egen ICP"
        )}
        actions={
          <Button onClick={() => openModal({ kind: "campaign" })}>
            <Plus className="h-4 w-4" />
            {t("New campaign", "Ny kampanj")}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sorted.map((c) => {
              const cc = campaignColorClasses(c.color);
              const s = stats[c.id] ?? { count: 0, open: 0, won: 0, meetings: 0 };
              const icp = c.targetICP;
              return (
                <article
                  key={c.id}
                  className={cn(
                    "flex flex-col rounded-xl border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md",
                    c.status === "archived" ? "border-zinc-200 opacity-60" : cc.border
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => open(c)} className="flex min-w-0 items-center gap-2 text-left">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", cc.dot)} />
                      <span className="truncate text-sm font-semibold text-zinc-900">{c.name}</span>
                      {c.status === "archived" && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-400">
                          {t("Archived", "Arkiverad")}
                        </span>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => openModal({ kind: "campaign", campaignId: c.id })}
                        title={t("Edit", "Redigera")}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          archiveCampaign(c.id);
                          toast(c.status === "archived" ? t("Campaign restored", "Kampanj återställd") : t("Campaign archived", "Kampanj arkiverad"));
                        }}
                        title={c.status === "archived" ? t("Restore", "Återställ") : t("Archive", "Arkivera")}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {c.description && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{c.description}</p>}

                  <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-zinc-400" />
                      {s.count}
                    </span>
                    <span className="tabular-nums">{formatCurrency(s.open)} {t("open", "öppet")}</span>
                    {s.won > 0 && <span className="tabular-nums text-emerald-600">{formatCurrency(s.won)} {t("won", "vunnet")}</span>}
                    <span className="tabular-nums">{s.meetings} {t("mtg", "möten")}</span>
                  </div>

                  {icp && (icp.industries.length > 0 || icp.titles.length > 0) && (
                    <div className="mt-3 border-t border-zinc-100 pt-2.5">
                      <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                        <Target className="h-3 w-3" />
                        {t("Target ICP", "Mål-ICP")}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[...icp.industries, ...icp.companySizes, ...icp.locations].slice(0, 5).map((v) => (
                          <span key={v} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => open(c)}
                    className={cn(
                      "mt-3 inline-flex items-center gap-1 self-start text-xs font-medium hover:underline",
                      cc.text
                    )}
                  >
                    {t("Open pipeline", "Öppna pipeline")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
