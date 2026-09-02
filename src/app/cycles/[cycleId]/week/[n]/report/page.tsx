import { EmptyState, SectionHeader, StatusBadge, surfaceClasses } from "@/app/components/ui";
import { getWeekReport, formatPercent } from "@/app/core";
import { PrintButton } from "@/app/components/print-button";
import { requireAuth } from "@/app/lib/auth";

function formatValue(value: number, unit: string) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}

function splitNotes(value: string | null | undefined) {
  if (!value) return [];
  return value.split(/\n|; /).map((item) => item.trim()).filter(Boolean);
}

export default async function CycleWeekReportPage({ params }: { params: Promise<{ cycleId: string; n: string }> }) {
  await requireAuth();
  const { cycleId, n } = await params;
  let report: Awaited<ReturnType<typeof getWeekReport>>;
  try {
    report = await getWeekReport(cycleId, Number(n));
  } catch {
    return <EmptyState title="Week report not found" body="The requested cycle/week report does not exist." />;
  }

  const weeklyGoals = splitNotes(report.review?.weeklyGoals);
  const wins = splitNotes(report.review?.wins).length
    ? splitNotes(report.review?.wins)
    : report.dailyLogs.flatMap((log) => splitNotes(log.privateVictories)).slice(0, 5);
  const reflection = [
    ...splitNotes(report.review?.lessons),
    ...splitNotes(report.review?.nextWeekAdjustments),
    ...splitNotes(report.review?.misses),
    ...splitNotes(report.review?.avoidancePatterns)
  ].slice(0, 6);
  const doneCount = report.score.tacticScores.filter((score) => score.score >= 1).length;

  return (
    <section className={`${surfaceClasses} p-5 sm:p-8 print:border-0 print:bg-white print:p-0 print:text-black`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:block">
        <SectionHeader
          eyebrow={`${report.week.startDate} → ${report.week.endDate}`}
          title={`${report.cycle.title} · Week ${report.week.weekNumber} Report`}
        />
        <div className="flex items-center gap-3 print:hidden">
          <StatusBadge status={report.score.status} />
          <PrintButton />
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[0.7fr_1.3fr] print:grid-cols-[0.7fr_1.3fr]">
        <div className="rounded-[16px] border border-border bg-surface-2/50 p-5 print:border-gray-300 print:bg-white">
          <p className="eyebrow">Execution score</p>
          <div className="mt-3 font-display text-5xl font-bold tracking-tight print:text-black">{formatPercent(report.score.weeklyScore)}</div>
          <p className="mt-3 text-sm text-ink-2 print:text-gray-700">
            {doneCount}/{report.score.tacticScores.length} Taktiken erfüllt
          </p>
        </div>
        <div className="rounded-[16px] border border-border bg-surface-2/50 p-5 print:border-gray-300 print:bg-white">
          <p className="eyebrow">12WY Gesamtziele</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 print:grid-cols-3">
            {report.score.goalScores.map((goal) => (
              <div className="rounded-[16px] border border-border bg-surface p-3 print:border-gray-300 print:bg-white" key={goal.goalId}>
                <p className="min-h-10 text-sm font-semibold print:text-black">{goal.goalTitle}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2 print:bg-gray-200">
                  <div className="h-full rounded-full bg-teal" style={{ width: `${Math.round(goal.score * 100)}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-sm text-ink-2 print:text-gray-700">
                  <span>{formatPercent(goal.score)}</span>
                  <StatusBadge status={goal.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_0.8fr_0.8fr] print:grid-cols-[1.1fr_0.8fr_0.8fr]">
        <div className="rounded-[16px] border border-border bg-surface-2/50 p-5 print:border-gray-300 print:bg-white">
          <h2 className="font-display text-lg font-bold tracking-tight print:text-black">Taktiken</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm print:text-xs">
            <thead className="text-left text-xs uppercase tracking-[0.14em] text-ink-3 print:text-gray-600">
              <tr>
                <th className="pb-3 pr-4 font-mono font-medium">Taktik</th>
                <th className="pb-3 pr-4 font-mono font-medium">Progress</th>
                <th className="pb-3 pr-4 font-mono font-medium">Score</th>
                <th className="pb-3 pr-4 font-mono font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {report.score.tacticScores.map((item) => (
                <tr className="border-t border-border print:border-gray-300" key={item.tacticId}>
                  <td className="py-2 pr-4 align-top font-medium print:text-black">{item.tacticTitle}</td>
                  <td className="py-2 pr-4 align-top text-ink-2 print:text-gray-700">
                    {formatValue(item.actual, item.unit)} / {formatValue(item.fullWeekPlanned || item.planned, item.unit)}
                  </td>
                  <td className="py-2 pr-4 align-top text-ink-2 print:text-gray-700">{formatPercent(item.score)}</td>
                  <td className="py-2 pr-4 align-top print:text-black">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="rounded-[16px] border border-border bg-surface-2/50 p-5 print:border-gray-300 print:bg-white">
          <h2 className="font-display text-lg font-bold tracking-tight print:text-black">Größte Wins der Woche</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-2 print:text-gray-700">
            {wins.length ? wins.map((win, index) => <li key={index}>• {win}</li>) : <li>Noch keine Wins notiert.</li>}
          </ul>
        </div>

        <div className="rounded-[16px] border border-border bg-surface-2/50 p-5 print:border-gray-300 print:bg-white">
          <h2 className="font-display text-lg font-bold tracking-tight print:text-black">Weekly Goals / Outcomes</h2>
          <div className="mt-3 space-y-3 text-sm text-ink-2 print:text-gray-700">
            {weeklyGoals.length ? (
              weeklyGoals.map((goal, index) => (
                <div className="rounded-[16px] border border-amber/25 bg-amber/10 p-3 font-semibold print:border-gray-300 print:bg-white print:text-black" key={index}>
                  {goal}
                </div>
              ))
            ) : (
              <p>Noch keine Wochen-Outcomes festgelegt.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[16px] border border-border bg-surface-2/50 p-5 print:border-gray-300 print:bg-white">
        <h2 className="font-display text-lg font-bold tracking-tight print:text-black">Reflection</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-[1.2fr_0.8fr] print:grid-cols-[1.2fr_0.8fr]">
          <ul className="space-y-2 text-sm text-ink-2 print:text-gray-700">
            {reflection.length ? reflection.map((item, index) => <li key={index}>• {item}</li>) : <li>Reflection wird am Ende der Woche gemeinsam ergänzt.</li>}
          </ul>
          <div className="text-sm text-ink-2 print:text-gray-700">
            <p className="eyebrow">Offene Punkte</p>
            <ul className="mt-2 space-y-1">
              {report.highlights.recurringGaps.length ? (
                report.highlights.recurringGaps.map((item) => (
                  <li key={item.tacticId}>
                    • {item.tacticTitle}: {formatValue(item.actual, item.unit)} / {formatValue(item.fullWeekPlanned || item.planned, item.unit)}
                  </li>
                ))
              ) : (
                <li>Keine wiederkehrenden Taktik-Lücken.</li>
              )}
            </ul>
            <p className="eyebrow mt-4">One-time Carry-over</p>
            <ul className="mt-2 space-y-1">
              {report.highlights.carryOverTactics.length ? (
                report.highlights.carryOverTactics.map((item) => (
                  <li key={item.tacticId}>
                    • {item.tacticTitle}: {formatValue(item.actual, item.unit)} / {formatValue(item.fullWeekPlanned || item.planned, item.unit)}
                  </li>
                ))
              ) : (
                <li>Keine einmaligen Punkte zum Übernehmen.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}