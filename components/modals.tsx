"use client";

import { useState } from "react";
import { AlertTriangle, Download, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useT, STAGE_LABEL_SV } from "@/lib/i18n";
import { EmailTemplate, MeetingType, STAGES, STAGE_META, Stage, fullName } from "@/lib/types";
import { parseEnrichment, parseLinkedInUrl } from "@/lib/apollo-parse";
import { DEFAULT_EMAIL_TEMPLATE, MERGE_FIELDS, blankTemplate, campaignTemplates } from "@/lib/templates";
import { BackupData, downloadBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { CAMPAIGN_COLORS, campaignColorClasses, cn, dateOffset, dedupePhones, todayISODate, uid } from "@/lib/utils";
import { Button, Field, inputClass } from "./ui";
import { Modal } from "./modal";

/** Renders whichever modal the UI store has open. Mounted once in the shell. */
export function ModalHost() {
  const modal = useUI((s) => s.modal);
  if (modal.kind === "none") return null;
  if (modal.kind === "add-contact") return <AddContactModal />;
  if (modal.kind === "edit-contact") return <EditContactModal contactId={modal.contactId} />;
  if (modal.kind === "import-prospect") return <ImportProspectModal />;
  if (modal.kind === "campaign") return <CampaignModal campaignId={modal.campaignId} />;
  if (modal.kind === "next-action") return <NextActionModal contactId={modal.contactId} />;
  if (modal.kind === "book-meeting") return <BookMeetingModal contactId={modal.contactId} />;
  if (modal.kind === "data-backup") return <DataBackupModal />;
  return null;
}

function DataBackupModal() {
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const setActiveCampaign = useUI((s) => s.setActiveCampaign);
  const clearAll = useCRM((s) => s.clearAll);
  const t = useT();
  // Swedish plural forms for the count lines.
  const counts = (n: number, sv: string) => `${n} ${sv}`;

  // Live counts for the "what's in here" line.
  const contacts = useCRM((s) => s.contacts);
  const meetings = useCRM((s) => s.meetings);
  const prospects = useCRM((s) => s.prospects);
  const campaigns = useCRM((s) => s.campaigns);

  const [staged, setStaged] = useState<{ data: BackupData; name: string } | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const onFile = async (file: File) => {
    setRestoreError(null);
    const data = parseBackup(await file.text());
    if (!data) {
      setStaged(null);
      setRestoreError(t("That doesn't look like an EmilCRM backup file.", "Det där ser inte ut som en EmilCRM-backupfil."));
      return;
    }
    setStaged({ data, name: file.name });
  };

  const doRestore = () => {
    if (!staged) return;
    restoreBackup(staged.data);
    setActiveCampaign("all");
    toast(t("Backup restored", "Backup återställd"));
    close();
  };

  const doClear = () => {
    clearAll();
    setActiveCampaign("all");
    toast(t("All data cleared", "All data rensad"));
    close();
  };

  return (
    <Modal title={t("Data & backup", "Data & backup")} subtitle={t("Export, restore, or wipe your CRM", "Exportera, återställ eller rensa ditt CRM")} onClose={close}>
      {/* Download */}
      <div className="rounded-lg border border-zinc-200 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-zinc-900">{t("Download backup", "Ladda ner backup")}</div>
          <Button
            variant="secondary"
            onClick={() => {
              downloadBackup();
              toast(t("Backup downloaded", "Backup nedladdad"));
            }}
          >
            <Download className="h-4 w-4" />
            {t("Download", "Ladda ner")}
          </Button>
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {t(plural(contacts.length, "contact"), counts(contacts.length, "kontakter"))} · {t(plural(meetings.length, "meeting"), counts(meetings.length, "möten"))} ·{" "}
          {t(plural(prospects.length, "prospect"), counts(prospects.length, "prospekt"))} · {t(plural(campaigns.length, "campaign"), counts(campaigns.length, "kampanjer"))}
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          {t("Saves everything to a JSON file on this device. Keep it safe — you can restore it below.", "Sparar allt till en JSON-fil på den här enheten. Spara den säkert — du kan återställa den nedan.")}
        </p>
      </div>

      {/* Restore */}
      <div className="mt-3 rounded-lg border border-zinc-200 p-3">
        <div className="text-sm font-medium text-zinc-900">{t("Restore from backup", "Återställ från backup")}</div>
        <p className="mt-0.5 text-xs text-zinc-500">{t("Replaces all current data with a backup file's contents.", "Ersätter all nuvarande data med innehållet i en backup-fil.")}</p>
        <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-surface px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
          <Upload className="h-3.5 w-3.5 text-zinc-400" />
          {t("Choose file…", "Välj fil…")}
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {restoreError && <p className="mt-2 text-xs text-rose-600">{restoreError}</p>}
        {staged && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
            <div className="text-xs text-amber-800">
              <span className="font-semibold">{staged.name}</span> — {t(plural(staged.data.contacts.length, "contact"), counts(staged.data.contacts.length, "kontakter"))},{" "}
              {t(plural(staged.data.meetings.length, "meeting"), counts(staged.data.meetings.length, "möten"))}, {t(plural(staged.data.prospects.length, "prospect"), counts(staged.data.prospects.length, "prospekt"))},{" "}
              {t(plural(staged.data.campaigns.length, "campaign"), counts(staged.data.campaigns.length, "kampanjer"))}. {t("This replaces everything currently in the app.", "Detta ersätter allt som finns i appen just nu.")}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStaged(null)}>
                {t("Cancel", "Avbryt")}
              </Button>
              <Button size="sm" onClick={doRestore}>
                {t("Replace all data", "Ersätt all data")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-rose-700">
          <AlertTriangle className="h-4 w-4" />
          {t("Danger zone", "Farlig zon")}
        </div>
        <p className="mt-0.5 text-xs text-rose-600/90">
          {t("Permanently delete all contacts, meetings, prospects and campaigns. This can't be undone — download a backup first.", "Radera permanent alla kontakter, möten, prospekt och kampanjer. Detta går inte att ångra — ladda ner en backup först.")}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {t("Type", "Skriv")} <span className="font-mono font-semibold text-zinc-700">DELETE</span> {t("to confirm.", "för att bekräfta.")}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className={cn(inputClass, "max-w-[160px]")}
          />
          <Button variant="danger" onClick={doClear} disabled={confirmText !== "DELETE"}>
            <Trash2 className="h-4 w-4" />
            {t("Clear all data", "Rensa all data")}
          </Button>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={close}>
          {t("Done", "Klar")}
        </Button>
      </div>
    </Modal>
  );
}

function splitList(s: string): string[] {
  return s.split(",").map((t) => t.trim()).filter(Boolean);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function CampaignModal({ campaignId }: { campaignId?: string }) {
  const campaigns = useCRM((s) => s.campaigns);
  const addCampaign = useCRM((s) => s.addCampaign);
  const updateCampaign = useCRM((s) => s.updateCampaign);
  const addProspect = useCRM((s) => s.addProspect);
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const setActiveCampaign = useUI((s) => s.setActiveCampaign);
  const tr = useT();

  const existing = campaignId ? campaigns.find((c) => c.id === campaignId) : undefined;
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [color, setColor] = useState(existing?.color ?? CAMPAIGN_COLORS[campaigns.length % CAMPAIGN_COLORS.length]);
  const [industries, setIndustries] = useState((existing?.targetICP?.industries ?? []).join(", "));
  const [sizes, setSizes] = useState((existing?.targetICP?.companySizes ?? []).join(", "));
  const [locations, setLocations] = useState((existing?.targetICP?.locations ?? []).join(", "));
  const [titles, setTitles] = useState((existing?.targetICP?.titles ?? []).join(", "));
  const [templates, setTemplates] = useState<EmailTemplate[]>(() => campaignTemplates(existing));
  const [bulk, setBulk] = useState("");

  const addTemplate = (t?: EmailTemplate) =>
    setTemplates((ts) => [...ts, t ?? blankTemplate(`Template ${ts.length + 1}`)]);
  const updateTemplate = (id: string, patch: Partial<EmailTemplate>) =>
    setTemplates((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeTemplate = (id: string) => setTemplates((ts) => ts.filter((t) => t.id !== id));

  const submit = () => {
    if (!name.trim()) return;
    const targetICP = {
      industries: splitList(industries),
      companySizes: splitList(sizes),
      locations: splitList(locations),
      titles: splitList(titles),
    };
    const hasICP = targetICP.industries.length || targetICP.companySizes.length || targetICP.locations.length || targetICP.titles.length;
    // Keep templates with any content; drop fully-empty rows. Name falls back.
    const emailTemplates = templates
      .filter((t) => t.name.trim() || t.subject.trim() || t.body.trim())
      .map((t, i) => ({
        id: t.id,
        name: t.name.trim() || `Template ${i + 1}`,
        subject: t.subject.trim(),
        body: t.body.trim(),
      }));
    const templatesPatch = emailTemplates.length ? emailTemplates : undefined;

    if (isEdit && existing) {
      updateCampaign(existing.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        targetICP: hasICP ? targetICP : undefined,
        emailTemplates: templatesPatch,
      });
      toast(tr("Campaign updated", "Kampanj uppdaterad"));
      close();
      return;
    }

    const id = addCampaign({
      name,
      description,
      color,
      targetICP: hasICP ? targetICP : undefined,
      emailTemplates: templatesPatch,
    });

    // Optional: bulk-import prospects into this campaign (one per line:
    // "First Last, Company, Title, Industry, Location").
    let imported = 0;
    for (const line of bulk.split(/\n+/)) {
      const parts = splitList(line);
      if (parts.length === 0) continue;
      const hasName = parts.length >= 2;
      const nameTokens = (hasName ? parts[0] : "").split(/\s+/);
      addProspect({
        firstName: hasName ? nameTokens[0] || "Unknown" : "—",
        lastName: hasName ? nameTokens.slice(1).join(" ") : "",
        company: hasName ? parts[1] : parts[0],
        title: parts[2],
        industry: parts[3] || targetICP.industries[0],
        location: parts[4] || targetICP.locations[0],
        campaignId: id,
        source: "manual",
      });
      imported += 1;
    }

    setActiveCampaign(id);
    toast(imported > 0 ? tr(`Campaign created · ${imported} prospect${imported > 1 ? "s" : ""} added`, `Kampanj skapad · ${imported} prospekt tillagda`) : tr("Campaign created", "Kampanj skapad"));
    close();
  };

  return (
    <Modal
      title={isEdit ? tr("Edit campaign", "Redigera kampanj") : tr("New campaign", "Ny kampanj")}
      subtitle={isEdit ? existing?.name : tr("Each campaign gets its own pipeline and ICP", "Varje kampanj får sin egen pipeline och ICP")}
      onClose={close}
      size="lg"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={tr("Campaign name", "Kampanjnamn")} className="sm:col-span-2">
          <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Skåne Hospitality Q3" />
        </Field>
        <Field label={tr("Description", "Beskrivning")} className="sm:col-span-2">
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Hotels, spa & restauranger i Skåne" />
        </Field>
        <Field label={tr("Color", "Färg")} className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {CAMPAIGN_COLORS.map((cc) => (
              <button
                key={cc}
                type="button"
                onClick={() => setColor(cc)}
                className={cn(
                  "h-7 w-7 rounded-full ring-2 ring-offset-2 transition-transform",
                  campaignColorClasses(cc).dot,
                  color === cc ? "ring-zinc-400 scale-110" : "ring-transparent"
                )}
                aria-label={cc}
              />
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {tr("Target ICP (optional)", "Mål-ICP (valfritt)")}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={tr("Industries", "Branscher")}>
            <input className={inputClass} value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="Hotell, Restauranger" />
          </Field>
          <Field label={tr("Company sizes", "Företagsstorlekar")}>
            <input className={inputClass} value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="11-50, 51-200" />
          </Field>
          <Field label={tr("Locations", "Orter")}>
            <input className={inputClass} value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Lund, SE; Malmö, SE" />
          </Field>
          <Field label={tr("Titles", "Titlar")}>
            <input className={inputClass} value={titles} onChange={(e) => setTitles(e.target.value)} placeholder="Ägare, Marknadschef" />
          </Field>
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">{tr("Comma-separated. Drives prospect scoring for this campaign.", "Kommaseparerat. Styr poängsättningen av prospekt för kampanjen.")}</p>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {tr("Intro email templates (optional)", "Intromejl-mallar (valfritt)")}
          </div>
          <button
            type="button"
            onClick={() => addTemplate({ ...DEFAULT_EMAIL_TEMPLATE, id: uid(), name: "Intro" })}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {tr("Add sample", "Lägg till exempel")}
          </button>
        </div>

        {templates.length === 0 ? (
          <p className="text-xs text-zinc-400">
            {tr("No templates yet. Add one and each contact gets a personalised draft — they pick a template and send it from their page.", "Inga mallar än. Lägg till en så får varje kontakt ett personligt utkast — välj mall och skicka från deras sida.")}
          </p>
        ) : (
          <div className="space-y-3">
            {templates.map((t, i) => (
              <div key={t.id} className="rounded-lg border border-zinc-200 bg-surface p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    className={cn(inputClass, "h-8 flex-1 font-medium")}
                    value={t.name}
                    onChange={(e) => updateTemplate(t.id, { name: e.target.value })}
                    placeholder={`Template ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeTemplate(t.id)}
                    title={tr("Remove template", "Ta bort mall")}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  className={cn(inputClass, "mt-2")}
                  value={t.subject}
                  onChange={(e) => updateTemplate(t.id, { subject: e.target.value })}
                  placeholder={DEFAULT_EMAIL_TEMPLATE.subject}
                />
                <textarea
                  rows={6}
                  value={t.body}
                  onChange={(e) => updateTemplate(t.id, { body: e.target.value })}
                  placeholder={DEFAULT_EMAIL_TEMPLATE.body}
                  className={cn(inputClass, "mt-2 h-auto resize-none py-2 leading-relaxed")}
                />
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => addTemplate()}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          {tr("Add template", "Lägg till mall")}
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-zinc-200 pt-2.5">
          <span className="text-xs text-zinc-400">{tr("Merge fields:", "Sammanfogningsfält:")}</span>
          {MERGE_FIELDS.map((f) => (
            <code key={f} className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-zinc-600 ring-1 ring-zinc-200">
              {`{{${f}}}`}
            </code>
          ))}
        </div>
      </div>

      {!isEdit && (
        <Field label={tr("Import prospects (optional)", "Importera prospekt (valfritt)")} className="mt-3">
          <textarea
            rows={4}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={tr("One per line:  First Last, Company, Title, Industry, Location\nKlara Sjöberg, Hotel Duxiana, Marketing Director, Hospitality, Lund", "En per rad:  Förnamn Efternamn, Företag, Titel, Bransch, Ort\nKlara Sjöberg, Hotel Duxiana, Marknadschef, Hotell, Lund")}
            className={cn(inputClass, "h-auto resize-none py-2 font-mono text-xs leading-relaxed")}
          />
        </Field>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          {tr("Cancel", "Avbryt")}
        </Button>
        <Button onClick={submit} disabled={!name.trim()}>
          {isEdit ? tr("Save changes", "Spara ändringar") : tr("Create campaign", "Skapa kampanj")}
        </Button>
      </div>
    </Modal>
  );
}

function AddContactModal() {
  const addContact = useCRM((s) => s.addContact);
  const campaigns = useCRM((s) => s.campaigns);
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const activeCampaignId = useUI((s) => s.activeCampaignId);
  const t = useT();

  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hqPhone, setHqPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [location, setLocation] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [campaignId, setCampaignId] = useState(
    activeCampaignId !== "all" ? activeCampaignId : activeCampaigns[0]?.id ?? ""
  );
  const [stage, setStage] = useState<Stage>("to_contact");
  const [value, setValue] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState(todayISODate());
  const [tags, setTags] = useState("");

  const submit = () => {
    if (!firstName.trim()) return;
    addContact({
      firstName,
      lastName,
      company,
      title,
      email,
      phone,
      hqPhone,
      industry,
      companySize,
      location,
      linkedinUrl,
      campaignId: campaignId || undefined,
      stage,
      value: value ? Number(value) : undefined,
      nextAction: nextAction || undefined,
      nextActionDate: nextAction ? nextActionDate : undefined,
      tags: splitList(tags),
    });
    toast(t(`${firstName} ${lastName} added`.trim(), `${firstName} ${lastName} tillagd`.trim()));
    close();
  };

  return (
    <Modal title={t("Add contact", "Lägg till kontakt")} subtitle={t("Drop a new lead into the pipeline", "Lägg in ett nytt lead i pipelinen")} onClose={close} size="lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("First name", "Förnamn")}>
          <input autoFocus className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Astrid" />
        </Field>
        <Field label={t("Last name", "Efternamn")}>
          <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Bergström" />
        </Field>
        <Field label={t("Company", "Företag")}>
          <input className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Grand Hotel Lund" />
        </Field>
        <Field label={t("Title", "Titel")}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Marknadschef" />
        </Field>
        <Field label={t("Email", "E-post")}>
          <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@foretag.se" />
        </Field>
        <Field label={t("Phone", "Telefon")}>
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+46 70 000 00 00" />
        </Field>
        <Field label={t("HQ / main line", "Växel / huvudnummer")}>
          <input className={inputClass} value={hqPhone} onChange={(e) => setHqPhone(e.target.value)} placeholder="+46 46 280 00 00" />
        </Field>
        <Field label={t("Industry", "Bransch")}>
          <input className={inputClass} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Hotell" />
        </Field>
        <Field label={t("Company size", "Företagsstorlek")}>
          <select className={inputClass} value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
            <option value="">—</option>
            {["1-10", "11-50", "51-200", "201-1000", "1000+"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Location", "Ort")}>
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lund, SE" />
        </Field>
        <Field label={t("LinkedIn URL", "LinkedIn-URL")}>
          <input className={inputClass} value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/…" />
        </Field>
        {activeCampaigns.length > 0 && (
          <Field label={t("Campaign", "Kampanj")}>
            <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {activeCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t("Pipeline stage", "Pipeline-steg")}>
          <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {t(STAGE_META[s].label, STAGE_LABEL_SV[s])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Potential value (SEK)", "Potentiellt värde (SEK)")}>
          <input type="number" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} placeholder="12000" />
        </Field>
        <Field label={t("Tags (comma separated)", "Taggar (kommaseparerade)")} className="sm:col-span-2">
          <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Hotell, Het lead" />
        </Field>
        <Field label={t("Next action", "Nästa åtgärd")} className="sm:col-span-2">
          <input className={inputClass} value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder={t("Send intro email with portfolio", "Skicka intromejl med portfölj")} />
        </Field>
        {nextAction && (
          <Field label={t("Due date", "Datum")}>
            <input type="date" className={inputClass} value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          {t("Cancel", "Avbryt")}
        </Button>
        <Button onClick={submit} disabled={!firstName.trim()}>
          {t("Add contact", "Lägg till kontakt")}
        </Button>
      </div>
    </Modal>
  );
}

function EditContactModal({ contactId }: { contactId: string }) {
  const contact = useCRM((s) => s.contacts.find((c) => c.id === contactId));
  const campaigns = useCRM((s) => s.campaigns);
  const updateContact = useCRM((s) => s.updateContact);
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const t = useT();

  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const [firstName, setFirstName] = useState(contact?.firstName ?? "");
  const [lastName, setLastName] = useState(contact?.lastName ?? "");
  const [company, setCompany] = useState(contact?.company ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phones, setPhones] = useState(
    (contact?.phones ?? (contact?.phone ? [contact.phone] : [])).join(", ")
  );
  const [hqPhone, setHqPhone] = useState(contact?.hqPhone ?? "");
  const [industry, setIndustry] = useState(contact?.industry ?? "");
  const [companySize, setCompanySize] = useState(contact?.companySize ?? "");
  const [location, setLocation] = useState(contact?.location ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(contact?.linkedinUrl ?? "");
  const [campaignId, setCampaignId] = useState(contact?.campaignId ?? "");
  const [value, setValue] = useState(contact?.value != null ? String(contact.value) : "");
  const [tags, setTags] = useState((contact?.tags ?? []).join(", "));

  if (!contact) return null;

  const submit = () => {
    if (!firstName.trim()) return;
    const phoneList = dedupePhones(splitList(phones));
    updateContact(contact.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company: company.trim() || undefined,
      title: title.trim() || undefined,
      email: email.trim() || undefined,
      phone: phoneList[0],
      phones: phoneList.length ? phoneList : undefined,
      hqPhone: hqPhone.trim() || undefined,
      industry: industry.trim() || undefined,
      companySize: companySize || undefined,
      location: location.trim() || undefined,
      linkedinUrl: linkedinUrl.trim() || undefined,
      campaignId: campaignId || undefined,
      value: value ? Number(value) : undefined,
      tags: splitList(tags),
    });
    toast(t("Contact updated", "Kontakt uppdaterad"));
    close();
  };

  return (
    <Modal title={t("Edit contact", "Redigera kontakt")} subtitle={fullName(contact)} onClose={close} size="lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("First name", "Förnamn")}>
          <input autoFocus className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label={t("Last name", "Efternamn")}>
          <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label={t("Company", "Företag")}>
          <input className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label={t("Title", "Titel")}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t("Email", "E-post")}>
          <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t("Phone(s)", "Telefon(er)")}>
          <input
            className={inputClass}
            value={phones}
            onChange={(e) => setPhones(e.target.value)}
            placeholder="+46 70…, +46 40…"
          />
        </Field>
        <Field label={t("HQ / main line", "Växel / huvudnummer")}>
          <input className={inputClass} value={hqPhone} onChange={(e) => setHqPhone(e.target.value)} />
        </Field>
        <Field label={t("Industry", "Bransch")}>
          <input className={inputClass} value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </Field>
        <Field label={t("Company size", "Företagsstorlek")}>
          <select className={inputClass} value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
            <option value="">—</option>
            {["1-10", "11-50", "51-200", "201-1000", "1000+"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Location", "Ort")}>
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label={t("LinkedIn URL", "LinkedIn-URL")}>
          <input className={inputClass} value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
        </Field>
        {activeCampaigns.length > 0 && (
          <Field label={t("Campaign", "Kampanj")}>
            <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {activeCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t("Potential value (SEK)", "Potentiellt värde (SEK)")}>
          <input type="number" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label={t("Tags (comma separated)", "Taggar (kommaseparerade)")} className="sm:col-span-2">
          <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Hotell, Het lead" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          {t("Cancel", "Avbryt")}
        </Button>
        <Button onClick={submit} disabled={!firstName.trim()}>
          {t("Save changes", "Spara ändringar")}
        </Button>
      </div>
    </Modal>
  );
}

const SAMPLE_APOLLO = `{
  "first_name": "Klara",
  "last_name": "Sjöberg",
  "title": "Marketing Director",
  "email": "klara@duxiana-hotel.se",
  "linkedin_url": "https://www.linkedin.com/in/klara-sjoberg",
  "city": "Lund",
  "country": "Sweden",
  "organization": {
    "name": "Hotel Duxiana",
    "industry": "Hospitality",
    "estimated_num_employees": 80
  }
}`;

function ImportProspectModal() {
  const importEnrichment = useCRM((s) => s.importEnrichment);
  const importLinkedInUrl = useCRM((s) => s.importLinkedInUrl);
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const t = useT();

  const [mode, setMode] = useState<"data" | "url">("data");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const preview = mode === "data" ? parseEnrichment(text) : parseLinkedInUrl(url);
  const phoneCount = (preview?.phones?.length ?? 0) + (preview?.hqPhone ? 1 : 0);

  const submit = () => {
    const id = mode === "data" ? importEnrichment(text) : importLinkedInUrl(url);
    if (!id) {
      toast(mode === "url" ? t("Not a valid LinkedIn URL", "Inte en giltig LinkedIn-URL") : t("Couldn't read that — check the format", "Kunde inte läsa det — kontrollera formatet"));
      return;
    }
    toast(t("Prospect imported into the pipeline", "Prospekt importerat till pipelinen"));
    close();
  };

  return (
    <Modal
      title={t("Import prospect", "Importera prospekt")}
      subtitle={t("From an Apollo / LinkedIn enrichment, or just a LinkedIn URL", "Från en Apollo- / LinkedIn-berikning, eller bara en LinkedIn-URL")}
      onClose={close}
      size="lg"
    >
      {/* Mode toggle */}
      <div className="mb-3 inline-flex rounded-lg border border-zinc-200 p-0.5">
        {([
          { v: "data", label: t("Paste data", "Klistra in data") },
          { v: "url", label: t("LinkedIn URL", "LinkedIn-URL") },
        ] as const).map((o) => (
          <button
            key={o.v}
            onClick={() => setMode(o.v)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              mode === o.v ? "bg-brand-600 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-50"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {mode === "data" ? (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">{t("Enrichment data (Apollo JSON or text)", "Berikningsdata (Apollo-JSON eller text)")}</span>
            <button
              onClick={() => setText(SAMPLE_APOLLO)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("Paste sample", "Klistra in exempel")}
            </button>
          </div>
          <textarea
            autoFocus
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("Paste Apollo person JSON (with phone_numbers + organization), or lines like\nName: Klara Sjöberg\nTitle: Marketing Director\nCompany: Hotel Duxiana\nPhone: +46 70 123 45 67\nHQ: +46 46 280 00 00", "Klistra in Apollo-person-JSON (med phone_numbers + organization), eller rader som\nNamn: Klara Sjöberg\nTitel: Marknadschef\nFöretag: Hotel Duxiana\nTelefon: +46 70 123 45 67\nVäxel: +46 46 280 00 00")}
            className={cn(inputClass, "h-auto resize-none py-2 font-mono text-xs leading-relaxed")}
          />
        </>
      ) : (
        <>
          <span className="text-xs font-medium text-zinc-500">{t("LinkedIn profile or company URL", "LinkedIn-profil eller företags-URL")}</span>
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.linkedin.com/in/klara-sjoberg"
            className={cn(inputClass, "mt-1")}
          />
          <p className="mt-2 text-xs text-zinc-400">
            {t("The URL creates a stub with a name + an enrich next action. Phone numbers, email and title come from running Apollo / Claude-in-Chrome on the profile.", "URL:en skapar en stub med ett namn + en berika-åtgärd. Telefonnummer, e-post och titel kommer från att köra Apollo / Claude-in-Chrome på profilen.")}
          </p>
        </>
      )}

      {preview && (
        <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">{t("Preview", "Förhandsvisning")}</div>
          <div className="font-semibold text-zinc-900">
            {`${preview.firstName} ${preview.lastName}`.trim() || preview.company || "—"}
          </div>
          <div className="text-xs text-zinc-500">
            {[preview.title, preview.company].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-zinc-500">
            {preview.industry && <span className="rounded bg-surface px-1.5 py-0.5">{preview.industry}</span>}
            {preview.companySize && <span className="rounded bg-surface px-1.5 py-0.5">{preview.companySize}{t(" emp", " anst")}</span>}
            {preview.location && <span className="rounded bg-surface px-1.5 py-0.5">{preview.location}</span>}
            {preview.email && <span className="rounded bg-surface px-1.5 py-0.5">{preview.email}</span>}
          </div>
          {phoneCount > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              {(preview.phones ?? []).map((p) => (
                <span key={p} className="rounded bg-surface px-1.5 py-0.5 text-zinc-700">
                  {p}
                </span>
              ))}
              {preview.hqPhone && (
                <span className="rounded bg-surface px-1.5 py-0.5 text-zinc-700">{t("HQ", "Växel")}: {preview.hqPhone}</span>
              )}
            </div>
          )}
          {mode === "url" && (
            <p className="mt-1.5 text-xs text-amber-600">{t("Stub only — enrich for phone/email/title.", "Endast stub — berika för telefon/e-post/titel.")}</p>
          )}
        </div>
      )}
      {((mode === "data" && text.trim()) || (mode === "url" && url.trim())) && !preview && (
        <p className="mt-2 text-xs text-rose-600">
          {mode === "url" ? t("Doesn't look like a LinkedIn URL.", "Ser inte ut som en LinkedIn-URL.") : t("Couldn't find a name or company in that input.", "Hittade inget namn eller företag i det du angav.")}
        </p>
      )}

      <p className="mt-3 text-xs text-zinc-400">
        {t("Tip: Claude-in-Chrome can call", "Tips: Claude-in-Chrome kan anropa")}{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-zinc-600">window.emilCRM.importApollo(json)</code> {t("or", "eller")}{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-zinc-600">importLinkedInUrl(url)</code> {t("directly.", "direkt.")}
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          {t("Cancel", "Avbryt")}
        </Button>
        <Button onClick={submit} disabled={!preview}>
          {t("Import prospect", "Importera prospekt")}
        </Button>
      </div>
    </Modal>
  );
}

function NextActionModal({ contactId }: { contactId: string }) {
  const contact = useCRM((s) => s.contacts.find((c) => c.id === contactId));
  const setNextAction = useCRM((s) => s.setNextAction);
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const t = useT();

  const [action, setAction] = useState(contact?.nextAction ?? "");
  const [date, setDate] = useState(contact?.nextActionDate ?? todayISODate());
  const [queue, setQueue] = useState(!contact?.nextActionDate);

  if (!contact) return null;

  const quick: Array<{ label: string; days: number }> = [
    { label: t("Today", "Idag"), days: 0 },
    { label: t("Tomorrow", "Imorgon"), days: 1 },
    { label: t("In 3 days", "Om 3 dagar"), days: 3 },
    { label: t("Next week", "Nästa vecka"), days: 7 },
  ];

  const submit = () => {
    if (!action.trim()) return;
    setNextAction(contactId, action, queue ? undefined : date);
    toast(t("Next action set", "Nästa åtgärd satt"));
    close();
  };

  return (
    <Modal title={t("Set next action", "Sätt nästa åtgärd")} subtitle={fullName(contact)} onClose={close}>
      <Field label={t("What's the next move?", "Vad är nästa steg?")}>
        <textarea
          autoFocus
          rows={3}
          className={cn(inputClass, "h-auto resize-none py-2")}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder={t("Call to propose meeting times", "Ring för att föreslå mötestider")}
        />
      </Field>
      <div className="mt-4">
        <span className="text-xs font-medium text-zinc-500">{t("When", "När")}</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {quick.map((q) => {
            const d = dateOffset(q.days);
            const active = !queue && date === d;
            return (
              <button
                key={q.label}
                onClick={() => {
                  setQueue(false);
                  setDate(d);
                }}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                )}
              >
                {q.label}
              </button>
            );
          })}
          <button
            onClick={() => setQueue(true)}
            className={cn(
              "rounded-lg border border-dashed px-2.5 py-1 text-xs font-medium transition-colors",
              queue
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-zinc-300 text-zinc-500 hover:bg-zinc-50"
            )}
          >
            {t("Asap (no date)", "Snarast (inget datum)")}
          </button>
        </div>
        {!queue && (
          <input
            type="date"
            className={cn(inputClass, "mt-2.5")}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          {t("Cancel", "Avbryt")}
        </Button>
        <Button onClick={submit} disabled={!action.trim()}>
          {t("Save action", "Spara åtgärd")}
        </Button>
      </div>
    </Modal>
  );
}

function BookMeetingModal({ contactId }: { contactId?: string }) {
  const contacts = useCRM((s) => s.contacts);
  const bookMeeting = useCRM((s) => s.bookMeeting);
  const setNextAction = useCRM((s) => s.setNextAction);
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const t = useT();

  const [selectedId, setSelectedId] = useState(contactId ?? contacts[0]?.id ?? "");
  const contact = contacts.find((c) => c.id === selectedId);
  const [title, setTitle] = useState(
    contact ? t(`Meeting with ${contact.company ?? fullName(contact)}`, `Möte med ${contact.company ?? fullName(contact)}`) : t("Intro meeting", "Intromöte")
  );
  const [date, setDate] = useState(dateOffset(1));
  const [time, setTime] = useState("11:00");
  const [duration, setDuration] = useState(30);
  const [type, setType] = useState<MeetingType>("video");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [addPrep, setAddPrep] = useState(true);

  const submit = () => {
    if (!selectedId || !title.trim()) return;
    const start = new Date(`${date}T${time}:00`).toISOString();
    bookMeeting({ contactId: selectedId, title, start, durationMins: duration, type, location, notes });
    if (addPrep) setNextAction(selectedId, t(`Prepare for: ${title.trim()}`, `Förbered: ${title.trim()}`), date);
    toast(t("Meeting booked", "Möte bokat"));
    close();
  };

  const typeOptions: Array<{ v: MeetingType; label: string }> = [
    { v: "video", label: t("Video", "Video") },
    { v: "call", label: t("Call", "Samtal") },
    { v: "in_person", label: t("In person", "På plats") },
  ];

  return (
    <Modal title={t("Book a meeting", "Boka ett möte")} subtitle={t("Schedule it and advance the contact", "Schemalägg och flytta fram kontakten")} onClose={close} size="lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!contactId && (
          <Field label={t("Contact", "Kontakt")} className="sm:col-span-2">
            <select
              className={inputClass}
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                const c = contacts.find((x) => x.id === e.target.value);
                if (c) setTitle(t(`Meeting with ${c.company ?? fullName(c)}`, `Möte med ${c.company ?? fullName(c)}`));
              }}
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {fullName(c)}
                  {c.company ? ` · ${c.company}` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t("Title", "Titel")} className="sm:col-span-2">
          <input autoFocus className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t("Date", "Datum")}>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("Time", "Tid")}>
          <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label={t("Duration", "Längd")}>
          <select className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[15, 30, 45, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Type", "Typ")}>
          <div className="flex h-9 rounded-lg border border-zinc-300 p-0.5">
            {typeOptions.map((o) => (
              <button
                key={o.v}
                onClick={() => setType(o.v)}
                className={cn(
                  "flex-1 rounded-md text-xs font-medium transition-colors",
                  type === o.v ? "bg-brand-600 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-50"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label={type === "in_person" ? t("Location", "Plats") : type === "call" ? t("Phone number", "Telefonnummer") : t("Video link", "Videolänk")} className="sm:col-span-2">
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={type === "in_person" ? t("Address", "Adress") : type === "call" ? "+46…" : "https://meet.google.com/…"} />
        </Field>
        <Field label={t("Notes", "Anteckningar")} className="sm:col-span-2">
          <textarea rows={2} className={cn(inputClass, "h-auto resize-none py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Agenda, prep, context…", "Agenda, förberedelse, sammanhang…")} />
        </Field>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
        <input type="checkbox" checked={addPrep} onChange={(e) => setAddPrep(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500" />
        {t("Add a “prepare” next action on the meeting day", "Lägg till en ”förbered”-åtgärd på mötesdagen")}
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          {t("Cancel", "Avbryt")}
        </Button>
        <Button onClick={submit} disabled={!selectedId || !title.trim()}>
          {t("Book meeting", "Boka möte")}
        </Button>
      </div>
    </Modal>
  );
}
