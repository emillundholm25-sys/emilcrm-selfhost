"use client";

import { useMemo, useState } from "react";
import { Building2, Loader2, Search } from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useT } from "@/lib/i18n";
import { computeICP } from "@/lib/icp";
import { cn, matchesCampaign } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button, Field, inputClass } from "@/components/ui";

interface Company {
  orgnr: string;
  name: string;
  legalForm?: string;
  sni: { code: string; text: string }[];
  industry?: string;
  city?: string;
  postalCode?: string;
  street?: string;
  description?: string;
  active?: boolean;
  registeredAt?: string;
}
interface Fit {
  score: number;
  reasons: string[];
}

function scoreStyle(n: number): string {
  if (n >= 70) return "bg-brand-50 text-brand-700 border-brand-200";
  if (n >= 45) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-zinc-50 text-zinc-500 border-zinc-200";
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-32 shrink-0 text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-800">{value}</span>
    </div>
  );
}

export default function LookupPage() {
  const campaigns = useCRM((s) => s.campaigns);
  const contacts = useCRM((s) => s.contacts);
  const activeCampaignId = useUI((s) => s.activeCampaignId);
  const t = useT();

  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const [orgnr, setOrgnr] = useState("");
  const [campaignId, setCampaignId] = useState(
    activeCampaignId !== "all" && campaigns.some((c) => c.id === activeCampaignId) ? activeCampaignId : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const [notFound, setNotFound] = useState(false);

  // The industries/locations we score against, derived from the chosen campaign
  // (its defined ICP, or one learned from its contacts).
  const icpParams = useMemo(() => {
    const camp = campaigns.find((c) => c.id === campaignId);
    if (!camp) return { industries: [] as string[], locations: [] as string[] };
    if (camp.targetICP) return { industries: camp.targetICP.industries, locations: camp.targetICP.locations };
    const scoped = contacts.filter((c) => matchesCampaign(camp.id, c.campaignId));
    const p = computeICP(scoped);
    return { industries: p.industries.map((f) => f.value), locations: p.locations.map((f) => f.value) };
  }, [campaignId, campaigns, contacts]);

  async function search() {
    const q = orgnr.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setCompany(null);
    setFit(null);
    setNotFound(false);
    try {
      const params = new URLSearchParams({ orgnr: q });
      if (icpParams.industries.length) params.set("industries", icpParams.industries.join(","));
      if (icpParams.locations.length) params.set("locations", icpParams.locations.join(","));
      const res = await fetch(`/api/company-lookup?${params.toString()}`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || t("Lookup failed.", "Uppslaget misslyckades."));
        return;
      }
      if (!data.found) {
        setNotFound(true);
        return;
      }
      setCompany(data.company as Company);
      setFit((data.fit as Fit) ?? null);
    } catch {
      setError(t("Couldn't reach the service. Try again.", "Kunde inte nå tjänsten. Försök igen."));
    } finally {
      setLoading(false);
    }
  }

  const primarySni = company?.sni?.[0];
  const industryText = primarySni ? `${primarySni.text} (${primarySni.code})` : company?.industry;
  const statusText =
    company?.active == null ? undefined : company.active ? t("Active", "Aktiv") : t("Deregistered", "Avregistrerad");

  return (
    <>
      <PageHeader
        title={t("Company lookup", "Företagssök")}
        subtitle={t(
          "Look up any Swedish company in the Bolagsverket register and score it against a campaign",
          "Slå upp svenska företag i Bolagsverkets register och poängsätt mot en kampanj"
        )}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6">
          {/* Search form */}
          <section className="rounded-xl border border-zinc-200 bg-surface p-5 shadow-sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <Field label={t("Organisationsnummer", "Organisationsnummer")} className="flex-1">
                <input
                  value={orgnr}
                  onChange={(e) => setOrgnr(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={t("e.g. 556703-7485", "t.ex. 556703-7485")}
                  className={inputClass}
                />
              </Field>
              <Field label={t("Score against", "Poängsätt mot")} className="flex-1">
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className={cn(inputClass, "appearance-none")}
                >
                  <option value="">{t("No scoring", "Ingen poängsättning")}</option>
                  {activeCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" disabled={loading || !orgnr.trim()} className="sm:w-auto">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {t("Look up", "Slå upp")}
              </Button>
            </form>
            <p className="mt-3 text-xs text-zinc-400">
              {t(
                "Source: Bolagsverket — the official Swedish company register (free open data).",
                "Källa: Bolagsverket — det officiella svenska företagsregistret (fri öppen data)."
              )}
            </p>
          </section>

          {/* Result */}
          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
          )}
          {notFound && !error && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-surface p-4 text-sm text-zinc-500">
              {t("No company found for that number.", "Hittade inget företag för det numret.")}
            </div>
          )}
          {company && (
            <section className="mt-4 rounded-xl border border-zinc-200 bg-surface p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-zinc-900">{company.name}</h2>
                  <p className="text-xs text-zinc-400">{company.orgnr}</p>
                </div>
                {fit && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums",
                      scoreStyle(fit.score)
                    )}
                  >
                    {t("ICP fit", "ICP-träff")} {fit.score}/100
                  </span>
                )}
              </div>

              <div className="mt-4 border-t border-zinc-100 pt-3">
                <Row label={t("Industry", "Bransch")} value={industryText} />
                <Row label={t("Location", "Ort")} value={company.city} />
                <Row label={t("Legal form", "Bolagsform")} value={company.legalForm} />
                <Row label={t("Status", "Status")} value={statusText} />
                <Row label={t("Registered", "Registrerad")} value={company.registeredAt} />
              </div>

              {company.description && (
                <p className="mt-3 border-t border-zinc-100 pt-3 text-sm leading-relaxed text-zinc-600">
                  {company.description}
                </p>
              )}

              {fit && fit.reasons.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 border-t border-zinc-100 pt-3">
                  {fit.reasons.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-600">
                      <span className="text-brand-500">·</span>
                      {r}
                    </li>
                  ))}
                </ul>
              )}
              {fit && fit.reasons.length === 0 && (
                <p className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-400">
                  {t("No clear match to this campaign's ICP.", "Ingen tydlig matchning mot kampanjens ICP.")}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
