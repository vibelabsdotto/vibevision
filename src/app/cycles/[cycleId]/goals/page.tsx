import { EmptyState, ProgressBar, SectionHeader, StatusBadge, surfaceClasses } from "@/app/components/ui";
import { getDashboardData, formatPercent } from "@/app/core";
import { requireAuth } from "@/app/lib/auth";

export default async function CycleGoalsPage({ params }: { params: Promise<{ cycleId: string }> }) {
  await requireAuth();
  const { cycleId } = await params;
  const data = await getDashboardData(cycleId);
  if (!data) {
    return <EmptyState title="Cycle not found" body="The requested cycle does not exist." />;
  }
  return (
    <section className={`${surfaceClasses} p-5 sm:p-7`}>
      <SectionHeader eyebrow="Goal descriptions, lag indicators, and current weekly score." title={`${data.cycle.title} goals`} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {data.goals.map((goal) => {
          const score = data.score.goalScores.find((row) => row.goalId === goal.id);
          return (
            <div className="rounded-[16px] border border-border bg-surface-2/50 p-5" key={goal.id}>
              <div className="flex items-start justify-between gap-3">
                <strong className="font-display text-lg font-bold tracking-tight">{goal.title}</strong>
                <StatusBadge status={score?.status ?? "off_track"} />
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-2">{goal.description || "No description yet."}</p>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-sm text-ink-2">
                  <span>Weekly score</span>
                  <span>{score ? formatPercent(score.score) : "0%"}</span>
                </div>
                <ProgressBar
                  tone={score?.status === "on_track" ? "teal" : score?.status === "warning" ? "amber" : "error"}
                  value={score?.score ?? 0}
                />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {goal.lagIndicators.length ? (
                  goal.lagIndicators.map((lag) => (
                    <span
                      className={`rounded-full border px-3 py-1 text-xs ${
                        lag.achieved ? "border-teal/30 bg-teal/10 text-teal" : "border-border bg-surface text-ink-2"
                      }`}
                      key={lag.id}
                    >
                      {lag.title}
                      {lag.achieved ? " done" : ""}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-ink-3">No lag indicators yet.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}