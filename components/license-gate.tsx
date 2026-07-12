"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button, inputClass } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Shown by the app shell when a license is REQUIRED but not yet valid.
 * The buyer pastes the key from their purchase; it's validated against Lemon
 * Squeezy and stored, then the app unlocks. Only ever rendered when
 * REQUIRE_LICENSE is set on the deployment — the owner's instance skips it.
 */
export function LicenseGate({ message }: { message?: string }) {
  const t = useT();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/license", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        window.location.reload();
        return;
      }
      setError(json?.message || json?.error || t("That key isn't valid. Check it and try again.", "Nyckeln är inte giltig. Kontrollera och försök igen."));
    } catch {
      setError(t("Couldn't reach the server. Try again in a moment.", "Kunde inte nå servern. Försök igen om en stund."));
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-zinc-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-surface p-7 shadow-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight text-zinc-900">{t("Activate EmilCRM", "Aktivera EmilCRM")}</div>
            <div className="text-xs text-zinc-400">{t("Enter your license key to unlock", "Ange din licensnyckel för att låsa upp")}</div>
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">{t("License key", "Licensnyckel")}</span>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className={cn(inputClass, "pl-9 font-mono", error && "border-rose-400 focus:border-rose-400 focus:ring-rose-500/20")}
              placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            />
          </div>
        </label>
        {error ? (
          <p className="mt-2 text-xs text-rose-600">{error}</p>
        ) : (
          message && <p className="mt-2 text-xs text-zinc-400">{message}</p>
        )}

        <Button type="submit" disabled={busy || !key.trim()} className="mt-4 w-full">
          {busy ? t("Activating…", "Aktiverar…") : t("Activate", "Aktivera")}
        </Button>

        <p className="mt-4 text-center text-xs text-zinc-400">
          {t("Bought EmilCRM? Your key is in the purchase email. Need help?", "Köpt EmilCRM? Din nyckel finns i köpmejlet. Behöver du hjälp?")}{" "}
          <a href="mailto:emillundholm25@gmail.com" className="text-brand-600 hover:underline">
            {t("Contact support", "Kontakta support")}
          </a>
          .
        </p>
      </form>
    </div>
  );
}
