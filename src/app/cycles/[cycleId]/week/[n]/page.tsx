import { EmptyState, ProgressBar, SectionHeader, StatusBadge, surfaceClasses } from "@/app/components/ui";
import { getCycleById, getWeekScore, formatPercent } from "@/app/core";
import { requireAuth } from "@/app/lib/auth";
import Link from "next/link";

export default async function CycleWeekPage({ params }: { params: Promise<{ cycleId: string; n: string }> }) {
  await requireAuth();
  const { cycleId, n } = await params;
  const cycle = await getCycleById(cycleId);
  if (!cycle) {
    return <EmptyState title="Cycle not found" body="The requested cycle does not exist." />;
  }
  const score = await getWeekScore(cycle.id, Number(n));

  return (
    <section className={`${surfaceClasses} p-5 sm:p-7`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader eyebrow="Execution score with tactic-level breakdown." title={`${cycle.title} · Week ${n}`} />
        <div className="flex items-center gap-3">
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-teal hover:text-teal"
            href={`/cycles/${cycle.id}/week/${n}/report`}
          >
            Weekly Report
          </a>
          <StatusBadge status={score.status} />
        </div>
      </div>

      <div className="mt-6 rounded-[16px] border border-border bg-surface-2/50 p-5">
        <p className="eyebrow">Execution score</p>
        <div className="mt-3 font-display text-4xl font-bold tracking-tight">{formatPercent(score.weeklyScore)}</div>
        <div className="mt-4">
          <ProgressBar tone={score.status === "on_track" ? "teal" : score.status === "warning" ? "amber" : "error"} value={score.weeklyScore} />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.14em] text-ink-3">
              <th className="pb-3 pr-4 font-mono font-medium">Tactic</th>
              <th className="pb-3 pr-4 font-mono font-medium">Goal</th>
              <th className="pb-3 pr-4 font-mono font-medium">Progress</th>
              <th className="pb-3 pr-4 font-mono font-medium">Score</th>
              <th className="pb-3 pr-4 font-mono font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {score.tacticScores.map((item) => (
              <tr className="border-t border-border" key={item.tacticId}>
                <td className="py-4 pr-4 align-top">
                  <p className="font-medium">{item.tacticTitle}</p>
                  <p className="mt-1 font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">{item.unit}</p>
                </td>
                <td className="py-4 pr-4 align-top text-ink-2">{item.goalTitle}</td>
                <td className="py-4 pr-4 align-top">
                  <div className="min-w-40">
                    <div className="mb-2 flex items-center justify-between text-sm text-ink-2">
                      <span>
                        {item.actual}/{item.planned}
                      </span>
                      <span>{formatPercent(item.score)}</span>
                    </div>
                    <ProgressBar tone={item.status === "on_track" ? "teal" : item.status === "warning" ? "amber" : "error"} value={item.score} />
                  </div>
                </td>
                <td className="py-4 pr-4 align-top text-ink-2">{formatPercent(item.score)}</td>
                <td className="py-4 pr-4 align-top">
                  <StatusBadge status={item.status} />
                </td>
              </tr>
            ))}
            {!score.tacticScores.length ? (
              <tr>
                <td className="py-4 text-sm text-ink-3" colSpan={5}>
                  No scored tactics this week.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}