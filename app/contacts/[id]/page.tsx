"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Flag,
  Mail,
  Pencil,
  Phone,
  PhoneCall,
  RefreshCw,
  Send,
  StickyNote,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { Activity, ActivityType, CallRecord, Contact, Stage, STAGES, STAGE_META, fullName } from "@/lib/types";
import { useT, useLocale, STAGE_LABEL_SV } from "@/lib/i18n";
import { DEFAULT_EMAIL_TEMPLATE, campaignTemplates } from "@/lib/templates";
import { cn, dueLabel, formatActivityTime, formatCurrency, telHref } from "@/lib/utils";
import { companyLookups, personLookups } from "@/lib/lookup";
import { Avatar, Button, DueBadge, Tag, inputClass } from "@/components/ui";
import { MeetingCard } from "@/components/meeting-card";

const ACTIVITY_ICON: Record<ActivityType, typeof Flag> = {
  created: UserPlus,
  note: StickyNote,
  call: Phone,
  email: Mail,
  action_set: Flag,
  action_done: CheckCircle2,
  meeting_booked: CalendarPlus,
  meeting_held: CalendarCheck,
  meeting_cancelled: CalendarX,
  stage_change: ArrowRight,
};

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const contact = useCRM((s) => s.contacts.find((c) => c.id === params.id));
  // Select whole arrays (stable references) and derive per-contact slices in useMemo —
  // filtering inside the selector returns a new array each render and breaks useSyncExternalStore.
  const allMeetings = useCRM((s) => s.meetings);
  const allActivities = useCRM((s) => s.activities);
  const completeNextAction = useCRM((s) => s.completeNextAction);
  const setStage = useCRM((s) => s.setStage);
  const deleteContact = useCRM((s) => s.deleteContact);
  const updateContact = useCRM((s) => s.updateContact);
  const logActivity = useCRM((s) => s.logActivity);
  const campaigns = useCRM((s) => s.campaigns);
  const openModal = useUI((s) => s.openModal);
  const toast = useUI((s) => s.toast);
  const t = useT();

  const [note, setNote] = useState("");

  const sortedMeetings = useMemo(
    () =>
      allMeetings
        .filter((m) => m.contactId === params.id)
        .sort((a, b) => b.start.localeCompare(a.start)),
    [allMeetings, params.id]
  );
  const sortedActivity = useMemo(
    () =>
      allActivities
        .filter((a) => a.contactId === params.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [allActivities, params.id]
  );

  if (!contact) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-zinc-500">{t("This contact no longer exists.", "Den här kontakten finns inte längre.")}</p>
        <Link href="/contacts" className="text-sm font-medium text-brand-600 hover:underline">
          {t("← Back to contacts", "← Tillbaka till kontakter")}
        </Link>
      </div>
    );
  }

  const addNote = () => {
    if (!note.trim()) return;
    logActivity(contact.id, "note", note.trim());
    setNote("");
    toast("Note added");
  };

  const phones = contact.phones?.length ? contact.phones : contact.phone ? [contact.phone] : [];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-surface px-7 py-5">
        <button
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("Back", "Tillbaka")}
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar contact={contact} size="lg" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{fullName(contact)}</h1>
              <p className="text-sm text-zinc-500">
                {[contact.title, contact.company].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {contact.tags.map((tag) => (
                  <Tag key={tag} label={tag} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {campaigns.length > 0 && (
              <select
                value={contact.campaignId ?? ""}
                onChange={(e) => updateContact(contact.id, { campaignId: e.target.value })}
                className={cn(inputClass, "w-40")}
                title={t("Campaign", "Kampanj")}
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={contact.stage}
              onChange={(e) => setStage(contact.id, e.target.value as Stage)}
              className={cn(inputClass, "w-40 font-medium", STAGE_META[contact.stage].text)}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {t(STAGE_META[s].label, STAGE_LABEL_SV[s])}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => openModal({ kind: "edit-contact", contactId: contact.id })}>
              <Pencil className="h-4 w-4 text-zinc-400" />
              {t("Edit", "Redigera")}
            </Button>
            <Button onClick={() => openModal({ kind: "book-meeting", contactId: contact.id })}>
              <CalendarPlus className="h-4 w-4" />
              {t("Book meeting", "Boka möte")}
            </Button>
            <button
              onClick={() => {
                if (confirm(t(`Delete ${fullName(contact)}? This removes their meetings and history.`, `Radera ${fullName(contact)}? Detta tar bort deras möten och historik.`))) {
                  deleteContact(contact.id);
                  toast(t("Contact deleted", "Kontakt raderad"));
                  router.push("/contacts");
                }
              }}
              title={t("Delete contact", "Radera kontakt")}
              className="rounded-lg border border-zinc-300 p-2 text-zinc-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-7 py-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Next action */}
          <section className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("Next action", "Nästa åtgärd")}</h2>
            {contact.nextAction ? (
              <div className="flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
                <button
                  onClick={() => {
                    completeNextAction(contact.id);
                    toast(t("Action completed — set the next one", "Åtgärd klar — sätt nästa"));
                    openModal({ kind: "next-action", contactId: contact.id });
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-brand-400 text-transparent transition-colors hover:bg-brand-600 hover:text-white"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-800">{contact.nextAction}</p>
                </div>
                <DueBadge date={contact.nextActionDate} label={dueLabel(contact.nextActionDate)} />
                <button
                  onClick={() => openModal({ kind: "next-action", contactId: contact.id })}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  {t("Edit", "Redigera")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => openModal({ kind: "next-action", contactId: contact.id })}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 py-3 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
              >
                <Flag className="h-4 w-4" />
                {t("Set a next action", "Sätt en nästa åtgärd")}
              </button>
            )}
          </section>

          {/* Intro email */}
          <IntroEmailCard contact={contact} />

          {/* Cold call */}
          <CallCard contact={contact} />

          {/* Meetings */}
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t("Meetings", "Möten")} ({sortedMeetings.length})
              </h2>
              <button
                onClick={() => openModal({ kind: "book-meeting", contactId: contact.id })}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                {t("+ Book", "+ Boka")}
              </button>
            </div>
            {sortedMeetings.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">{t("No meetings booked yet.", "Inga möten bokade än.")}</p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {sortedMeetings.map((m) => (
                  <MeetingCard key={m.id} meeting={m} showContact={false} />
                ))}
              </div>
            )}
          </section>

          {/* Activity */}
          <section className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("Activity", "Aktivitet")}</h2>
            <Timeline activities={sortedActivity} />
          </section>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <section className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("Details", "Detaljer")}</h2>
            <dl className="space-y-3 text-sm">
              <Detail label={t("Email", "E-post")} value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
              <PhonesDetail phones={phones} />
              <Detail label={t("HQ / main line", "Växel / huvudnummer")} value={contact.hqPhone} href={contact.hqPhone ? telHref(contact.hqPhone) : undefined} />
              <Detail label={t("Company", "Företag")} value={contact.company} />
              <Detail label={t("Industry", "Bransch")} value={contact.industry} />
              <Detail label={t("Company size", "Företagsstorlek")} value={contact.companySize ? `${contact.companySize} ${t("employees", "anställda")}` : undefined} />
              <Detail label={t("Location", "Ort")} value={contact.location} />
              <Detail
                label={t("LinkedIn", "LinkedIn")}
                value={contact.linkedinUrl ? t("View profile", "Visa profil") : undefined}
                href={contact.linkedinUrl}
              />
              <Detail label={t("Potential value", "Potentiellt värde")} value={formatCurrency(contact.value)} />
              <Detail label={t("Source", "Källa")} value={contact.source} />
            </dl>
          </section>

          {/* Phone-number lookups for when Apollo comes up short */}
          {(contact.company || contact.firstName) && (
            <section className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t("Find phone numbers", "Hitta telefonnummer")}
              </h2>
              <p className="mb-3 text-xs text-zinc-400">{t("Open a directory search to grab missing numbers.", "Öppna en katalogsökning för att hitta nummer som saknas.")}</p>
              {contact.company && (
                <LookupRow label={`HQ · ${contact.company}`} links={companyLookups(contact.company)} />
              )}
              <LookupRow
                label={fullName(contact)}
                links={personLookups(fullName(contact), contact.location)}
              />
            </section>
          )}

          <section className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("Log a note", "Anteckna")}</h2>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("Quick note, call summary…", "Snabb anteckning, samtalssammanfattning…")}
              className={cn(inputClass, "h-auto resize-none py-2")}
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={addNote} disabled={!note.trim()}>
                {t("Add note", "Spara anteckning")}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function IntroEmailCard({ contact }: { contact: Contact }) {
  const campaigns = useCRM((s) => s.campaigns);
  const generateDraft = useCRM((s) => s.generateDraft);
  const updateDraft = useCRM((s) => s.updateDraft);
  const markDraftSent = useCRM((s) => s.markDraftSent);
  const discardDraft = useCRM((s) => s.discardDraft);
  const toast = useUI((s) => s.toast);
  const t = useT();

  const draft = contact.emailDraft;
  const campaign = campaigns.find((c) => c.id === contact.campaignId);
  const templates = campaignTemplates(campaign);
  const usingDefault = templates.length === 0;
  const pickable = templates.length ? templates : [DEFAULT_EMAIL_TEMPLATE];
  const [templateId, setTemplateId] = useState(pickable[0]?.id);
  const selectedId = pickable.some((tpl) => tpl.id === templateId) ? templateId : pickable[0]?.id;

  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`${t("Subject", "Ämne")}: ${draft.subject}\n\n${draft.body}`);
      toast(t("Draft copied to clipboard", "Utkast kopierat"));
    } catch {
      toast(t("Couldn't copy — select and copy manually", "Kunde inte kopiera — markera och kopiera manuellt"));
    }
  };

  // Hand off to the user's mail client with everything prefilled, then advance.
  const send = () => {
    if (!draft || !contact.email) return;
    window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(
      draft.subject
    )}&body=${encodeURIComponent(draft.body)}`;
    markDraftSent(contact.id);
    toast(t("Opening your email app — marked as sent", "Öppnar din e-postapp — markerat som skickat"));
  };

  const picker =
    pickable.length > 1 ? (
      <select
        value={selectedId}
        onChange={(e) => setTemplateId(e.target.value)}
        title={t("Template", "Mall")}
        className={cn(inputClass, "h-8 w-auto max-w-[170px] text-xs")}
      >
        {pickable.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.name}
          </option>
        ))}
      </select>
    ) : null;

  // Empty state — pick a template and draft.
  if (!draft) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("Intro email", "Intromejl")}</h2>
        <div className="flex flex-col items-center gap-2.5 rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center">
          <Mail className="h-5 w-5 text-zinc-300" />
          <p className="text-sm text-zinc-500">
            {t("Draft a personalised intro for", "Skapa ett personligt intro till")}{" "}
            <span className="font-medium text-zinc-700">{campaign?.name ?? t("this contact", "den här kontakten")}</span>
            {usingDefault ? t(" (using the default template)", " (med standardmallen)") : ""}.
          </p>
          <div className="flex items-center gap-2">
            {picker}
            <Button size="sm" onClick={() => generateDraft(contact.id, selectedId)}>
              <Mail className="h-4 w-4" />
              {t("Draft intro", "Skapa intro")}
            </Button>
          </div>
          {!contact.email && (
            <p className="text-xs text-amber-600">{t("No email on file yet — draft now, add the address before sending.", "Ingen e-post angiven än — skapa nu, lägg till adressen innan du skickar.")}</p>
          )}
        </div>
      </section>
    );
  }

  const sent = draft.status === "sent";

  return (
    <section className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {t("Intro email", "Intromejl")}
          {sent ? (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
              {t("Sent", "Skickat")} · {formatActivityTime(draft.updatedAt)}
            </span>
          ) : (
            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">{t("Draft", "Utkast")}</span>
          )}
        </h2>
        <span className="truncate text-[11px] text-zinc-400">{t("from", "från")} {draft.templateName ?? t("default", "standard")}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-14 shrink-0 text-xs text-zinc-400">{t("To", "Till")}</span>
          {contact.email ? (
            <span className="truncate font-medium text-zinc-700">{contact.email}</span>
          ) : (
            <span className="text-xs text-amber-600">{t("No email yet — add one to send.", "Ingen e-post än — lägg till en för att skicka.")}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-zinc-400">{t("Subject", "Ämne")}</span>
          <input
            value={draft.subject}
            disabled={sent}
            onChange={(e) => updateDraft(contact.id, { subject: e.target.value })}
            className={cn(inputClass, "flex-1", sent && "bg-zinc-50 text-zinc-500")}
          />
        </div>
        <textarea
          rows={8}
          value={draft.body}
          disabled={sent}
          onChange={(e) => updateDraft(contact.id, { body: e.target.value })}
          className={cn(inputClass, "h-auto resize-none py-2 leading-relaxed", sent && "bg-zinc-50 text-zinc-500")}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={copy}>
            <Copy className="h-3.5 w-3.5 text-zinc-400" />
            {t("Copy", "Kopiera")}
          </Button>
          {!sent && (
            <>
              {picker}
              <button
                onClick={() => {
                  if (confirm(t("Replace this draft with a fresh one from the selected template? Your edits will be lost.", "Ersätt det här utkastet med ett nytt från vald mall? Dina ändringar försvinner."))) {
                    generateDraft(contact.id, selectedId);
                    toast(t("Draft regenerated", "Utkast återskapat"));
                  }
                }}
                title={t("Regenerate from the selected template", "Återskapa från vald mall")}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("Regenerate", "Återskapa")}
              </button>
            </>
          )}
          <button
            onClick={() => {
              discardDraft(contact.id);
              toast(sent ? t("Draft cleared", "Utkast rensat") : t("Draft discarded", "Utkast slängt"));
            }}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
          >
            {sent ? t("Clear", "Rensa") : t("Discard", "Släng")}
          </button>
        </div>
        {!sent && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                markDraftSent(contact.id);
                toast(t("Marked as sent — follow-up queued in 3 days", "Markerat som skickat — uppföljning om 3 dagar"));
              }}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              {t("Mark sent", "Markera skickat")}
            </button>
            <Button size="sm" onClick={send} disabled={!contact.email}>
              <Send className="h-3.5 w-3.5" />
              {t("Send", "Skicka")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function CallCard({ contact }: { contact: Contact }) {
  const campaigns = useCRM((s) => s.campaigns);
  const setCallScript = useCRM((s) => s.setCallScript);
  const updateCallScript = useCRM((s) => s.updateCallScript);
  const discardCallScript = useCRM((s) => s.discardCallScript);
  const addCallRecord = useCRM((s) => s.addCallRecord);
  const toast = useUI((s) => s.toast);
  const locale = useLocale((s) => s.locale);
  const t = useT();

  const [config, setConfig] = useState<{ llm: boolean; cloudtalk: boolean; authRequired?: boolean } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [calling, setCalling] = useState(false);

  // Learn which server-side features are configured (secrets are server-only).
  useEffect(() => {
    let alive = true;
    fetch("/api/call/config")
      .then((r) => r.json())
      .then((d) => alive && setConfig({ llm: !!d.llm, cloudtalk: !!d.cloudtalk, authRequired: !!d.authRequired }))
      .catch(() => alive && setConfig({ llm: false, cloudtalk: false }));
    return () => {
      alive = false;
    };
  }, []);

  const campaign = campaigns.find((c) => c.id === contact.campaignId);
  const script = contact.callScript;
  const phones = contact.phones?.length ? contact.phones : contact.phone ? [contact.phone] : [];
  const [callNumber, setCallNumber] = useState(phones[0] ?? "");
  const selectedNumber = phones.includes(callNumber) ? callNumber : phones[0] ?? "";

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/call/script", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact,
          campaign: campaign
            ? { name: campaign.name, description: campaign.description, targetICP: campaign.targetICP }
            : undefined,
          lang: locale,
        }),
      });
      const data = await res.json();
      if (res.ok && data.text) {
        setCallScript(contact.id, {
          text: data.text,
          generatedAt: new Date().toISOString(),
          model: data.model || "",
          lang: locale,
        });
        toast(t("Call script generated", "Samtalsmanus skapat"));
      } else if (res.status === 503) {
        toast(t("Set ANTHROPIC_API_KEY to generate scripts", "Ange ANTHROPIC_API_KEY för att skapa manus"));
      } else {
        toast(t("Couldn't generate the script", "Kunde inte skapa manuset"));
      }
    } catch {
      toast(t("Couldn't generate the script", "Kunde inte skapa manuset"));
    }
    setGenerating(false);
  };

  const copy = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script.text);
      toast(t("Script copied", "Manus kopierat"));
    } catch {
      toast(t("Couldn't copy — select and copy manually", "Kunde inte kopiera — markera och kopiera manuellt"));
    }
  };

  const call = async () => {
    if (!selectedNumber) return;
    setCalling(true);
    try {
      const res = await fetch("/api/call/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ number: selectedNumber }),
      });
      const data = await res.json();
      if (res.ok) {
        addCallRecord(contact.id, { cloudtalkCallId: data.cloudtalkCallId });
        toast(t("Calling via CloudTalk — answer your phone", "Ringer via CloudTalk — svara i din telefon"));
      } else {
        toast(t("CloudTalk couldn't place the call", "CloudTalk kunde inte ringa upp"));
      }
    } catch {
      toast(t("CloudTalk couldn't place the call", "CloudTalk kunde inte ringa upp"));
    }
    setCalling(false);
  };

  const callButton =
    config?.cloudtalk && phones.length > 0 ? (
      <div className="flex items-center gap-2">
        {phones.length > 1 && (
          <select
            value={selectedNumber}
            onChange={(e) => setCallNumber(e.target.value)}
            className={cn(inputClass, "h-8 w-auto max-w-[150px] text-xs")}
            title={t("Number to dial", "Nummer att ringa")}
          >
            {phones.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        <Button size="sm" onClick={call} disabled={calling}>
          <PhoneCall className="h-3.5 w-3.5" />
          {calling ? t("Calling…", "Ringer…") : t("Call via CloudTalk", "Ring via CloudTalk")}
        </Button>
      </div>
    ) : null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Phone className="h-3.5 w-3.5" />
          {t("Cold call", "Kallt samtal")}
        </h2>
        {script && callButton}
      </div>

      {!script ? (
        <div className="flex flex-col items-center gap-2.5 rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center">
          <Phone className="h-5 w-5 text-zinc-300" />
          <p className="text-sm text-zinc-500">
            {t("Generate a call script tailored to", "Skapa ett samtalsmanus anpassat för")}{" "}
            <span className="font-medium text-zinc-700">{fullName(contact)}</span>
            {contact.title ? ` (${contact.title})` : ""}.
          </p>
          {config?.authRequired ? (
            <p className="text-xs text-amber-600">
              {t(
                "AI and calling stay off until the login gate is set — add APP_PASSWORD and AUTH_SECRET, then sign in.",
                "AI och samtal är avstängda tills inloggningen är satt — lägg till APP_PASSWORD och AUTH_SECRET och logga in."
              )}
            </p>
          ) : config && !config.llm ? (
            <p className="text-xs text-amber-600">
              {t("Set ANTHROPIC_API_KEY on the server to generate scripts.", "Ange ANTHROPIC_API_KEY på servern för att skapa manus.")}
            </p>
          ) : (
            <Button size="sm" onClick={generate} disabled={generating}>
              <FileText className="h-4 w-4" />
              {generating ? t("Generating…", "Skapar…") : t("Generate script", "Skapa manus")}
            </Button>
          )}
          {config?.cloudtalk && phones.length > 0 && <div className="pt-1">{callButton}</div>}
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            rows={12}
            value={script.text}
            onChange={(e) => updateCallScript(contact.id, e.target.value)}
            className={cn(inputClass, "h-auto resize-none py-2 font-mono text-[13px] leading-relaxed")}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={copy}>
              <Copy className="h-3.5 w-3.5 text-zinc-400" />
              {t("Copy", "Kopiera")}
            </Button>
            <button
              onClick={generate}
              disabled={generating}
              title={t("Regenerate the script", "Återskapa manuset")}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {generating ? t("Generating…", "Skapar…") : t("Regenerate", "Återskapa")}
            </button>
            <button
              onClick={() => {
                discardCallScript(contact.id);
                toast(t("Script discarded", "Manus slängt"));
              }}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
            >
              {t("Discard", "Släng")}
            </button>
          </div>
        </div>
      )}

      <CallHistory calls={contact.calls ?? []} />
    </section>
  );
}

const SENTIMENT_DOT: Record<NonNullable<CallRecord["sentiment"]>, string> = {
  positive: "bg-emerald-500",
  neutral: "bg-zinc-400",
  negative: "bg-rose-500",
};

function CallHistory({ calls }: { calls: CallRecord[] }) {
  const t = useT();
  if (calls.length === 0) return null;
  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t("Call history", "Samtalshistorik")} ({calls.length})
      </h3>
      <div className="space-y-2">
        {calls.map((c) => (
          <CallRow key={c.id} call={c} />
        ))}
      </div>
    </div>
  );
}

function CallRow({ call }: { call: CallRecord }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const when = new Date(call.startedAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const duration =
    call.durationSecs != null
      ? `${Math.floor(call.durationSecs / 60)}m ${call.durationSecs % 60}s`
      : null;
  const pending = call.status === "initiated";

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          {call.sentiment && <span className={cn("h-2 w-2 rounded-full", SENTIMENT_DOT[call.sentiment])} />}
          <span className="font-medium text-zinc-700">{when}</span>
          {duration && <span className="text-zinc-400">· {duration}</span>}
          {pending && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
              {t("Awaiting transcript", "Inväntar transkript")}
            </span>
          )}
        </div>
        {call.recordingUrl && (
          <a
            href={call.recordingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            {t("Recording", "Inspelning")}
          </a>
        )}
      </div>

      {call.summary && <p className="mt-2 text-sm text-zinc-700">{call.summary}</p>}

      {call.takeaways && call.takeaways.length > 0 && (
        <ul className="mt-2 space-y-1">
          {call.takeaways.map((tk, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-zinc-600">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
              {tk}
            </li>
          ))}
        </ul>
      )}

      {call.transcript && (
        <div className="mt-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-700"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            {open ? t("Hide transcript", "Dölj transkript") : t("Show transcript", "Visa transkript")}
          </button>
          {open && (
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface p-2.5 text-xs leading-relaxed text-zinc-600">
              {call.transcript}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, href }: { label: string; value?: string; href?: string }) {
  const isExternal = href?.startsWith("http");
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-zinc-400">{label}</dt>
      {href && value ? (
        <a
          href={href}
          className="text-right font-medium text-brand-700 hover:underline"
          {...(isExternal && { target: "_blank", rel: "noopener noreferrer" })}
        >
          {value}
        </a>
      ) : (
        <dd className="text-right font-medium text-zinc-700">{value || "—"}</dd>
      )}
    </div>
  );
}

function PhonesDetail({ phones }: { phones: string[] }) {
  const t = useT();
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-zinc-400">{phones.length > 1 ? t("Phones", "Telefon") : t("Phone", "Telefon")}</dt>
      {phones.length === 0 ? (
        <dd className="text-right font-medium text-zinc-700">—</dd>
      ) : (
        <dd className="flex flex-col items-end gap-0.5">
          {phones.map((p) => (
            <a key={p} href={telHref(p)} className="font-medium text-brand-700 hover:underline">
              {p}
            </a>
          ))}
        </dd>
      )}
    </div>
  );
}

function LookupRow({
  label,
  links,
}: {
  label: string;
  links: { label: string; url: string; hint: string }[];
}) {
  if (links.length === 0) return null;
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="mb-1 truncate text-xs text-zinc-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            title={l.hint}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
          >
            {l.label}
            <ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </div>
    </div>
  );
}

function Timeline({ activities }: { activities: Activity[] }) {
  const t = useT();
  if (activities.length === 0) {
    return <p className="text-sm text-zinc-400">{t("No activity yet.", "Ingen aktivitet än.")}</p>;
  }
  return (
    <ol className="relative space-y-4 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-zinc-100">
      {activities.map((a) => {
        const Icon = ACTIVITY_ICON[a.type];
        return (
          <li key={a.id} className="relative flex gap-3">
            <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-surface text-zinc-400">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm text-zinc-700">{a.text}</p>
              <p className="text-xs text-zinc-400">{formatActivityTime(a.date)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
