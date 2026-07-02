"use client";

import { useEffect, useState } from "react";
import {
  Cable,
  Check,
  Copy,
  Database,
  ExternalLink,
  LogOut,
  Monitor,
  Moon,
  Phone,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useT } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/emillundholm25-sys/emilcrm-selfhost/tree/main/cowork-plugin";

const TOOLS: Array<{ name: string; desc: string; descSv: string }> = [
  { name: "emilcrm_get_overview", desc: "Read campaigns, their ICP + search recipe, and existing contacts.", descSv: "Läs kampanjer, deras ICP + sökrecept, och befintliga kontakter." },
  { name: "emilcrm_add_prospects", desc: "Add scored, suggested prospects to a campaign's discovery pool.", descSv: "Lägg till poängsatta, föreslagna prospekt i en kampanjs upptäcktspool." },
  { name: "emilcrm_add_contacts", desc: "Add contacts straight into the pipeline with a first-touch next action.", descSv: "Lägg kontakter direkt i pipelinen med en första nästa åtgärd." },
  { name: "emilcrm_set_next_action", desc: "Set or replace the next action on existing contacts.", descSv: "Sätt eller ersätt nästa åtgärd på befintliga kontakter." },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT();
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          },
          () => {}
        );
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-surface px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-brand-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? t("Copied", "Kopierat") : t("Copy", "Kopiera")}
    </button>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 text-xs leading-relaxed text-zinc-700">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** A configured / not-configured chip; offLabel names the missing env var(s). */
function StatusPill({ on, onLabel, offLabel }: { on?: boolean; onLabel: string; offLabel: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        on === undefined
          ? "bg-zinc-100 text-zinc-500"
          : on
            ? "bg-emerald-50 text-emerald-700"
            : "bg-amber-50 text-amber-700"
      )}
    >
      {on === undefined ? "…" : on ? onLabel : offLabel}
    </span>
  );
}

