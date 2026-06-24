"use client";

import { useMemo, useState } from "react";
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
  ExternalLink,
  Flag,
  Mail,
  Pencil,
  Phone,
  StickyNote,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { Activity, ActivityType, Stage, STAGES, STAGE_META, fullName } from "@/lib/types";
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
        <p className="text-sm text-zinc-500">This contact no longer exists.</p>
        <Link href="/contacts" className="text-sm font-medium text-brand-600 hover:underline">
          ← Back to contacts
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
      <div className="border-b border-zinc-200 bg-white px-7 py-5">
        <button
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
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
                {contact.tags.map((t) => (
                  <Tag key={t} label={t} />
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
                title="Campaign"
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
                  {STAGE_META[s].label}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => openModal({ kind: "edit-contact", contactId: contact.id })}>
              <Pencil className="h-4 w-4 text-zinc-400" />
              Edit
            </Button>
            <Button onClick={() => openModal({ kind: "book-meeting", contactId: contact.id })}>
              <CalendarPlus className="h-4 w-4" />
              Book meeting
            </Button>
            <button
              onClick={() => {
                if (confirm(`Delete ${fullName(contact)}? This removes their meetings and history.`)) {
                  deleteContact(contact.id);
                  toast("Contact deleted");
                  router.push("/contacts");
                }
              }}
              title="Delete contact"
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
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Next action</h2>
            {contact.nextAction ? (
              <div className="flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
                <button
                  onClick={() => {
                    completeNextAction(contact.id);
                    toast("Action completed — set the next one");
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
                  Edit
                </button>
              </div>
            ) : (
              <button
                onClick={() => openModal({ kind: "next-action", contactId: contact.id })}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 py-3 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
              >
                <Flag className="h-4 w-4" />
                Set a next action
              </button>
            )}
          </section>

          {/* Meetings */}
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Meetings ({sortedMeetings.length})
              </h2>
              <button
                onClick={() => openModal({ kind: "book-meeting", contactId: contact.id })}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                + Book
              </button>
            </div>
            {sortedMeetings.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">No meetings booked yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {sortedMeetings.map((m) => (
                  <MeetingCard key={m.id} meeting={m} showContact={false} />
                ))}
              </div>
            )}
          </section>

          {/* Activity */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Activity</h2>
            <Timeline activities={sortedActivity} />
          </section>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Details</h2>
            <dl className="space-y-3 text-sm">
              <Detail label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
              <PhonesDetail phones={phones} />
              <Detail label="HQ / main line" value={contact.hqPhone} href={contact.hqPhone ? telHref(contact.hqPhone) : undefined} />
              <Detail label="Company" value={contact.company} />
              <Detail label="Industry" value={contact.industry} />
              <Detail label="Company size" value={contact.companySize ? `${contact.companySize} employees` : undefined} />
              <Detail label="Location" value={contact.location} />
              <Detail
                label="LinkedIn"
                value={contact.linkedinUrl ? "View profile" : undefined}
                href={contact.linkedinUrl}
              />
              <Detail label="Potential value" value={formatCurrency(contact.value)} />
              <Detail label="Source" value={contact.source} />
            </dl>
          </section>

          {/* Phone-number lookups for when Apollo comes up short */}
          {(contact.company || contact.firstName) && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Find phone numbers
              </h2>
              <p className="mb-3 text-xs text-zinc-400">Open a directory search to grab missing numbers.</p>
              {contact.company && (
                <LookupRow label={`HQ · ${contact.company}`} links={companyLookups(contact.company)} />
              )}
              <LookupRow
                label={fullName(contact)}
                links={personLookups(fullName(contact), contact.location)}
              />
            </section>
          )}

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Log a note</h2>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Quick note, call summary…"
              className={cn(inputClass, "h-auto resize-none py-2")}
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={addNote} disabled={!note.trim()}>
                Add note
              </Button>
            </div>
          </section>
        </div>
      </div>
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
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-zinc-400">{phones.length > 1 ? "Phones" : "Phone"}</dt>
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
  if (activities.length === 0) {
    return <p className="text-sm text-zinc-400">No activity yet.</p>;
  }
  return (
    <ol className="relative space-y-4 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-zinc-100">
      {activities.map((a) => {
        const Icon = ACTIVITY_ICON[a.type];
        return (
          <li key={a.id} className="relative flex gap-3">
            <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400">
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
