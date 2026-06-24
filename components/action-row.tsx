"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Check, Pencil, Star } from "lucide-react";
import { Contact, fullName } from "@/lib/types";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn, dateOffset, dueLabel } from "@/lib/utils";
import { Avatar, DueBadge, StageBadge } from "./ui";

export function ActionRow({ contact }: { contact: Contact }) {
  const router = useRouter();
  const completeNextAction = useCRM((s) => s.completeNextAction);
  const toggleStar = useCRM((s) => s.toggleStar);
  const openModal = useUI((s) => s.openModal);
  const toast = useUI((s) => s.toast);
  const [done, setDone] = useState(false);

  const complete = () => {
    setDone(true);
    toast("Action completed — what's next?");
    // Let the strike-through play, then commit and prompt for the next move (GTD loop).
    setTimeout(() => {
      completeNextAction(contact.id);
      openModal({ kind: "next-action", contactId: contact.id });
    }, 320);
  };

  return (
    <div
      onClick={() => router.push(`/contacts/${contact.id}`)}
      className={cn(
        "group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50",
        done && "animate-action-done"
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          complete();
        }}
        title="Mark complete"
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-brand-600 bg-brand-600 text-white"
            : "border-zinc-300 text-transparent hover:border-brand-500 hover:text-brand-500"
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </button>

      <Avatar contact={contact} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-zinc-900">{fullName(contact)}</span>
          {contact.company && (
            <span className="truncate text-xs text-zinc-400">· {contact.company}</span>
          )}
        </div>
        <p className={cn("truncate text-sm text-zinc-600", done && "line-through text-zinc-400")}>
          {contact.nextAction}
        </p>
      </div>

      <RescheduleControl contact={contact} />
      <div className="hidden w-28 justify-end lg:flex">
        <StageBadge stage={contact.stage} />
      </div>

      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            openModal({ kind: "next-action", contactId: contact.id });
          }}
          title="Edit action"
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            openModal({ kind: "book-meeting", contactId: contact.id });
          }}
          title="Book meeting"
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-brand-600"
        >
          <CalendarPlus className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleStar(contact.id);
          }}
          title="Star"
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-amber-500"
        >
          <Star className={cn("h-4 w-4", contact.starred && "fill-amber-400 text-amber-400")} />
        </button>
      </div>
    </div>
  );
}

/** Click the due badge to reschedule the next action right from the stream. */
function RescheduleControl({ contact }: { contact: Contact }) {
  const updateContact = useCRM((s) => s.updateContact);
  const toast = useUI((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Position a fixed menu under the badge — fixed escapes the bucket section's
  // overflow-hidden (which would otherwise clip an absolute dropdown).
  const toggle = () => {
    if (open) return setOpen(false);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 176) });
    setOpen(true);
  };

  const set = (date?: string) => {
    updateContact(contact.id, { nextActionDate: date });
    setOpen(false);
    toast(date ? "Due date updated" : "Moved to Asap");
  };

  const quick: Array<{ label: string; days: number }> = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "In 3 days", days: 3 },
    { label: "Next week", days: 7 },
  ];

  return (
    <div ref={wrapRef} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Reschedule"
        className="rounded-md transition-transform hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        <DueBadge date={contact.nextActionDate} label={dueLabel(contact.nextActionDate)} />
      </button>
      {open && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 w-44 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Reschedule</div>
          {quick.map((q) => (
            <button
              key={q.label}
              onClick={() => set(dateOffset(q.days))}
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              {q.label}
            </button>
          ))}
          <label className="mt-0.5 flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
            <span>Pick a date</span>
            <input
              type="date"
              defaultValue={contact.nextActionDate ?? ""}
              onChange={(e) => e.target.value && set(e.target.value)}
              className="w-[116px] rounded border border-zinc-200 px-1 py-0.5 text-[11px] text-zinc-700"
            />
          </label>
          <button
            onClick={() => set(undefined)}
            className="mt-0.5 flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs font-medium text-zinc-500 hover:bg-zinc-100"
          >
            Asap · no date
          </button>
        </div>
      )}
    </div>
  );
}