function Card({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Cable;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-surface shadow-sm">
      <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function AppearanceToggle() {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const t = useT();
  const options: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "light", label: t("Light", "Ljust"), icon: Sun },
    { value: "dark", label: t("Dark", "Mörkt"), icon: Moon },
    { value: "system", label: t("System", "System"), icon: Monitor },
  ];
  return (
    <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            theme === value
              ? "bg-surface text-zinc-900 shadow-sm ring-1 ring-zinc-200"
              : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const openModal = useUI((s) => s.openModal);
  const t = useT();

  const [origin, setOrigin] = useState("https://your-crm.vercel.app");
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [callConfig, setCallConfig] = useState<{ llm: boolean; cloudtalk: boolean } | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/auth")
      .then((r) => r.json())
      .then((s) => setAuthEnabled(!!s.authEnabled))
      .catch(() => setAuthEnabled(null));
    fetch("/api/call/config")
      .then((r) => r.json())
      .then((c) => setCallConfig({ llm: !!c.llm, cloudtalk: !!c.cloudtalk }))
      .catch(() => setCallConfig(null));
  }, []);

  const webhookUrl = `${origin}/api/cloudtalk/webhook?token=YOUR_CLOUDTALK_WEBHOOK_SECRET`;

  const mcpUrl = `${origin}/api/mcp`;
  const jsonConfig = `{
  "mcpServers": {
    "emilcrm": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer YOUR_INGEST_TOKEN" }
    }
  }
}`;
  const cliConfig = `claude mcp add --transport http emilcrm ${mcpUrl} \\
  --header "Authorization: Bearer YOUR_INGEST_TOKEN"`;

  return (
    <>
      <PageHeader title={t("Settings", "Inställningar")} subtitle={t("Connections, backups, and account", "Anslutningar, backup och konto")} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
          {/* Appearance */}
          <Card
            icon={Sun}
            title={t("Appearance", "Utseende")}
            subtitle={t("Choose a light or dark theme, or follow your system setting.", "Välj ljust eller mörkt tema, eller följ din systeminställning.")}
          >
            <AppearanceToggle />
          </Card>

          {/* Connect Claude (MCP) */}
          <Card
            icon={Cable}
            title={t("Connect your own Claude", "Anslut din egen Claude")}
            subtitle={t("EmilCRM exposes an open MCP endpoint — point any MCP client (Claude Code, Cowork, or your own) at it and build a custom connector.", "EmilCRM har en öppen MCP-endpoint — rikta valfri MCP-klient (Claude Code, Cowork eller din egen) mot den och bygg en egen koppling.")}
          >
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Endpoint</span>
              <code className="flex-1 truncate text-xs text-zinc-700">{mcpUrl}</code>
              <CopyButton text={mcpUrl} />
            </div>

            <div className="space-y-3">
              <CodeBlock label={t("MCP config (.mcp.json)", "MCP-konfig (.mcp.json)")} code={jsonConfig} />
              <CodeBlock label={t("Or, Claude Code CLI", "Eller, Claude Code CLI")} code={cliConfig} />
            </div>

            <p className="mt-3 text-xs text-zinc-500">
              {t("Replace", "Ersätt")} <code className="rounded bg-zinc-100 px-1 py-0.5">YOUR_INGEST_TOKEN</code> {t("with this deployment's", "med den här installationens")}{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5">INGEST_TOKEN</code>. {t("The endpoint is bearer-token gated and separate from your login — treat the token like an API key.", "Endpointen skyddas av en bearer-token, separat från din inloggning — behandla token som en API-nyckel.")}
            </p>

            <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {t("Tools exposed", "Tillgängliga verktyg")}
              </div>
              <ul className="space-y-1.5">
                {TOOLS.map((tool) => (
                  <li key={tool.name} className="flex gap-2 text-xs">
                    <code className="shrink-0 rounded bg-surface px-1.5 py-0.5 font-medium text-brand-700 ring-1 ring-zinc-200">
                      {tool.name}
                    </code>
                    <span className="text-zinc-500">{t(tool.desc, tool.descSv)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("Open-source connector — fork it to customise", "Öppen källkod-koppling — forka och anpassa")}
            </a>
          </Card>

          {/* Telephony (CloudTalk) */}
          <Card
            icon={Phone}
            title={t("Telephony (CloudTalk)", "Telefoni (CloudTalk)")}
            subtitle={t("Generate cold-call scripts, dial contacts via CloudTalk, and store transcribed call summaries on each contact.", "Skapa samtalsmanus, ring kontakter via CloudTalk och spara transkriberade samtalssammanfattningar på varje kontakt.")}
          >
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">{t("AI scripts & summaries", "AI-manus & sammanfattningar")}</span>
                <StatusPill
                  on={callConfig?.llm}
                  onLabel={t("Configured", "Konfigurerad")}
                  offLabel="ANTHROPIC_API_KEY"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">{t("Click-to-call", "Klicka-för-att-ringa")}</span>
                <StatusPill
                  on={callConfig?.cloudtalk}
                  onLabel={t("Configured", "Konfigurerad")}
                  offLabel="CLOUDTALK_*"
                />
              </div>
            </div>
            <div className="mt-4">
              <CodeBlock label={t("CloudTalk Workflow Automation → HTTP request", "CloudTalk Workflow Automation → HTTP-begäran")} code={webhookUrl} />
              <p className="mt-2 text-xs text-zinc-500">
                {t(
                  "In CloudTalk, enable Call Recording + Conversation Intelligence, then add a Workflow Automation that POSTs finished-call data (including the transcript) to this URL. Replace the token with your CLOUDTALK_WEBHOOK_SECRET.",
                  "I CloudTalk, aktivera samtalsinspelning + Conversation Intelligence och lägg sedan till en Workflow Automation som POST:ar avslutade samtal (inklusive transkript) till denna URL. Byt ut token mot din CLOUDTALK_WEBHOOK_SECRET."
                )}
              </p>
            </div>
          </Card>

          {/* Data & backup */}
          <Card
            icon={Database}
            title={t("Data & backup", "Data & backup")}
            subtitle={t("Export everything to a JSON file, restore from a backup, or wipe the CRM.", "Exportera allt till en JSON-fil, återställ från en backup, eller rensa ditt CRM.")}
          >
            <Button variant="secondary" onClick={() => openModal({ kind: "data-backup" })}>
              <Database className="h-4 w-4" />
              {t("Open data & backup", "Öppna data & backup")}
            </Button>
            <p className="mt-2 text-xs text-zinc-500">
              {t("Your data lives in your own database, with a local mirror. Download a backup before any big change.", "Din data finns i din egen databas, med en lokal spegel. Ladda ner en backup före större ändringar.")}
            </p>
          </Card>

          {/* About & security */}
          <Card icon={ShieldCheck} title={t("Account & security", "Konto & säkerhet")} subtitle={t("Access to this deployment.", "Åtkomst till den här installationen.")}>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">{t("Login gate", "Inloggningsspärr")}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                    authEnabled === null
                      ? "bg-zinc-100 text-zinc-500"
                      : authEnabled
                        ? "bg-brand-50 text-brand-700"
                        : "bg-amber-50 text-amber-700"
                  )}
                >
                  {authEnabled === null ? "—" : authEnabled ? t("Password protected", "Lösenordsskyddad") : t("Open (no password set)", "Öppen (inget lösenord satt)")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">{t("Prospecting connector", "Prospekterings-koppling")}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                  <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                  {t("MCP at /api/mcp", "MCP på /api/mcp")}
                </span>
              </div>
            </div>
            {authEnabled && (
              <Button
                variant="secondary"
                className="mt-4"
                onClick={async () => {
                  await fetch("/api/logout", { method: "POST" }).catch(() => {});
                  window.location.href = "/login";
                }}
              >
                <LogOut className="h-4 w-4" />
                {t("Log out", "Logga ut")}
              </Button>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
