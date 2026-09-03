import { DailyCheckin } from "@/app/components/daily-checkin";
import { TacticDayCard } from "@/app/components/tactic-day-card";
import { EmptyState, ProgressBar, SectionHeader, StatusBadge, surfaceClasses } from "@/app/components/ui";
import { getDailyLog, getDashboardData, formatPercent, todayDateString } from "@/app/core";
import { requireAuth } from "@/app/lib/auth";

export default async function TodayPage() {
  await requireAuth();
  const data = await getDashboardData();
  if (!data) {
    return <EmptyState title="No active cycle" body="Create and activate a cycle first to start tracking your days." />;
  }

  const today = todayDateString();
  const log = await getDailyLog(data.cycle.id, today);

  const todayCompletion =
    data.todaySummary.relevantCount > 0 ? data.todaySummary.completedCount / data.todaySummary.relevantCount : 0;

  return (
    <div className="space-y-6">
      <section className={`${surfaceClasses} p-5 sm:p-7`}>
        <SectionHeader title="Daily log for today" eyebrow="Morning and evening check-ins." />
        <DailyCheckin log={log} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={`${surfaceClasses} p-5 sm:p-7`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Current week</p>
              <strong className="mt-2 block font-display text-3xl font-bold tracking-tight">Week {data.currentWeek}</strong>
            </div>
            <StatusBadge status={data.score.status} />
          </div>
          <p className="mt-3 text-sm text-ink-2">Weekly score: {formatPercent(data.score.weeklyScore)}</p>
          <div className="mt-4">
            <ProgressBar tone="coral" value={data.score.weeklyScore} />
          </div>
        </section>

        <section className={`${surfaceClasses} p-5 sm:p-7`}>
          <p className="eyebrow">Tactic progress</p>
          <strong className="mt-2 block font-display text-xl font-bold tracking-tight">
            {data.todaySummary.completedCount}/{data.todaySummary.relevantCount} due tactics completed today
          </strong>
          <p className="mt-2 text-sm text-ink-2">{data.todaySummary.remainingCount} tactics still need work today.</p>
          <p className="mt-1 text-sm text-ink-3">{data.todaySummary.totalRemaining.toFixed(1)} units remaining across due tactics.</p>
          <div className="mt-4">
            <ProgressBar tone="teal" value={todayCompletion} />
          </div>
        </section>
      </div>

      <section className={`${surfaceClasses} p-5 sm:p-7`}>
        <SectionHeader title="Due tactics today" eyebrow="Log progress directly on each card." />
        <div className="mt-6 space-y-4">
          {data.todayTactics.map((tactic) => (
            <TacticDayCard key={tactic.tacticId} tactic={tactic} />
          ))}
          {!data.todayTactics.length ? <p className="text-sm text-ink-3">No tactics are due today.</p> : null}
        </div>
      </section>

      {data.todayScheduledBlocks.length ? (
        <section className={`${surfaceClasses} p-5 sm:p-7`}>
          <SectionHeader title="Scheduled blocks" eyebrow="Today's calendar." />
          <div className="mt-4 space-y-3">
            {data.todayScheduledBlocks.map((block) => (
              <div className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0" key={block.id}>
                <div>
                  <p className="font-medium">{block.tacticTitle}</p>
                  <p className="text-sm text-ink-3">{block.goalTitle}</p>
                </div>
                <div className="text-right text-sm text-ink-2">
                  <p>
                    {block.startTime ?? "Any time"}
                    {block.endTime ? `-${block.endTime}` : ""}
                  </p>
                  <p>
                    {block.plannedValue} {block.unit}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
