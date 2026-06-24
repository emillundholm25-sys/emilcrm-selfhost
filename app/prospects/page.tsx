"use client";

import { useMemo } from "react";
import { Sparkles, Target, Plus, X, ExternalLink, Search, Copy } from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { ICPFacet, fullName } from "@/lib/types";
import { SearchRecipe, buildSearchRecipe, campaignICPToProfile, computeICP, scoreProspect } from "@/lib/icp";
import { cn, formatCurrency, matchesCampaign } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Avatar, Button, Tag } from "@/components/ui";

function scoreStyle(score: number): string {
  if (score >= 70) return "bg-brand-50 text-brand-700 border-brand-200";
  if (score >= 45) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-zinc-50 text-zinc-500 border-zinc-200";
}

export default function ProspectsPage() {
  const allContacts = useCRM((s) => s.contacts);
  const allProspects = useCRM((s) => s.prospects);
  const campaigns = useCRM((s) => s.campaigns);
  const addProspectToPipeline = useCRM((s) => s.addProspectToPipeline);
  const dismissProspect = useCRM((s) => s.dismissProspect);
  const openModal = useUI((s) => s.openModal);
  const toast = useUI((s) => s.toast);
  const activeCampaignId = useUI((s) => s.activeCampaignId);

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);
  const usingTarget = !!activeCampaign?.targetICP;

  const icp = useMemo(() => {
    if (activeCampaign?.targetICP) return campaignICPToProfile(activeCampaign.targetICP);
    const scoped = allContacts.filter((c) => matchesCampaign(activeCampaignId, c.campaignId));
    return computeICP(scoped);
  }, [activeCampaign, allContacts, activeCampaignId]);
  const recipe = useMemo(() => buildSearchRecipe(icp), [icp]);

  const prospects = useMemo(
    () => allProspects.filter((p) => matchesCampaign(activeCampaignId, p.campaignId)),
    [allProspects, activeCampaignId]
  );

  const ranked = useMemo(() => {
    return prospects
      .filter((p) => p.status === "suggested")
      .map((p) => ({ prospect: p, ...scoreProspect(p, icp) }))
      .sort((a, b) => b.score - a.score);
  }, [prospects, icp]);

  const addedCount = prospects.filter((p) => p.status === "added").length;
  const hasSamples = ranked.some((r) => r.prospect.source === "sample");

  return (
    <>
      <PageHeader
        title="Prospects"
        subtitle="Find lookalikes of your best contacts, then work them into the pipeline"
        actions={
          <Button onClick={() => openModal({ kind: "import-prospect" })}>
            <Sparkles className="h-4 w-4" />
            Import from Apollo
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          {/* ICP summary */}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Target className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Ideal Customer Profile{activeCampaign ? ` · ${activeCampaign.name}` : ""}
                </h2>
                <p className="text-xs text-zinc-500">
                  {usingTarget ? (
                    <>Defined target for this campaign — edit it on the Campaigns page</>
                  ) : (
                    <>
                      Learned from {icp.sampleSize} contact{icp.sampleSize === 1 ? "" : "s"}, weighted toward
                      your booked &amp; won deals
                      {icp.avgValue > 0 && <> · avg value {formatCurrency(icp.avgValue)}</>}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FacetGroup label="Top industries" facets={icp.industries} />
              <FacetGroup label="Company size" facets={icp.companySizes} suffix=" emp" />
              <FacetGroup label="Locations" facets={icp.locations} />
              <FacetGroup label="Common roles" facets={icp.titleKeywords} capitalize />
            </div>
          </section>

          {/* Search recipe — the real discovery driver */}
          <SearchRecipeCard
            recipe={recipe}
            onCopied={() => toast("Filters copied")}
            onImport={() => openModal({ kind: "import-prospect" })}
          />

          {/* Candidate list */}
          <div className="mt-6 mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Lookalike candidates ({ranked.length})
            </h2>
            {addedCount > 0 && <span className="text-xs text-zinc-400">{addedCount} added to pipeline</span>}
          </div>
          {hasSamples && (
            <p className="mb-3 text-xs text-zinc-400">
              The starter set is sample companies to show how scoring works — real candidates come from your
              Apollo searches above (or Claude-in-Chrome).
            </p>
          )}

          {ranked.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-14 text-center">
              <Search className="h-6 w-6 text-zinc-300" />
              <h3 className="mt-3 text-sm font-semibold text-zinc-900">No candidates queued</h3>
              <p className="mt-1 max-w-sm text-sm text-zinc-500">
                Run the search above in Apollo or LinkedIn, then <strong>Import</strong> the matches — or let
                Claude-in-Chrome push them in with{" "}
                <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs text-zinc-600">window.emilCRM.addProspect()</code>.
              </p>
              <Button className="mt-4" onClick={() => openModal({ kind: "import-prospect" })}>
                <Sparkles className="h-4 w-4" />
                Import a prospect
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {ranked.map(({ prospect, score, reasons }) => (
                <article
                  key={prospect.id}
                  className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border text-center",
                      scoreStyle(score)
                    )}
                  >
                    <span className="text-sm font-bold leading-none tabular-nums">{score}</span>
                    <span className="text-[9px] font-medium uppercase tracking-wide opacity-70">match</span>
                  </div>

                  <Avatar contact={prospect} size="md" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-900">{fullName(prospect)}</span>
                      {prospect.source === "sample" && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                          Sample
                        </span>
                      )}
                      {prospect.linkedinUrl && (
                        <a
                          href={prospect.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-300 hover:text-brand-600"
                          title="LinkedIn"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {[prospect.title, prospect.company].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {prospect.industry && <Tag label={prospect.industry} />}
                      {prospect.companySize && <Tag label={`${prospect.companySize} emp`} />}
                      {prospect.location && <Tag label={prospect.location} />}
                    </div>
                    {reasons.length > 0 && (
                      <p className="mt-1.5 truncate text-xs text-brand-700">{reasons.slice(0, 3).join(" · ")}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => {
                        addProspectToPipeline(prospect.id);
                        toast(`${fullName(prospect)} added to pipeline`);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add to pipeline
                    </Button>
                    <button
                      onClick={() => dismissProspect(prospect.id)}
                      title="Dismiss"
                      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SearchRecipeCard({
  recipe,
  onCopied,
  onImport,
}: {
  recipe: SearchRecipe;
  onCopied: () => void;
  onImport: () => void;
}) {
  return (
    <section className="mt-4 rounded-xl border border-brand-200 bg-brand-50/40 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 ring-1 ring-brand-200">
          <Search className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-zinc-900">Find more lookalikes</h2>
          <p className="text-xs text-zinc-500">
            Run this search in Apollo or LinkedIn, then import the matches. The app derives the targeting; Apollo
            does the finding.
          </p>
        </div>
      </div>

      {!recipe.hasSignal ? (
        <p className="mt-4 text-sm text-zinc-500">
          Add a few contacts and book some meetings first — once there&apos;s signal, a targeted search appears here.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RecipeRow label="Industry" values={recipe.industries} />
            <RecipeRow label="Company size" values={recipe.sizes.map((s) => `${s} emp`)} />
            <RecipeRow label="Location" values={recipe.locations} />
            <RecipeRow label="Titles" values={recipe.titles} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                navigator.clipboard?.writeText(recipe.copyText).then(onCopied, () => {});
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy filters
            </Button>
            <a
              href={recipe.apolloUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Apollo People Search
              <ExternalLink className="h-3 w-3 text-zinc-400" />
            </a>
            <a
              href={recipe.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              LinkedIn search
              <ExternalLink className="h-3 w-3 text-zinc-400" />
            </a>
            <Button size="sm" onClick={onImport}>
              <Sparkles className="h-3.5 w-3.5" />
              Import results
            </Button>
          </div>
          <p className="mt-2.5 text-xs text-zinc-400">
            Or have Claude-in-Chrome run the search and push matches in with{" "}
            <code className="rounded bg-white px-1 py-0.5 text-zinc-600">window.emilCRM.addProspect(&#123;…&#125;)</code>.
          </p>
        </>
      )}
    </section>
  );
}

function RecipeRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-zinc-400">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium capitalize text-zinc-700"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function FacetGroup({
  label,
  facets,
  suffix = "",
  capitalize,
}: {
  label: string;
  facets: ICPFacet[];
  suffix?: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-zinc-400">{label}</div>
      {facets.length === 0 ? (
        <span className="text-xs text-zinc-300">Not enough data</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {facets.map((f) => (
            <span
              key={f.value}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700",
                capitalize && "capitalize"
              )}
            >
              {f.value}
              {suffix}
              <span className="text-[10px] font-semibold text-brand-600 tabular-nums">
                {Math.round(f.weight * 100)}%
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
