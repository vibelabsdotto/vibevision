import { EmptyState, ProgressBar, SectionHeader, StatusBadge, surfaceClasses } from "@/app/components/ui";
import {
  formatPercent,
  getCycleWeeks,
  getDashboardData,
  getWeekScore,
  listCycles
} from "@/app/core";
import { requireAuth } from "@/app/lib/auth";
import Link from "next/link";

export default async function WeeksPage() {
  await requireAuth();
  const dash = await getDashboardData();
  let cycle = dash?.cycle ?? null;
  if (!cycle) {
    const cycles = await listCycles();
    cycle = cycles.find((c) => c.status === "active") ?? cycles[0] ?? null;
  }
  if (!cycle) {
    return <EmptyState title="No cycles" body="Create a cycle first — then every 12-week cycle shows up here with its week scores." />;
  }
  const weeks = await getCycleWeeks(cycle.id);
  if (!weeks.length) {
    return <EmptyState title="No weeks" body="This cycle has no week data yet." />;
  }
  const currentWeek = dash?.currentWeek ?? null;
  // score every week that has actually started (past + current); future weeks stay neutral
  const scorable = weeks.filter((week) => (currentWeek ? week.weekNumber <= currentWeek : true));
  // sequential — the PB SDK auto-cancels parallel identical requests on one client
  const scored = [];
  for (const week of scorable) {
    scored.push({ week, score: await getWeekScore(cycle.id, week.weekNumber) });
  }
  const byWeek = new Map(scored.map((entry) => [entry.week.weekNumber, entry.score]));
  const active = dash ? cycle.id === dash.cycle.id : cycle.status === "active";

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow={active ? "Active cycle" : "Cycle"}
        title={`${cycle.title} · Weeks`}
        href={`/cycles/${cycle.id}`}
        label="Open cycle"
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {weeks.map((week) => {
          const score = byWeek.get(week.weekNumber);
          const isCurrent = week.weekNumber === currentWeek;
          const isFuture = !score;
          return (
            <Link
              className={`rounded-[20px] border p-5 transition hover:border-coral/50 ${
                isCurrent ? "border-teal/60 bg-surface shadow-[0_0_0_3px_rgba(31,182,166,0.15)]" : "border-border bg-surface"
              }`}
              href={`/cycles/${cycle.id}/week/${week.weekNumber}`}
              key={week.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">{week.label}</p>
                  <p className="mt-1 font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">
                    {week.startDate} → {week.endDate}
                  </p>
                </div>
                {isCurrent ? (
                  <span className="rounded-full bg-teal/15 px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-teal">
                    now
                  </span>
                ) : (
                  score ? <StatusBadge status={score.status} /> : <span className="text-xs text-ink-3">upcoming</span>
                )}
              </div>
              <div className="mt-4">
                {isFuture ? (
                  <p className="text-sm text-ink-3">No entries yet.</p>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between">
                      <p className="font-display text-2xl font-bold tracking-tight">{formatPercent(score.weeklyScore)}</p>
                      <p className="text-xs text-ink-3">{score.tacticScores.length} tactics</p>
                    </div>
                    <div className="mt-3">
                      <ProgressBar
                        tone={score.status === "on_track" ? "teal" : score.status === "warning" ? "amber" : "error"}
                        value={score.weeklyScore}
                      />
                    </div>
                    <p className="mt-3 truncate text-xs text-ink-2">
                      {score.goalScores.map((goal) => `${goal.goalTitle}: ${formatPercent(goal.score)}`).join(" · ")}
                    </p>
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
