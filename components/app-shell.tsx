"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Columns3,
  ListChecks,
  LogOut,
  Megaphone,
  Plus,
  Settings,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { useCRM } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { SyncStatus as SyncStatusValue, useSync } from "@/lib/sync-store";
import { useLocale, useT, initLocale } from "@/lib/i18n";
import { initTheme } from "@/lib/theme";
import { Contact } from "@/lib/types";
import { campaignColorClasses, cn, dueBucket, matchesCampaign } from "@/lib/utils";
import { ModalHost } from "./modals";
import { Toasts } from "./toasts";
import { LicenseGate } from "./license-gate";
import { BrandMark } from "./brand-mark";

function NavItem({
  href,
  label,
  icon: Icon,
  count,
  active,
  accent,
}: {
  href: string;
  label: string;
  icon: typeof Zap;
  count?: number;
  active: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
      )}
    >
      <Icon className={cn("h-[18px] w-[18px]", active ? "text-brand-600" : "text-zinc-400 group-hover:text-zinc-500")} />
      <span className="flex-1">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums",
            accent ? "bg-rose-100 text-rose-700" : "bg-zinc-200 text-zinc-600"
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

const SYNC_META: Record<
  Exclude<SyncStatusValue, "idle">,
  { label: string; dot: string; cls: string; tip: string; spin?: boolean }
> = {
  saving: {
    label: "Saving…",
    dot: "bg-amber-400",
    cls: "text-zinc-500",
    tip: "Sending your latest changes to the server.",
    spin: true,
  },
  saved: {
    label: "All changes saved",
    dot: "bg-emerald-500",
    cls: "text-zinc-400",
    tip: "Everything is synced to your cloud database.",
  },
  error: {
    label: "Not synced — retrying",
    dot: "bg-rose-500",
    cls: "text-rose-600",
    tip: "Couldn't reach the server. Changes are safe on this device and will sync automatically when it's back.",
  },
  local: {
    label: "Saved on this device",
    dot: "bg-zinc-300",
    cls: "text-zinc-400",
    tip: "No cloud database is configured — data lives in this browser. Download a backup to be safe.",
  },
};

/** Honest "Saved / Saving… / Not synced" indicator driven by the storage adapter. */
function SyncStatus() {
  const status = useSync((s) => s.status);
  const t = useT();
  if (status === "idle") return null;
  const m = SYNC_META[status];
  const text: Record<Exclude<SyncStatusValue, "idle">, { label: string; tip: string }> = {
    saving: { label: t("Saving…", "Sparar…"), tip: t("Sending your latest changes to the server.", "Skickar dina senaste ändringar till servern.") },
    saved: { label: t("All changes saved", "Allt sparat"), tip: t("Everything is synced to your cloud database.", "Allt är synkat till din molndatabas.") },
    error: { label: t("Not synced — retrying", "Inte synkat — försöker igen"), tip: t("Couldn't reach the server. Changes are safe on this device and will sync automatically when it's back.", "Kunde inte nå servern. Ändringarna är säkra på den här enheten och synkas automatiskt när den är tillbaka.") },
    local: { label: t("Saved on this device", "Sparat på den här enheten"), tip: t("No cloud database is configured — data lives in this browser. Download a backup to be safe.", "Ingen molndatabas är konfigurerad — datan finns i den här webbläsaren. Ladda ner en backup för säkerhets skull.") },
  };
  return (
    <div className={cn("flex items-center gap-1.5 px-3 pb-1.5 text-[11px] font-medium", m.cls)} title={text[status].tip}>
      {m.spin ? (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-zinc-300 border-t-zinc-500" />
      ) : (
        <span className={cn("h-2 w-2 rounded-full", m.dot)} />
      )}
      {text[status].label}
    </div>
  );
}

