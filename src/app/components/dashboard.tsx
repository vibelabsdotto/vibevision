import Link from "next/link";

import { EmptyState, MetricCard, ProgressBar, SectionHeader, StatusBadge, surfaceClasses } from "@/app/components/ui";
import { TacticStepper } from "@/app/components/tactic-stepper";
import { getDashboardData, getOverallScore, formatAmount, formatPercent } from "@/app/core";
import { requireAuth } from "@/app/lib/auth";

export async function DashboardView({ cycleId }: { cycleId?: string }) {
  await requireAuth();
  const data = await getDashboardData(cycleId);
  if (!data) {
    return (
      <EmptyState
        title={cycleId ? "Cycle not found" : "No cycle yet"}
        body={
          cycleId
            ? "The requested cycle does not exist."
            : "Create a 12-week cycle and activate it to populate the dashboard."
        }
      />
    );
  }

  const todayCompletion =
    data.todaySummary.relevantCount > 0 ? data.todaySummary.completedCount / data.todaySummary.relevantCount : 0;
  const overall = await getOverallScore(data.cycle.id, data.currentWeek);

  return (
    <div className="space-y-6">
      {/* hero */}
      <section className={`${surfaceClasses} overflow-hidden`}>
        <div className="px-5 py-6 sm:px-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow">Current cycle</span>
            <StatusBadge status={data.score.status} />
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="brand-gradient-text">{data.cycle.title}</span>
          </h1>
          <p className="mt-2 text-sm text-ink-3">
            {data.cycle.startDate} → {data.cycle.endDate}
          </p>
        </div>
      </section>

      {/* metrics */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className={`${surfaceClasses} p-5`}>
          <p className="eyebrow">Week</p>
          <p className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">{data.currentWeek}/12</p>
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between text-sm text-ink-2">
              <span>Execution score</span>
              <span>{formatPercent(data.score.weeklyScore)}</span>
            </div>
            <ProgressBar tone="coral" value={data.score.weeklyScore} />
          </div>
        </div>
        <MetricCard detail="Including today" label="Days left" value={`${data.daysLeft}`} />
        <MetricCard
          detail={`${data.todaySummary.remainingCount} ${data.todaySummary.remainingCount === 1 ? "tactic" : "tactics"} still open`}
          label="Today complete"
          value={`${data.todaySummary.completedCount}/${data.todaySummary.relevantCount}`}
        />
        <div className={`${surfaceClasses} p-5`}>
          <p className="eyebrow">Overall score</p>
          <p className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">{formatPercent(overall.score)}</p>
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between text-sm text-ink-2">
              <span>{overall.weeksScored} {overall.weeksScored === 1 ? "week" : "weeks"} scored</span>
              <StatusBadge status={overall.status} />
            </div>
            <ProgressBar
              tone={overall.status === "on_track" ? "teal" : overall.status === "warning" ? "amber" : "error"}
              value={overall.score}
            />
          </div>
        </div>
      </section>

      {/* vision */}
      <section className={`${surfaceClasses} p-5 sm:p-7`}>
        <SectionHeader eyebrow="The vision for this cycle." title="Vision" />
        <p className="mt-4 max-w-3xl text-sm leading-6 text-ink-2 sm:text-base">
          {data.cycle.vision || "A focused 12-week operating view for goals, tactics, and daily execution."}
        </p>
      </section>

      {/* today */}
      <section className={`${surfaceClasses} p-5 sm:p-7`}>
        <SectionHeader eyebrow="What needs attention right now." href="/today" label="Open today" title="Today" />
        <div className="mt-6 space-y-4">
          <div className="rounded-[16px] border border-border bg-surface-2/50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Due tactic progress</p>
                <p className="mt-2 font-display text-xl font-bold tracking-tight">
                  {data.todaySummary.completedCount}/{data.todaySummary.relevantCount} completed
                </p>
              </div>
              <span className="rounded-full bg-surface-2 px-3 py-1 text-sm text-ink-2">{data.todaySummary.remainingCount} open</span>
            </div>
            <div className="mt-4">
              <ProgressBar tone="teal" value={todayCompletion} />
            </div>
          </div>

          <div className="space-y-3">
            {data.todayTactics.slice(0, 5).map((score) => {
              const style = score.executionStyle;
              const todayTarget = score.todayTarget ?? 0;
              return (
                <div className="rounded-[16px] border border-border bg-surface-2/50 p-4" key={score.tacticId}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{score.tacticTitle}</p>
                      <p className="mt-1 text-sm text-ink-3">
                        {score.todayLabel} · {score.goalTitle}
                      </p>
                    </div>
                    {style === "toggle" ? (
                      <span className="text-sm text-ink-2">
                        {formatAmount(score.todayActual)}/{formatAmount(todayTarget)} {score.unit}
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <TacticStepper
                          tacticId={score.tacticId}
                          todayActual={score.todayActual}
                          todayTarget={todayTarget}
                          unit={score.unit}
                        />
                        <span className="text-sm text-ink-2">
                          {formatAmount(score.todayActual)}/{formatAmount(todayTarget)} {score.unit}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <ProgressBar tone={score.isTodayComplete ? "teal" : "coral"} value={todayTarget > 0 ? score.todayActual / todayTarget : 0} />
                  </div>
                  <p className="mt-2 text-sm text-ink-3">
                    {score.isTodayComplete
                      ? "Done for today."
                      : `${formatAmount(score.todayRemaining)} ${score.unit} left today.`}
                  </p>
                </div>
              );
            })}
            {!data.todayTactics.length ? <p className="text-sm text-ink-3">No tactics are due today.</p> : null}
          </div>

          {data.todayScheduledBlocks.length ? (
            <div className="rounded-[16px] border border-border bg-surface-2/50 p-5">
              <p className="eyebrow">Scheduled blocks</p>
              <div className="mt-3 space-y-3">
                {data.todayScheduledBlocks.slice(0, 5).map((block) => (
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
                        {formatAmount(block.plannedValue)} {block.unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* scorecard */}
      <section className={`${surfaceClasses} p-5 sm:p-7`}>
        <SectionHeader
          eyebrow="Per-tactic execution for the active week."
          href={`/cycles/${data.cycle.id}/week/${data.currentWeek}`}
          label="Open week"
          title="Weekly scorecard"
        />
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
              {data.score.tacticScores.map((score) => (
                <tr className="border-t border-border" key={score.tacticId}>
                  <td className="py-4 pr-4 align-top">
                    <p className="font-medium">{score.tacticTitle}</p>
                    <p className="mt-1 font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">{score.unit}</p>
                  </td>
                  <td className="py-4 pr-4 align-top text-ink-2">{score.goalTitle}</td>
                  <td className="py-4 pr-4 align-top">
                    <div className="min-w-40">
                      <div className="mb-2 flex items-center justify-between text-sm text-ink-2">
                        <span>
                          {formatAmount(score.actual)}/{formatAmount(score.planned)}
                        </span>
                        <span>{formatPercent(score.score)}</span>
                      </div>
                      <ProgressBar tone={score.status === "on_track" ? "teal" : score.status === "warning" ? "amber" : score.status === "coming" ? "ink" : "error"} value={score.score} />
                    </div>
                  </td>
                  <td className="py-4 pr-4 align-top text-ink-2">{score.weight.toFixed(1)}x</td>
                  <td className="py-4 pr-4 align-top">
                    <StatusBadge status={score.status} />
                  </td>
                </tr>
              ))}
              {!data.score.tacticScores.length ? (
                <tr>
                  <td className="py-4 text-sm text-ink-3" colSpan={5}>
                    No scored tactics this week yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* events */}
      <section className={`${surfaceClasses} p-5 sm:p-7`}>
        <SectionHeader eyebrow="Latest activity recorded for this cycle." title="Recent events" />
        <div className="mt-6 space-y-3">
          {data.recentEvents.length ? (
            data.recentEvents.map((event) => (
              <div className="rounded-[16px] border border-border bg-surface-2/50 p-4" key={event.id}>
                <div className="flex items-center justify-between gap-3">
                  <strong className="font-mono text-sm">{event.type}</strong>
                  <span className="text-sm text-ink-3">{new Date(event.createdAt).toLocaleString("en-US")}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-ink-3">No events yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
