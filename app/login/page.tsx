"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { Button, inputClass } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(false);
    setLockedFor(0);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const from = new URLSearchParams(window.location.search).get("from") || "/";
        window.location.href = from.startsWith("/") ? from : "/";
        return;
      }
      if (res.status === 429) {
        const data = await res.json().catch(() => ({ retryAfter: 0 }));
        setLockedFor(Math.max(1, Math.ceil((Number(data?.retryAfter) || 0) / 60)));
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-zinc-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-surface p-7 shadow-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Zap className="h-5 w-5" fill="currentColor" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight text-zinc-900">EmilCRM</div>
            <div className="text-xs text-zinc-400">{t("Sign in to continue", "Logga in för att fortsätta")}</div>
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">{t("Password", "Lösenord")}</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(inputClass, (error || lockedFor > 0) && "border-rose-400 focus:border-rose-400 focus:ring-rose-500/20")}
            placeholder="••••••••"
          />
        </label>
        {error && <p className="mt-2 text-xs text-rose-600">{t("Incorrect password. Try again.", "Fel lösenord. Försök igen.")}</p>}
        {lockedFor > 0 && (
          <p className="mt-2 text-xs text-rose-600">
            {t(
              `Too many attempts. Try again in ${lockedFor} min.`,
              `För många försök. Försök igen om ${lockedFor} min.`
            )}
          </p>
        )}

        <Button type="submit" disabled={busy || !password || lockedFor > 0} className="mt-4 w-full">
          {busy ? t("Signing in…", "Loggar in…") : t("Sign in", "Logga in")}
        </Button>
      </form>
    </div>
  );
}
