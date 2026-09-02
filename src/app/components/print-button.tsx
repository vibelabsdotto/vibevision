"use client";

export function PrintButton() {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-teal hover:text-teal print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      Print / Save as PDF
    </button>
  );
}