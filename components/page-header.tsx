"use client";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-surface/80 px-4 py-3.5 backdrop-blur sm:gap-4 sm:px-7 sm:py-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-900">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