/** SV | EN language switch shown in the sidebar. */
function LangToggle() {
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  return (
    <div className="mb-1 inline-flex overflow-hidden rounded-md border border-zinc-200 text-[11px] font-semibold">
      {(["sv", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn(
            "px-2 py-1 transition-colors",
            locale === l ? "bg-brand-600 text-white" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
          )}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const contacts = useCRM((s) => s.contacts);
  const meetings = useCRM((s) => s.meetings);
  const prospects = useCRM((s) => s.prospects);
  const campaigns = useCRM((s) => s.campaigns);
  const openModal = useUI((s) => s.openModal);
  const activeCampaignId = useUI((s) => s.activeCampaignId);
  const setActiveCampaign = useUI((s) => s.setActiveCampaign);
  const t = useT();

  // Counts reflect the active campaign scope.
  const scopedContacts = contacts.filter((c) => matchesCampaign(activeCampaignId, c.campaignId));
  const scopedContactIds = new Set(scopedContacts.map((c) => c.id));

  const dueCount = scopedContacts.filter((c) => {
    if (!c.nextAction) return false;
    const b = dueBucket(c.nextActionDate);
    return b === "overdue" || b === "today";
  }).length;

  const upcoming = meetings.filter(
    (m) =>
      scopedContactIds.has(m.contactId) &&
      m.status === "scheduled" &&
      new Date(m.start).getTime() >= Date.now()
  ).length;

  const suggestedCount = prospects.filter(
    (p) => p.status === "suggested" && matchesCampaign(activeCampaignId, p.campaignId)
  ).length;

  const activeCampaigns = campaigns.filter((c) => c.status === "active");

  // Restore the saved campaign selection once campaigns are loaded (per-device).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || campaigns.length === 0) return;
    restored.current = true;
    try {
      const saved = localStorage.getItem("emilcrm-active-campaign");
      if (saved && saved !== "all" && campaigns.some((c) => c.id === saved && c.status === "active")) {
        setActiveCampaign(saved);
      }
    } catch {}
  }, [campaigns, setActiveCampaign]);

  const [authEnabled, setAuthEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((s) => setAuthEnabled(!!s.authEnabled))
      .catch(() => {});
  }, []);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <BrandMark className="h-8 w-8" />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-zinc-900">EmilCRM</div>
          <div className="text-[11px] text-zinc-400">{t("Meeting pipeline", "Mötespipeline")}</div>
        </div>
      </div>

      {/* Campaign scope switcher */}
      <div className="mb-1 px-3">
        <div className="relative">
          <span
            className={cn(
              "pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full",
              activeCampaignId === "all"
                ? "bg-zinc-300"
                : campaignColorClasses(campaigns.find((c) => c.id === activeCampaignId)?.color).dot
            )}
          />
          <select
            value={activeCampaignId}
            onChange={(e) => setActiveCampaign(e.target.value)}
            className="h-9 w-full appearance-none rounded-lg border border-zinc-300 bg-surface pl-6 pr-7 text-sm font-medium text-zinc-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            aria-label="Active campaign"
          >
            <option value="all">{t("All campaigns", "Alla kampanjer")}</option>
            {activeCampaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400">▾</span>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={() => openModal({ kind: "add-contact" })}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          {t("Add contact", "Lägg till kontakt")}
        </button>
        <button
          onClick={() => openModal({ kind: "import-prospect" })}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-surface px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <Sparkles className="h-4 w-4 text-zinc-400" />
          {t("Import from Apollo", "Importera från Apollo")}
        </button>
      </div>

      <nav className="mt-4 flex flex-col gap-0.5 px-3">
        <NavItem href="/" label={t("Action Stream", "Action Stream")} icon={ListChecks} count={dueCount} accent active={pathname === "/"} />
        <NavItem href="/contacts" label={t("Contacts", "Kontakter")} icon={Users} count={scopedContacts.length} active={pathname.startsWith("/contacts")} />
        <NavItem href="/meetings" label={t("Meetings", "Möten")} icon={CalendarDays} count={upcoming} active={pathname.startsWith("/meetings")} />
        <NavItem href="/pipeline" label={t("Pipeline", "Pipeline")} icon={Columns3} active={pathname.startsWith("/pipeline")} />
        <NavItem href="/prospects" label={t("Prospects", "Prospekt")} icon={Target} count={suggestedCount} active={pathname.startsWith("/prospects")} />
        <NavItem href="/campaigns" label={t("Campaigns", "Kampanjer")} icon={Megaphone} count={activeCampaigns.length} active={pathname.startsWith("/campaigns")} />
      </nav>

      <div className="mt-auto border-t border-zinc-100 p-3">
        <SyncStatus />
        <div className="px-3 pb-1.5">
          <LangToggle />
        </div>
        <Link
          href="/settings"
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "bg-zinc-100 text-zinc-900"
              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          {t("Settings", "Inställningar")}
        </Link>
        {authEnabled && (
          <button
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" }).catch(() => {});
              window.location.href = "/login";
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("Log out", "Logga ut")}
          </button>
        )}
      </div>
    </aside>
  );
}

