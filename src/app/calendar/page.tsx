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

export default async function CalendarPage() {
  await requireAuth();
  const cycle = await getActiveCycle();
  if (!cycle) {
    return (
      <EmptyState
        title="No active cycle"
        body="Create and activate a cycle first. Your calendar will show up here."
      />
    );
  }

  const today = todayDateString();
  const weekMonday = startOfIsoWeek(parseDate(today));
  const weekStart = toDateString(weekMonday);
  const weekEnd = toDateString(addDays(weekMonday, 6));
  const cycleWeeks = (await getCycleWeeks(cycle.id)).map((week) => ({
    weekNumber: Number(week.weekNumber),
    startDate: String(week.startDate),
    endDate: String(week.endDate)
  }));
  const currentWeek = today >= cycle.startDate && today <= cycle.endDate
    ? cycleWeeks.find((week) => today >= week.startDate && today <= week.endDate)
    : undefined;

  // Never substitute a past or future cycle week when today has no match.
  const blocksRaw = currentWeek ? await listCalendarBlocksForRange(cycle.id, weekStart, weekEnd) : [];
  const backlogRaw = currentWeek ? await listSchedulingState(cycle.id, weekStart, weekEnd) : [];

  // Normalize to plain-JSON-serializable props for the client board.
  const blocks: CalendarBlockWithTitle[] = blocksRaw.map((entry) => ({
    id: String(entry.id),
    tacticId: String(entry.tacticId),
    cycleId: String(entry.cycleId),
    weekNumber: Number(entry.weekNumber),
    date: String(entry.date),
    originalDate: entry.originalDate != null ? String(entry.originalDate) : null,
    scheduledValue: entry.scheduledValue != null ? Number(entry.scheduledValue) : null,
    startTime: (entry.startTime as string | null) ?? null,
    endTime: (entry.endTime as string | null) ?? null,
    durationMinutes: (entry.durationMinutes as number | null) ?? null,
    plannedValue: Number(entry.plannedValue),
    note: (entry.note as string | null) ?? null,
    tacticTitle: String(entry.tacticTitle ?? "Untitled"),
    goalTitle: String(entry.goalTitle ?? ""),
    unit: entry.unit != null ? String(entry.unit) : null
  }));
  const backlog: BacklogTactic[] = backlogRaw
    .filter((item) => {
      const style = item.executionStyle || (item.trackingType === "boolean" ? "toggle" : "volume");
      return style !== "toggle" && Number(item.weekTarget) > 0;
    })
    .map((item) => ({
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
        key={`${cycle.id}:${weekStart}`}
        cycleStart={cycle.startDate}
        cycleEnd={cycle.endDate}
        cycleWeeks={cycleWeeks}
        today={today}
        blocks={blocks}
        backlog={backlog}
      />
    </div>
  );
}
