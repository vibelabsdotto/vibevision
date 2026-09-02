import Link from "next/link";

import type { ReactNode } from "react";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const buttonClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[12px] bg-coral px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-coral-hover active:scale-[0.99]";

export const outlineButtonClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[12px] border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-teal hover:text-teal active:scale-[0.99]";

export const surfaceClasses =
  "rounded-[20px] border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

export const inputClasses =
  "w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-teal focus:ring-2 focus:ring-teal/20";

const statusStyles: Record<string, string> = {
  on_track: "bg-teal/15 text-teal",
  warning: "bg-amber/15 text-amber",
  off_track: "bg-error/15 text-error"
};

const statusLabels: Record<string, string> = {
  on_track: "on track",
  warning: "warning",
  off_track: "off track"
};

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? "bg-surface-2 text-ink-2";
  const label = statusLabels[status] ?? status.replace("_", " ");
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase ${style}`}
    >
      <span
        aria-hidden
        className="status-dot"
        style={{
          background:
            status === "on_track"
              ? "var(--teal)"
              : status === "warning"
                ? "var(--amber)"
                : status === "off_track"
                  ? "var(--error)"
                  : "var(--ink-3)"
        }}
      />
      {label}
    </span>
  );
}

const progressTones: Record<string, string> = {
  coral: "bg-coral",
  teal: "bg-teal",
  amber: "bg-amber",
  error: "bg-error",
  ink: "bg-ink-3"
};

export function ProgressBar({ value, tone = "teal" }: { value: number; tone?: "coral" | "teal" | "amber" | "error" | "ink" }) {
  const width = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
      <div className={cx("h-full rounded-full transition-all", progressTones[tone])} style={{ width: `${width}%` }} />
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={`${surfaceClasses} p-6 sm:p-8`}>
      <h2 className="font-display text-2xl tracking-tight text-ink">{title}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-ink-2">{body}</p>
    </div>
  );
}

export function SectionHeader({
  title,
  eyebrow,
  href,
  label
}: {
  title: string;
  eyebrow?: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-1 font-display text-2xl tracking-tight text-ink">{title}</h2>
      </div>
      {href && label ? (
        <Link href={href} className={outlineButtonClasses}>
          {label}
        </Link>
      ) : null}
    </div>
  );
}

export function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className={`${surfaceClasses} p-5`}>
      <p className="eyebrow">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">{value}</p>
      {detail ? <p className="mt-2 text-sm text-ink-3">{detail}</p> : null}
    </div>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "teal" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
        tone === "teal" ? "border-teal/30 bg-teal/10 text-teal" : "border-border bg-surface-2 text-ink-2"
      }`}
    >
      {children}
    </span>
  );
}