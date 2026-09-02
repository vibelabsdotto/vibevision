import { addEntryAction, eveningAction, morningAction } from "@/app/actions";
import { EmptyState, ProgressBar, SectionHeader, StatusBadge, buttonClasses, inputClasses, surfaceClasses } from "@/app/components/ui";
import { getDashboardData, formatPercent } from "@/app/core";
import { requireAuth } from "@/app/lib/auth";

export default async function TodayPage() {
  await requireAuth();
  const data = await getDashboardData();
  if (!data) {
    return <EmptyState title="No active cycle" body="Create and activate a cycle first to start tracking your days." />;
  }

  const todayCompletion =
    data.todaySummary.relevantCount > 0 ? data.todaySummary.completedCount / data.todaySummary.relevantCount : 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className={`${surfaceClasses} p-5 sm:p-7`}>
        <SectionHeader title="Today" eyebrow="Focus view for execution, scheduling, and due tactic status." />

        <div className="mt-6 space-y-4">
          <div className="rounded-[16px] border border-border bg-surface-2/50 p-5">
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
          </div>

          <div className="rounded-[16px] border border-border bg-surface-2/50 p-5">
            <p className="eyebrow">Tactic progress</p>
            <strong className="mt-2 block font-display text-xl font-bold tracking-tight">
              {data.todaySummary.completedCount}/{data.todaySummary.relevantCount} due tactics completed today
            </strong>
            <p className="mt-2 text-sm text-ink-2">{data.todaySummary.remainingCount} tactics still need work today.</p>
            <p className="mt-1 text-sm text-ink-3">{data.todaySummary.totalRemaining.toFixed(1)} units remaining across due tactics.</p>
            <div className="mt-4">
              <ProgressBar tone="teal" value={todayCompletion} />
            </div>
          </div>

          <div className="rounded-[16px] border border-border bg-surface-2/50 p-5">
            <p className="eyebrow">Due tactics today</p>
            <div className="mt-4 space-y-3">
              {data.todayTactics.map((score) => (
                <div className="rounded-[16px] border border-border bg-surface p-4" key={score.tacticId}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{score.tacticTitle}</p>
                      <p className="mt-1 text-sm text-ink-3">{score.todayLabel}</p>
                    </div>
                    <span className="text-sm text-ink-2">
                      {score.todayActual}/{score.todayTarget} {score.unit}
                    </span>
                  </div>
                  <div className="mt-3">
                    <ProgressBar tone={score.isTodayComplete ? "teal" : "coral"} value={score.todayTarget > 0 ? score.todayActual / score.todayTarget : 0} />
                  </div>
                  <p className="mt-2 text-sm text-ink-3">
                    Week {score.actual}/{score.planned} {score.unit}
                    {score.scheduledBlocks.length ? ` · ${score.scheduledBlocks.map((block) => block.startTime ?? "Any time").join(", ")}` : ""}
                  </p>
                </div>
              ))}
              {!data.todayTactics.length ? <p className="text-sm text-ink-3">No tactics are due today.</p> : null}
            </div>
          </div>

          {data.todayScheduledBlocks.length ? (
            <div className="rounded-[16px] border border-border bg-surface-2/50 p-5">
              <p className="eyebrow">Scheduled blocks</p>
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
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-6">
        {/* daily check-in */}
        <section className={`${surfaceClasses} p-5 sm:p-7`}>
          <SectionHeader title="Daily log" eyebrow="Morning and evening check-ins." />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <form action={morningAction} className="rounded-[16px] border border-border bg-surface-2/50 p-5">
              <p className="eyebrow">Morning</p>
              <label className="mt-3 block text-sm text-ink-2">
                One thing
                <input className={`${inputClasses} mt-2`} name="oneThing" placeholder="What is the one thing today?" />
              </label>
              <label className="mt-3 block text-sm text-ink-2">
                Stress 1–10
                <input className={`${inputClasses} mt-2`} max={10} min={1} name="stress" type="number" />
              </label>
              <button className={`${buttonClasses} mt-4 w-full`} type="submit">
                Log morning
              </button>
            </form>
            <form action={eveningAction} className="rounded-[16px] border border-border bg-surface-2/50 p-5">
              <p className="eyebrow">Evening</p>
              <label className="mt-3 block text-sm text-ink-2">
                Agency 1–10
                <input className={`${inputClasses} mt-2`} max={10} min={1} name="agency" type="number" />
              </label>
              <label className="mt-3 block text-sm text-ink-2">
                Stress 1–10
                <input className={`${inputClasses} mt-2`} max={10} min={1} name="stress" type="number" />
              </label>
              <label className="mt-3 block text-sm text-ink-2">
                Wins
                <input className={`${inputClasses} mt-2`} name="wins" placeholder="Private victories" />
              </label>
              <label className="mt-3 block text-sm text-ink-2">
                Avoidance
                <input className={`${inputClasses} mt-2`} name="avoidance" placeholder="What did you avoid?" />
              </label>
              <label className="mt-3 block text-sm text-ink-2">
                Deep work minutes
                <input className={`${inputClasses} mt-2`} min={0} name="deepWorkMinutes" type="number" />
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
                <input name="comfortZoneDone" type="checkbox" /> Comfort zone done
              </label>
              <button className={`${buttonClasses} mt-4 w-full`} type="submit">
                Log evening
              </button>
            </form>
          </div>
        </section>

        {/* tactic logging */}
        <section className={`${surfaceClasses} p-5 sm:p-7`}>
          <SectionHeader title="Log tactic progress" eyebrow="Write progress back through server actions." />
          <div className="mt-6 space-y-4">
            {data.todayTactics.length ? (
              data.todayTactics.map((tactic) => (
                <form action={addEntryAction} className="rounded-[16px] border border-border bg-surface-2/50 p-5" key={tactic.tacticId}>
                  <input name="tacticId" type="hidden" value={tactic.tacticId} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <strong className="font-display text-lg font-bold tracking-tight">{tactic.tacticTitle}</strong>
                      <p className="mt-1 text-sm text-ink-3">{tactic.goalTitle}</p>
                    </div>
                    <div className="text-sm text-ink-3">{tactic.isTodayComplete ? "Done for today" : `${tactic.todayRemaining} remaining today`}</div>
                  </div>
                  <p className="mt-3 text-sm text-ink-3">{tactic.todayLabel}</p>
                  <p className="mt-1 text-sm text-ink-2">
                    Today: {tactic.todayActual}/{tactic.todayTarget} {tactic.unit} • Week: {tactic.actual}/{tactic.planned} {tactic.unit}
                  </p>
                  <div className="mt-4">
                    <ProgressBar tone={tactic.isTodayComplete ? "teal" : "coral"} value={tactic.todayTarget > 0 ? tactic.todayActual / tactic.todayTarget : 0} />
                  </div>
                  {tactic.scheduledBlocks.length ? (
                    <p className="mt-3 text-sm text-ink-3">Blocks: {tactic.scheduledBlocks.map((block) => block.startTime ?? "Any time").join(", ")}</p>
                  ) : null}
                  {tactic.trackingType === "boolean" ? (
                    <input name="mode" type="hidden" value="complete" />
                  ) : (
                    <>
                      <input name="mode" type="hidden" value="progress" />
                      <label className="mt-4 block text-sm text-ink-2">
                        Add {tactic.unit}
                        <input
                          className={`${inputClasses} mt-2`}
                          defaultValue={tactic.todayRemaining > 0 ? Math.min(tactic.todayRemaining, 1) : 1}
                          min="0"
                          name="value"
                          step="0.1"
                          type="number"
                        />
                      </label>
                    </>
                  )}
                  <label className="mt-4 block text-sm text-ink-2">
                    Note
                    <input className={`${inputClasses} mt-2`} name="note" placeholder="Optional context" />
                  </label>
                  <button className={`${buttonClasses} mt-5`} type="submit">
                    {tactic.trackingType === "boolean"
                      ? tactic.isTodayComplete
                        ? "Mark again"
                        : "Complete today's occurrence"
                      : tactic.isTodayComplete
                        ? "Add extra progress"
                        : "Log today's progress"}
                  </button>
                </form>
              ))
            ) : (
              <p className="text-sm text-ink-3">No tactics are due today.</p>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}