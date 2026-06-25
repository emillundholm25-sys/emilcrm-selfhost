"use client";

import { useState } from "react";
import { AlertTriangle, Download, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
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
      setRestoreError("That doesn't look like an EmilCRM backup file.");
      return;
    }
    setStaged({ data, name: file.name });
  };

  const doRestore = () => {
    if (!staged) return;
    restoreBackup(staged.data);
    setActiveCampaign("all");
    toast("Backup restored");
    close();
  };

  const doClear = () => {
    clearAll();
    setActiveCampaign("all");
    toast("All data cleared");
    close();
  };

  return (
    <Modal title="Data & backup" subtitle="Export, restore, or wipe your CRM" onClose={close}>
      {/* Download */}
      <div className="rounded-lg border border-zinc-200 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-zinc-900">Download backup</div>
          <Button
            variant="secondary"
            onClick={() => {
              downloadBackup();
              toast("Backup downloaded");
            }}
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {plural(contacts.length, "contact")} · {plural(meetings.length, "meeting")} ·{" "}
          {plural(prospects.length, "prospect")} · {plural(campaigns.length, "campaign")}
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          Saves everything to a JSON file on this device. Keep it safe — you can restore it below.
        </p>
      </div>

      {/* Restore */}
      <div className="mt-3 rounded-lg border border-zinc-200 p-3">
        <div className="text-sm font-medium text-zinc-900">Restore from backup</div>
        <p className="mt-0.5 text-xs text-zinc-500">Replaces all current data with a backup file's contents.</p>
        <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
          <Upload className="h-3.5 w-3.5 text-zinc-400" />
          Choose file…
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
              <span className="font-semibold">{staged.name}</span> — {plural(staged.data.contacts.length, "contact")},{" "}
              {plural(staged.data.meetings.length, "meeting")}, {plural(staged.data.prospects.length, "prospect")},{" "}
              {plural(staged.data.campaigns.length, "campaign")}. This replaces everything currently in the app.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStaged(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={doRestore}>
                Replace all data
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-rose-700">
          <AlertTriangle className="h-4 w-4" />
          Danger zone
        </div>
        <p className="mt-0.5 text-xs text-rose-600/90">
          Permanently delete all contacts, meetings, prospects and campaigns. This can&apos;t be undone — download a
          backup first.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Type <span className="font-mono font-semibold text-zinc-700">DELETE</span> to confirm.
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
            Clear all data
          </Button>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={close}>
          Done
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
      toast("Campaign updated");
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
    toast(imported > 0 ? `Campaign created · ${imported} prospect${imported > 1 ? "s" : ""} added` : "Campaign created");
    close();
  };

  return (
    <Modal
      title={isEdit ? "Edit campaign" : "New campaign"}
      subtitle={isEdit ? existing?.name : "Each campaign gets its own pipeline and ICP"}
      onClose={close}
      size="lg"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Campaign name" className="sm:col-span-2">
          <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Skåne Hospitality Q3" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Hotels, spas & restaurants in Skåne" />
        </Field>
        <Field label="Color" className="sm:col-span-2">
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
          Target ICP (optional)
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Industries">
            <input className={inputClass} value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="Hospitality, Restaurants" />
          </Field>
          <Field label="Company sizes">
            <input className={inputClass} value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="11-50, 51-200" />
          </Field>
          <Field label="Locations">
            <input className={inputClass} value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Lund, SE; Malmö, SE" />
          </Field>
          <Field label="Titles">
            <input className={inputClass} value={titles} onChange={(e) => setTitles(e.target.value)} placeholder="Owner, Marketing Director" />
          </Field>
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">Comma-separated. Drives prospect scoring for this campaign.</p>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Intro email templates (optional)
          </div>
          <button
            type="button"
            onClick={() => addTemplate({ ...DEFAULT_EMAIL_TEMPLATE, id: uid(), name: "Intro" })}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Add sample
          </button>
        </div>

        {templates.length === 0 ? (
          <p className="text-xs text-zinc-400">
            No templates yet. Add one and each contact gets a personalised draft — they pick a template and send it from their page.
          </p>
        ) : (
          <div className="space-y-3">
            {templates.map((t, i) => (
              <div key={t.id} className="rounded-lg border border-zinc-200 bg-white p-2.5">
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
                    title="Remove template"
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
          Add template
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-zinc-200 pt-2.5">
          <span className="text-xs text-zinc-400">Merge fields:</span>
          {MERGE_FIELDS.map((f) => (
            <code key={f} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-zinc-600 ring-1 ring-zinc-200">
              {`{{${f}}}`}
            </code>
          ))}
        </div>
      </div>

      {!isEdit && (
        <Field label="Import prospects (optional)" className="mt-3">
          <textarea
            rows={4}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={"One per line:  First Last, Company, Title, Industry, Location\nKlara Sjöberg, Hotel Duxiana, Marketing Director, Hospitality, Lund"}
            className={cn(inputClass, "h-auto resize-none py-2 font-mono text-xs leading-relaxed")}
          />
        </Field>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!name.trim()}>
          {isEdit ? "Save changes" : "Create campaign"}
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
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    toast(`${firstName} ${lastName} added`.trim());
    close();
  };

  return (
    <Modal title="Add contact" subtitle="Drop a new lead into the pipeline" onClose={close} size="lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name">
          <input autoFocus className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Astrid" />
        </Field>
        <Field label="Last name">
          <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Bergström" />
        </Field>
        <Field label="Company">
          <input className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Grand Hotel Lund" />
        </Field>
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Marketing Director" />
        </Field>
        <Field label="Email">
          <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </Field>
        <Field label="Phone">
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+46 70 000 00 00" />
        </Field>
        <Field label="HQ / main line">
          <input className={inputClass} value={hqPhone} onChange={(e) => setHqPhone(e.target.value)} placeholder="+46 46 280 00 00" />
        </Field>
        <Field label="Industry">
          <input className={inputClass} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Hospitality" />
        </Field>
        <Field label="Company size">
          <select className={inputClass} value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
            <option value="">—</option>
            {["1-10", "11-50", "51-200", "201-1000", "1000+"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lund, SE" />
        </Field>
        <Field label="LinkedIn URL">
          <input className={inputClass} value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/…" />
        </Field>
        {activeCampaigns.length > 0 && (
          <Field label="Campaign">
            <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {activeCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Pipeline stage">
          <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_META[s].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Potential value (SEK)">
          <input type="number" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} placeholder="12000" />
        </Field>
        <Field label="Tags (comma separated)" className="sm:col-span-2">
          <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Hospitality, Hot lead" />
        </Field>
        <Field label="Next action" className="sm:col-span-2">
          <input className={inputClass} value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Send intro email with portfolio" />
        </Field>
        {nextAction && (
          <Field label="Due date">
            <input type="date" className={inputClass} value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!firstName.trim()}>
          Add contact
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
    toast("Contact updated");
    close();
  };

  return (
    <Modal title="Edit contact" subtitle={fullName(contact)} onClose={close} size="lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name">
          <input autoFocus className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Company">
          <input className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Email">
          <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Phone(s)">
          <input
            className={inputClass}
            value={phones}
            onChange={(e) => setPhones(e.target.value)}
            placeholder="+46 70…, +46 40…"
          />
        </Field>
        <Field label="HQ / main line">
          <input className={inputClass} value={hqPhone} onChange={(e) => setHqPhone(e.target.value)} />
        </Field>
        <Field label="Industry">
          <input className={inputClass} value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </Field>
        <Field label="Company size">
          <select className={inputClass} value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
            <option value="">—</option>
            {["1-10", "11-50", "51-200", "201-1000", "1000+"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="LinkedIn URL">
          <input className={inputClass} value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
        </Field>
        {activeCampaigns.length > 0 && (
          <Field label="Campaign">
            <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {activeCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Potential value (SEK)">
          <input type="number" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Tags (comma separated)" className="sm:col-span-2">
          <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Hospitality, Hot lead" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!firstName.trim()}>
          Save changes
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

  const [mode, setMode] = useState<"data" | "url">("data");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const preview = mode === "data" ? parseEnrichment(text) : parseLinkedInUrl(url);
  const phoneCount = (preview?.phones?.length ?? 0) + (preview?.hqPhone ? 1 : 0);

  const submit = () => {
    const id = mode === "data" ? importEnrichment(text) : importLinkedInUrl(url);
    if (!id) {
      toast(mode === "url" ? "Not a valid LinkedIn URL" : "Couldn't read that — check the format");
      return;
    }
    toast("Prospect imported into the pipeline 🎯");
    close();
  };

  return (
    <Modal
      title="Import prospect"
      subtitle="From an Apollo / LinkedIn enrichment, or just a LinkedIn URL"
      onClose={close}
      size="lg"
    >
      {/* Mode toggle */}
      <div className="mb-3 inline-flex rounded-lg border border-zinc-200 p-0.5">
        {([
          { v: "data", label: "Paste data" },
          { v: "url", label: "LinkedIn URL" },
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
            <span className="text-xs font-medium text-zinc-500">Enrichment data (Apollo JSON or text)</span>
            <button
              onClick={() => setText(SAMPLE_APOLLO)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Paste sample
            </button>
          </div>
          <textarea
            autoFocus
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste Apollo person JSON (with phone_numbers + organization), or lines like&#10;Name: Klara Sjöberg&#10;Title: Marketing Director&#10;Company: Hotel Duxiana&#10;Phone: +46 70 123 45 67&#10;HQ: +46 46 280 00 00"
            className={cn(inputClass, "h-auto resize-none py-2 font-mono text-xs leading-relaxed")}
          />
        </>
      ) : (
        <>
          <span className="text-xs font-medium text-zinc-500">LinkedIn profile or company URL</span>
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.linkedin.com/in/klara-sjoberg"
            className={cn(inputClass, "mt-1")}
          />
          <p className="mt-2 text-xs text-zinc-400">
            The URL creates a stub with a name + an enrich next action. Phone numbers, email and title come from
            running Apollo / Claude-in-Chrome on the profile.
          </p>
        </>
      )}

      {preview && (
        <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">Preview</div>
          <div className="font-semibold text-zinc-900">
            {`${preview.firstName} ${preview.lastName}`.trim() || preview.company || "—"}
          </div>
          <div className="text-xs text-zinc-500">
            {[preview.title, preview.company].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-zinc-500">
            {preview.industry && <span className="rounded bg-white px-1.5 py-0.5">{preview.industry}</span>}
            {preview.companySize && <span className="rounded bg-white px-1.5 py-0.5">{preview.companySize} emp</span>}
            {preview.location && <span className="rounded bg-white px-1.5 py-0.5">{preview.location}</span>}
            {preview.email && <span className="rounded bg-white px-1.5 py-0.5">{preview.email}</span>}
          </div>
          {phoneCount > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              {(preview.phones ?? []).map((p) => (
                <span key={p} className="rounded bg-white px-1.5 py-0.5 text-zinc-700">
                  📱 {p}
                </span>
              ))}
              {preview.hqPhone && (
                <span className="rounded bg-white px-1.5 py-0.5 text-zinc-700">🏢 {preview.hqPhone}</span>
              )}
            </div>
          )}
          {mode === "url" && (
            <p className="mt-1.5 text-xs text-amber-600">Stub only — enrich for phone/email/title.</p>
          )}
        </div>
      )}
      {((mode === "data" && text.trim()) || (mode === "url" && url.trim())) && !preview && (
        <p className="mt-2 text-xs text-rose-600">
          {mode === "url" ? "Doesn't look like a LinkedIn URL." : "Couldn't find a name or company in that input."}
        </p>
      )}

      <p className="mt-3 text-xs text-zinc-400">
        Tip: Claude-in-Chrome can call{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-zinc-600">window.emilCRM.importApollo(json)</code> or{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-zinc-600">importLinkedInUrl(url)</code> directly.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!preview}>
          Import prospect
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

  const [action, setAction] = useState(contact?.nextAction ?? "");
  const [date, setDate] = useState(contact?.nextActionDate ?? todayISODate());
  const [queue, setQueue] = useState(!contact?.nextActionDate);

  if (!contact) return null;

  const quick: Array<{ label: string; days: number }> = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "In 3 days", days: 3 },
    { label: "Next week", days: 7 },
  ];

  const submit = () => {
    if (!action.trim()) return;
    setNextAction(contactId, action, queue ? undefined : date);
    toast("Next action set");
    close();
  };

  return (
    <Modal title="Set next action" subtitle={fullName(contact)} onClose={close}>
      <Field label="What's the next move?">
        <textarea
          autoFocus
          rows={3}
          className={cn(inputClass, "h-auto resize-none py-2")}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Call to propose meeting times"
        />
      </Field>
      <div className="mt-4">
        <span className="text-xs font-medium text-zinc-500">When</span>
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
            Asap (no date)
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
          Cancel
        </Button>
        <Button onClick={submit} disabled={!action.trim()}>
          Save action
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

  const [selectedId, setSelectedId] = useState(contactId ?? contacts[0]?.id ?? "");
  const contact = contacts.find((c) => c.id === selectedId);
  const [title, setTitle] = useState(
    contact ? `Meeting with ${contact.company ?? fullName(contact)}` : "Intro meeting"
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
    if (addPrep) setNextAction(selectedId, `Prepare for: ${title.trim()}`, date);
    toast("Meeting booked 🎉");
    close();
  };

  const typeOptions: Array<{ v: MeetingType; label: string }> = [
    { v: "video", label: "Video" },
    { v: "call", label: "Call" },
    { v: "in_person", label: "In person" },
  ];

  return (
    <Modal title="Book a meeting" subtitle="Schedule it and advance the contact" onClose={close} size="lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!contactId && (
          <Field label="Contact" className="sm:col-span-2">
            <select
              className={inputClass}
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                const c = contacts.find((x) => x.id === e.target.value);
                if (c) setTitle(`Meeting with ${c.company ?? fullName(c)}`);
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
        <Field label="Title" className="sm:col-span-2">
          <input autoFocus className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Date">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Duration">
          <select className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[15, 30, 45, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
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
        <Field label={type === "in_person" ? "Location" : type === "call" ? "Phone number" : "Video link"} className="sm:col-span-2">
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={type === "in_person" ? "Address" : type === "call" ? "+46…" : "https://meet.google.com/…"} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea rows={2} className={cn(inputClass, "h-auto resize-none py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, prep, context…" />
        </Field>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
        <input type="checkbox" checked={addPrep} onChange={(e) => setAddPrep(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500" />
        Add a “prepare” next action on the meeting day
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!selectedId || !title.trim()}>
          Book meeting
        </Button>
      </div>
    </Modal>
  );
}
