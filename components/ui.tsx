"use client";

import { Contact, Stage, STAGE_META, initials } from "@/lib/types";
import { useT, STAGE_LABEL_SV } from "@/lib/i18n";
import { cn, dueBucket } from "@/lib/utils";

export function Avatar({
  contact,
  size = "md",
}: {
  contact: Pick<Contact, "firstName" | "lastName" | "avatarColor">;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        contact.avatarColor,
        dim
      )}
    >
      {initials(contact)}
    </div>
  );
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const m = STAGE_META[stage];
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        m.bg,
        m.text,
        m.border,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {t(m.label, STAGE_LABEL_SV[stage])}
    </span>
  );
}

export function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">
      {label}
    </span>
  );
}

const DUE_STYLES: Record<string, string> = {
  overdue: "bg-rose-50 text-rose-700 border-rose-200",
  today: "bg-brand-50 text-brand-700 border-brand-200",
  tomorrow: "bg-amber-50 text-amber-700 border-amber-200",
  week: "bg-zinc-50 text-zinc-600 border-zinc-200",
  later: "bg-zinc-50 text-zinc-500 border-zinc-200",
  queue: "bg-zinc-50 text-zinc-500 border-zinc-200 border-dashed",
};

export function DueBadge({ date, label }: { date?: string; label: string }) {
  const bucket = dueBucket(date);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        DUE_STYLES[bucket]
      )}
    >
      {label}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  type = "button",
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40";
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    secondary: "bg-surface text-zinc-700 border border-zinc-300 hover:bg-zinc-50",
    ghost: "text-zinc-600 hover:bg-zinc-100",
    danger: "bg-surface text-rose-600 border border-rose-200 hover:bg-rose-50",
  };
  const sizes = { sm: "h-8 px-2.5 text-xs", md: "h-9 px-3.5 text-sm" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border border-zinc-300 bg-surface px-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
