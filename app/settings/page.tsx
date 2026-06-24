"use client";

import { useEffect, useState } from "react";
import {
  Cable,
  Check,
  Copy,
  Database,
  ExternalLink,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/emillundholm25-sys/emilcrm-selfhost/tree/main/cowork-plugin";

const TOOLS: Array<{ name: string; desc: string }> = [
  { name: "emilcrm_get_overview", desc: "Read campaigns, their ICP + search recipe, and existing contacts." },
  { name: "emilcrm_add_prospects", desc: "Add scored, suggested prospects to a campaign's discovery pool." },
  { name: "emilcrm_add_contacts", desc: "Add contacts straight into the pipeline with a first-touch next action." },
  { name: "emilcrm_set_next_action", desc: "Set or replace the next action on existing contacts." },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
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
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-brand-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
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
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
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

export default function SettingsPage() {
  const openModal = useUI((s) => s.openModal);

  const [origin, setOrigin] = useState("https://your-crm.vercel.app");
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/auth")
      .then((r) => r.json())
      .then((s) => setAuthEnabled(!!s.authEnabled))
      .catch(() => setAuthEnabled(null));
  }, []);

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
      <PageHeader title="Settings" subtitle="Connections, backups, and account" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
          {/* Connect Claude (MCP) */}
          <Card
            icon={Cable}
            title="Connect your own Claude"
            subtitle="EmilCRM exposes an open MCP endpoint — point any MCP client (Claude Code, Cowork, or your own) at it and build a custom connector."
          >
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Endpoint</span>
              <code className="flex-1 truncate text-xs text-zinc-700">{mcpUrl}</code>
              <CopyButton text={mcpUrl} />
            </div>

            <div className="space-y-3">
              <CodeBlock label="MCP config (.mcp.json)" code={jsonConfig} />
              <CodeBlock label="Or, Claude Code CLI" code={cliConfig} />
            </div>

            <p className="mt-3 text-xs text-zinc-500">
              Replace <code className="rounded bg-zinc-100 px-1 py-0.5">YOUR_INGEST_TOKEN</code> with this deployment's{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5">INGEST_TOKEN</code>. The endpoint is bearer-token gated
              and separate from your login — treat the token like an API key.
            </p>

            <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Tools exposed
              </div>
              <ul className="space-y-1.5">
                {TOOLS.map((t) => (
                  <li key={t.name} className="flex gap-2 text-xs">
                    <code className="shrink-0 rounded bg-white px-1.5 py-0.5 font-medium text-brand-700 ring-1 ring-zinc-200">
                      {t.name}
                    </code>
                    <span className="text-zinc-500">{t.desc}</span>
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
              Open-source connector — fork it to customise
            </a>
          </Card>

          {/* Data & backup */}
          <Card
            icon={Database}
            title="Data & backup"
            subtitle="Export everything to a JSON file, restore from a backup, or wipe the CRM."
          >
            <Button variant="secondary" onClick={() => openModal({ kind: "data-backup" })}>
              <Database className="h-4 w-4" />
              Open data &amp; backup
            </Button>
            <p className="mt-2 text-xs text-zinc-500">
              Your data lives in your own database, with a local mirror. Download a backup before any big change.
            </p>
          </Card>

          {/* About & security */}
          <Card icon={ShieldCheck} title="Account &amp; security" subtitle="Access to this deployment.">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Login gate</span>
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
                  {authEnabled === null ? "—" : authEnabled ? "Password protected" : "Open (no password set)"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Prospecting connector</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                  <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                  MCP at /api/mcp
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
                Log out
              </Button>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
