import { EmptyState, SectionHeader, surfaceClasses } from "@/app/components/ui";
import { getActiveCycle, listDailyLogs, todayDateString } from "@/app/core";
import type { DailyLog } from "@/app/core";
import { requireAuth } from "@/app/lib/auth";

function formatDate(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function DoneBadge({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase ${
        done ? "bg-teal/15 text-teal" : "bg-surface-2 text-ink-3"
      }`}
    >
      {label} {done ? "✓" : "—"}
    </span>
  );
}

function LogCard({ log }: { log: DailyLog }) {
  return (
    <article className={`${surfaceClasses} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{log.date}</p>
          <h3 className="mt-1 font-display text-lg font-bold tracking-tight text-ink">{formatDate(log.date)}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <DoneBadge label="Morning" done={log.morningDone} />
          <DoneBadge label="Evening" done={log.eveningDone} />
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        {log.oneThing ? (
          <p className="text-ink">
            <span className="font-semibold">One thing: </span>
            {log.oneThing}
          </p>
        ) : null}
        {log.agencyScore !== null || log.stressLevel !== null ? (
          <p className="text-ink-2">
            {log.agencyScore !== null ? `Agency ${log.agencyScore}` : null}
            {log.agencyScore !== null && log.stressLevel !== null ? " · " : null}
            {log.stressLevel !== null ? `Stress ${log.stressLevel}` : null}
          </p>
        ) : null}
        {log.privateVictories ? (
          <p className="text-ink-2">
            <span className="font-semibold text-ink">Wins: </span>
            {log.privateVictories}
          </p>
        ) : null}
        {log.deepWorkMinutes > 0 ? <p className="text-ink-2">{log.deepWorkMinutes} min deep work</p> : null}
        {log.comfortZoneDone ? (
          <span className="inline-flex items-center rounded-full border border-teal/30 bg-teal/10 px-3 py-1 text-xs text-teal">
            Comfort zone ✓
          </span>
        ) : null}
      </div>
    </article>
  );
}

export default async function DailyLogsPage() {
  await requireAuth();
  const cycle = await getActiveCycle();
  if (!cycle) {
    return <EmptyState title="No active cycle" body="Create and activate a cycle first — your daily logs will show up here." />;
  }

  const today = todayDateString();
  const endISO = cycle.endDate < today ? cycle.endDate : today;

  const logs: DailyLog[] =
    cycle.startDate > endISO ? [] : (await listDailyLogs(cycle.id, cycle.startDate, endISO)).reverse();

  if (!logs.length) {
    return (
      <div className="space-y-6">
        <SectionHeader eyebrow={cycle.title} title="Daily Logs" href="/today" label="Log today" />
        <EmptyState title="No daily logs yet" body="Nothing logged in this cycle so far. Head to Today to write your first entry." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow={cycle.title} title="Daily Logs" href="/today" label="Log today" />
      <div className="grid gap-4 sm:grid-cols-2">
        {logs.map((log) => (
          <LogCard key={log.id} log={log} />
        ))}
      </div>
    </div>
  );
}