function HydrationGate({ children }: { children: React.ReactNode }) {
  const hasHydrated = useCRM((s) => s.hasHydrated);
  const t = useT();
  if (!hasHydrated) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-brand-600" />
          {t("Loading EmilCRM…", "Laddar EmilCRM…")}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Exposes a small programmatic API on `window.emilCRM` so Claude-in-Chrome (or
 * any automation) can push enriched prospects straight into the CRM without
 * driving the UI. Lives in localStorage, single-user — no auth surface.
 */
function AutomationBridge() {
  useEffect(() => {
    const w = window as unknown as { emilCRM?: unknown };
    w.emilCRM = {
      /** Import Apollo JSON (object or string) or a LinkedIn profile blob. */
      importApollo: (data: unknown) =>
        useCRM.getState().importEnrichment(typeof data === "string" ? data : JSON.stringify(data)),
      /** Create a stub contact from a LinkedIn profile/company URL. */
      importLinkedInUrl: (url: string) => useCRM.getState().importLinkedInUrl(url),
      /** Add a discovered lookalike to the Prospects pool (not yet a contact). */
      addProspect: (input: Parameters<ReturnType<typeof useCRM.getState>["addProspect"]>[0]) =>
        useCRM.getState().addProspect(input),
      /** Add a contact from a plain object of fields. */
      addContact: (input: Parameters<ReturnType<typeof useCRM.getState>["addContact"]>[0]) =>
        useCRM.getState().addContact(input),
      /** Patch an existing contact, e.g. attach phones found on hitta.se. */
      updateContact: (id: string, patch: Partial<Contact>) =>
        useCRM.getState().updateContact(id, patch),
      /** Current contacts (read-only snapshot). */
      contacts: () => useCRM.getState().contacts,
    };
    return () => {
      delete (window as unknown as { emilCRM?: unknown }).emilCRM;
    };
  }, []);
  return null;
}

/**
 * Renders the app, but swaps in the activation screen if this deployment
 * REQUIRES a license and doesn't have a valid one yet. Renders children
 * optimistically (so instances that don't require a license — like the owner's
 * — never pay a load penalty) and only shows the gate once the check confirms
 * it's needed.
 */
function LicenseBoundary({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<{ message?: string } | null>(null);
  useEffect(() => {
    fetch("/api/license")
      .then((r) => r.json())
      .then((s) => {
        if (s?.required && !s?.valid) setGate({ message: s.message });
      })
      .catch(() => {});
  }, []);
  if (gate) return <LicenseGate message={gate.message} />;
  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Resolve the saved/browser locale + theme on the client, after mount.
  useEffect(() => {
    initLocale();
    initTheme();
  }, []);
  // The login screen renders standalone, without the CRM chrome or data gate.
  if (pathname === "/login") return <>{children}</>;

  return (
    <LicenseBoundary>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <HydrationGate>{children}</HydrationGate>
        </main>
        <ModalHost />
        <Toasts />
        <AutomationBridge />
      </div>
    </LicenseBoundary>
  );
}
