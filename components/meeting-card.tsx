"use client";

import Link from "next/link";
import { CalendarX, Check, MapPin, Phone, Video } from "lucide-react";
import { Meeting, MEETING_TYPE_META, fullName } from "@/lib/types";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn, formatMeetingTime } from "@/lib/utils";
import { Avatar } from "./ui";

const TYPE_ICON = { video: Video, call: Phone, in_person: MapPin };

const STATUS_STYLE: Record<Meeting["status"], string> = {
  scheduled: "bg-brand-50 text-brand-700",
  completed: "bg-violet-50 text-violet-700",
  cancelled: "bg-zinc-100 text-zinc-500 line-through",
  no_show: "bg-rose-50 text-rose-600",
};

export function MeetingCard({ meeting, showContact = true }: { meeting: Meeting; showContact?: boolean }) {
  const contact = useCRM((s) => s.contacts.find((c) => c.id === meeting.contactId));
  const setMeetingStatus = useCRM((s) => s.setMeetingStatus);
  const toast = useUI((s) => s.toast);
  const Icon = TYPE_ICON[meeting.type];
  const past = new Date(meeting.start).getTime() < Date.now();

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex w-14 shrink-0 flex-col items-center">
        <span className="text-sm font-semibold tabular-nums text-zinc-900">
          {formatMeetingTime(meeting.start)}
        </span>
        <span className="mt-0.5 text-[11px] text-zinc-400">{meeting.durationMins}m</span>
      </div>

      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-900">{meeting.title}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              STATUS_STYLE[meeting.status]
            )}
          >
            {meeting.status === "no_show" ? "No-show" : meeting.status}
          </span>
        </div>
        <div className="truncate text-xs text-zinc-400">
          {MEETING_TYPE_META[meeting.type].label}
          {meeting.location ? ` · ${meeting.location}` : ""}
        </div>
      </div>

      {showContact && contact && (
        <Link
          href={`/contacts/${contact.id}`}
          className="hidden items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-zinc-100 sm:flex"
        >
          <Avatar contact={contact} size="sm" />
          <span className="text-xs font-medium text-zinc-600">{fullName(contact)}</span>
        </Link>
      )}

      {meeting.status === "scheduled" && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => {
              setMeetingStatus(meeting.id, "completed");
              toast("Marked as held");
            }}
            title="Mark as held"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-brand-50 hover:text-brand-600"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setMeetingStatus(meeting.id, past ? "no_show" : "cancelled");
              toast(past ? "Marked no-show" : "Meeting cancelled");
            }}
            title={past ? "Mark no-show" : "Cancel meeting"}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-500"
          >
            <CalendarX className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
