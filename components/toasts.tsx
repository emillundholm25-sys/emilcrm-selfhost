"use client";

import { CheckCircle2 } from "lucide-react";
import { useUI } from "@/lib/ui-store";

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2 rounded-xl bg-ink px-3.5 py-2.5 text-sm font-medium text-white shadow-lg ring-1 ring-white/10 animate-pop-in"
        >
          <CheckCircle2 className="h-4 w-4 text-brand-400" />
          {t.message}
        </div>
      ))}
    </div>
  );
}
