import { EmptyState, SectionHeader, surfaceClasses } from "@/app/components/ui";
import { listCycles } from "@/app/core";
import { requireAuth } from "@/app/lib/auth";
import Link from "next/link";

export default async function CyclesPage() {
  await requireAuth();
  const cycles = await listCycles();
  if (!cycles.length) {
    return <EmptyState title="No cycles" body="Create your first 12-week cycle via the migration/seed script or the CLI." />;
  }
  return (
    <section className={`${surfaceClasses} p-5 sm:p-7`}>
      <SectionHeader title="Cycles" eyebrow="Every 12-week cycle in the database, ordered by start date." />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {cycles.map((cycle) => (
          <Link
            className="rounded-[16px] border border-border bg-surface-2/50 p-5 transition hover:border-coral/50"
            href={`/cycles/${cycle.id}`}
            key={cycle.id}
          >
            <div className="flex items-start justify-between gap-3">
              <strong className="font-display text-xl font-bold tracking-tight">{cycle.title}</strong>
              <span className="rounded-full bg-surface px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-ink-2">
                {cycle.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-3">
              {cycle.startDate} → {cycle.endDate}
            </p>
            <p className="mt-4 text-sm leading-6 text-ink-2">{cycle.vision || "No vision saved for this cycle."}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}