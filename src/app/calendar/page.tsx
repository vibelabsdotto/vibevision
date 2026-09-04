import { CalendarBoard } from "@/app/components/calendar-board";
import { EmptyState, SectionHeader } from "@/app/components/ui";
import type { BacklogTactic, CalendarBlockWithTitle } from "@/app/components/calendar-block-card";
import {
  addDays,
  getActiveCycle,
  getCycleWeeks,
  listCalendarBlocksForRange,
  listSchedulingState,
  parseDate,
  startOfIsoWeek,
  toDateString,
  todayDateString
} from "@/app/core";
import { requireAuth } from "@/app/lib/auth";

const MONTH_PARAM_PATTERN = /^\d{4}-\d{2}$/;

function clampMonthKey(monthKey: string, minKey: string, maxKey: string): string {
  if (monthKey < minKey) return minKey;
  if (monthKey > maxKey) return maxKey;
  return monthKey;
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const base = parseDate(`${monthKey}-01`);
  const shifted = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

export default async function CalendarPage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string | string[] }>;
}) {
  await requireAuth();
  const cycle = await getActiveCycle();
  if (!cycle) {
    return (
      <EmptyState
        title="No active cycle"
        body="Create and activate a cycle first — your calendar will show up here."
      />
    );
  }

  const today = todayDateString();
  const referenceDate = today < cycle.startDate ? cycle.startDate : today > cycle.endDate ? cycle.endDate : today;
  const params = (await searchParams) ?? {};
  const rawMonth = Array.isArray(params.month) ? params.month[0] : params.month;
  const requestedMonth = rawMonth && MONTH_PARAM_PATTERN.test(rawMonth) ? rawMonth : referenceDate.slice(0, 7);
  const monthKey = clampMonthKey(requestedMonth, cycle.startDate.slice(0, 7), cycle.endDate.slice(0, 7));

  const monthStart = parseDate(`${monthKey}-01`);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  const monthEndISO = monthEnd.toISOString().slice(0, 10);

  // Full Monday–Sunday grid covering the month (leading/trailing days included).
  const gridStartISO = toDateString(startOfIsoWeek(monthStart));
  const gridEndISO = toDateString(addDays(startOfIsoWeek(monthEnd), 6));

  // Sequential awaits — the PB SDK auto-cancels parallel identical requests on one client.
  const cycleWeeks = (await getCycleWeeks(cycle.id)).map((week) => ({
    weekNumber: Number(week.weekNumber),
    startDate: String(week.startDate),
    endDate: String(week.endDate)
  }));
  const blocksRaw = await listCalendarBlocksForRange(cycle.id, gridStartISO, gridEndISO);
  // Scheduling progress always references the current week (Mon–Sun), independent of the shown month.
  const refWeekMonday = startOfIsoWeek(parseDate(referenceDate));
  const refWeekStartISO = toDateString(refWeekMonday);
  const refWeekEndISO = toDateString(addDays(refWeekMonday, 6));
  const backlogRaw = await listSchedulingState(cycle.id, refWeekStartISO, refWeekEndISO);

  // Normalize to plain-JSON-serializable props for the client board.
  const blocks: CalendarBlockWithTitle[] = blocksRaw.map((entry) => ({
    id: String(entry.id),
    tacticId: String(entry.tacticId),
    cycleId: String(entry.cycleId),
    weekNumber: Number(entry.weekNumber),
    date: String(entry.date),
    startTime: (entry.startTime as string | null) ?? null,
    endTime: (entry.endTime as string | null) ?? null,
    durationMinutes: (entry.durationMinutes as number | null) ?? null,
    plannedValue: Number(entry.plannedValue),
    note: (entry.note as string | null) ?? null,
    tacticTitle: String(entry.tacticTitle ?? "Untitled"),
    goalTitle: String(entry.goalTitle ?? ""),
    unit: entry.unit != null ? String(entry.unit) : null
  }));
  const backlog: BacklogTactic[] = backlogRaw.map((item) => ({
    tacticId: String(item.id),
    title: String(item.title ?? "Untitled"),
    goalTitle: item.goalTitle != null ? String(item.goalTitle) : null,
    trackingType: item.trackingType != null ? String(item.trackingType) : null,
    executionStyle: String(item.executionStyle ?? ""),
    unit: item.unit != null ? String(item.unit) : null,
    baseWeekTarget: Number(item.baseWeekTarget ?? 0),
    weekTargets: Object.fromEntries(
      Object.entries(item.weekTargets ?? {}).map(([weekNumber, target]) => [Number(weekNumber), Number(target)])
    ),
    weekTarget: Number(item.weekTarget ?? 0)
  }));

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow={cycle.title} title="Calendar" href="/today" label="Open today" />
      <CalendarBoard
        cycleId={cycle.id}
        cycleStart={cycle.startDate}
        cycleEnd={cycle.endDate}
        cycleWeeks={cycleWeeks}
        monthKey={monthKey}
        prevMonthKey={shiftMonthKey(monthKey, -1)}
        nextMonthKey={shiftMonthKey(monthKey, 1)}
        gridStart={gridStartISO}
        gridEnd={gridEndISO}
        monthStart={toDateString(monthStart)}
        monthEnd={monthEndISO}
        today={today}
        blocks={blocks}
        backlog={backlog}
      />
    </div>
  );
}
