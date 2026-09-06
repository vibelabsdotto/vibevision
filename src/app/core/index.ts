/**
 * VibeVision web core — thin API client over the NestJS backend (contract
 * docs/CONTRACT.md §4). camelCase shapes for pages/components; the API speaks
 * snake_case, mapped at the boundary. Scoring/validation live in the API.
 */
import { ApiError, serverApiFetch } from "@/app/lib/api";
import { sessionCookie } from "@/app/lib/server-auth";
import { todayDateString } from "@/app/lib/format";

export { ApiError };
export {
  amountsEqual,
  formatAmount,
  formatPercent,
  getTacticStepDelta,
  normalizeAmount,
  todayDateString,
  parseDate,
  toDateString,
  addDays,
  startOfIsoWeek,
  slugify
} from "@/app/lib/format";

// ---------------------------------------------------------------- types & mappers (shared, Next-free)
import {
  mapCycle,
  mapWeek,
  mapGoal,
  mapLag,
  mapTactic,
  mapTacticScore,
  mapTodayTactic,
  mapScore,
  mapDailyLog,
  mapBlock,
  mapBlockWithTitles,
  mapDashboard,
  mapReview
} from "./shapes";
import type {
  TrackStatus,
  Cycle,
  CycleWeek,
  Goal,
  LagIndicator,
  Tactic,
  TacticWeekScore,
  TodayTacticProgress,
  TacticTodayState,
  DailyLog,
  CalendarBlock,
  CalendarBlockWithTitles,
  SchedulingItem,
  WeekScore,
  TodaySummary,
  TodayScheduledBlock,
  DashboardData,
  WeeklyReview,
  WeekReportEntry,
  WeekReport,
  ApiRow,
} from "./shapes";
export type {
  TrackStatus,
  Cycle,
  CycleWeek,
  Goal,
  LagIndicator,
  Tactic,
  TacticWeekScore,
  TodayTacticProgress,
  TacticTodayState,
  DailyLog,
  CalendarBlock,
  CalendarBlockWithTitles,
  SchedulingItem,
  WeekScore,
  TodaySummary,
  TodayScheduledBlock,
  DashboardData,
  WeeklyReview,
  WeekReportEntry,
  WeekReport,
  ApiRow,
} from "./shapes";

// ---------------------------------------------------------------- transport

async function get<T>(path: string): Promise<T> {
  return serverApiFetch<T>(path, await sessionCookie());
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  return serverApiFetch<T>(path, await sessionCookie(), { method, body });
}

// ---------------------------------------------------------------- cycles & weeks

export async function listCycles(): Promise<Cycle[]> {
  const data = await get<{ cycles: ApiRow[]; total: number }>("/v1/cycles?limit=100");
  return data.cycles.map(mapCycle);
}

export async function getCycleById(cycleId: string): Promise<Cycle | null> {
  try {
    const data = await get<{ cycle: ApiRow }>(`/v1/cycles/${cycleId}`);
    return mapCycle(data.cycle);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getActiveCycle(): Promise<Cycle | null> {
  const data = await get<{ cycle: ApiRow | null }>("/v1/cycles/active");
  return data.cycle ? mapCycle(data.cycle) : null;
}

export async function createCycle(input: {
  title: string;
  startDate: string;
  vision?: string;
  status?: string;
  slug?: string;
}): Promise<Cycle> {
  const data = await send<{ cycle: ApiRow }>("POST", "/v1/cycles", {
    title: input.title,
    start_date: input.startDate,
    vision: input.vision,
    status: input.status,
    slug: input.slug
  });
  return mapCycle(data.cycle);
}

export async function activateCycleById(cycleId: string): Promise<void> {
  await send("POST", `/v1/cycles/${cycleId}/activate`);
}

export async function activateCycleBySlug(slug: string): Promise<Cycle> {
  const cycles = await listCycles();
  const cycle = cycles.find((entry) => entry.slug === slug);
  if (!cycle) throw new Error(`Cycle not found: ${slug}`);
  await activateCycleById(cycle.id);
  return cycle;
}

export async function updateCycle(input: {
  id: string;
  title?: string;
  vision?: string | null;
  startDate?: string;
}): Promise<Cycle> {
  const data = await send<{ cycle: ApiRow }>("PUT", `/v1/cycles/${input.id}`, {
    title: input.title,
    vision: input.vision,
    start_date: input.startDate
  });
  return mapCycle(data.cycle);
}

export async function getCycleWeeks(cycleId: string): Promise<CycleWeek[]> {
  const data = await get<{ cycle_weeks: ApiRow[]; total: number }>(
    `/v1/cycle-weeks?cycle_id=${encodeURIComponent(cycleId)}&limit=100`
  );
  return data.cycle_weeks.map(mapWeek);
}

export async function getCurrentWeekNumber(cycleId: string, date: string): Promise<number | null> {
  const weeks = await getCycleWeeks(cycleId);
  const week = weeks.find((entry) => entry.startDate <= date && entry.endDate >= date);
  return week ? week.weekNumber : null;
}

// ---------------------------------------------------------------- goals & tactics

export async function listGoals(cycleId: string): Promise<Goal[]> {
  const data = await get<{ goals: ApiRow[]; total: number }>(
    `/v1/goals?cycle_id=${encodeURIComponent(cycleId)}&limit=100`
  );
  return data.goals.map(mapGoal);
}

export async function listTactics(cycleId: string): Promise<Array<{ tactic: Tactic; goalTitle: string }>> {
  const goals = await listGoals(cycleId);
  const goalTitles = new Map(goals.map((goal) => [goal.id, goal.title]));
  const out: Array<{ tactic: Tactic; goalTitle: string }> = [];
  for (const goal of goals) {
    const data = await get<{ tactics: ApiRow[]; total: number }>(
      `/v1/tactics?goal_id=${encodeURIComponent(goal.id)}&limit=100`
    );
    for (const row of data.tactics) {
      out.push({ tactic: mapTactic(row), goalTitle: goalTitles.get(goal.id) ?? "Unknown goal" });
    }
  }
  return out;
}

export async function getTactic(tacticId: string): Promise<Tactic | null> {
  try {
    const data = await get<{ tactic: ApiRow }>(`/v1/tactics/${tacticId}`);
    return mapTactic(data.tactic);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getTacticTodayState(
  tacticId: string,
  date: string = todayDateString()
): Promise<TacticTodayState | null> {
  try {
    const data = await get<{
      tactic: ApiRow;
      execution_style: string;
      today_actual: number;
      today_target: number | null;
    }>(`/v1/tactics/${tacticId}/today-state?date=${encodeURIComponent(date)}`);
    return {
      tactic: mapTactic(data.tactic),
      executionStyle: data.execution_style,
      todayActual: data.today_actual,
      todayTarget: data.today_target
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

// ---------------------------------------------------------------- entries

export async function addTacticEntry(input: {
  tacticId: string;
  cycleId?: string;
  weekNumber?: number;
  value?: number;
  completed?: boolean;
  date?: string | null;
  note?: string | null;
}) {
  const data = await send<{ tactic_entry: ApiRow }>("POST", "/v1/entries/log", {
    tactic_id: input.tacticId,
    cycle_id: input.cycleId,
    week_number: input.weekNumber,
    value: input.value,
    completed: input.completed,
    date: input.date,
    note: input.note
  });
  return data.tactic_entry;
}

export async function completeTactic(tacticId: string, date?: string) {
  return addTacticEntry({ tacticId, completed: true, value: 1, date: date ?? todayDateString() });
}

export async function undoLatestTacticEntry(tacticId: string, date: string) {
  const data = await send<{ undone: string | null }>("POST", "/v1/entries/undo", {
    tactic_id: tacticId,
    date
  });
  return data.undone;
}

// ---------------------------------------------------------------- calendar blocks

export async function addTacticCalendarBlock(input: {
  tacticId: string;
  cycleId?: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  plannedValue?: number | null;
  note?: string | null;
}) {
  const data = await send<{ calendar_block: ApiRow }>("POST", "/v1/calendar-blocks", {
    tactic_id: input.tacticId,
    cycle_id: input.cycleId,
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime,
    duration_minutes: input.durationMinutes,
    planned_value: input.plannedValue,
    note: input.note
  });
  return mapBlock(data.calendar_block);
}

export async function deleteTacticCalendarBlock(blockId: string) {
  const existing = await getCalendarBlock(blockId);
  await send("DELETE", `/v1/calendar-blocks/${blockId}`);
  return existing;
}

export async function getCalendarBlock(blockId: string) {
  try {
    const data = await get<{ calendar_block: ApiRow }>(`/v1/calendar-blocks/${blockId}`);
    return mapBlock(data.calendar_block);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function moveTacticCalendarBlock(input: {
  blockId?: string;
  tacticId?: string;
  fromDate?: string;
  toDate: string;
}) {
  const data = await send<{
    action: "moved";
    source_block_id: string;
    block: ApiRow;
  }>("POST", "/v1/calendar-blocks/move", {
    block_id: input.blockId,
    tactic_id: input.tacticId,
    from_date: input.fromDate,
    to_date: input.toDate
  });
  return { action: data.action, sourceBlockId: data.source_block_id, block: mapBlock(data.block) };
}

export async function listCalendarBlocksForRange(cycleId: string, from: string, to: string) {
  const data = await get<{
    blocks: ApiRow[];
    scheduling: ApiRow[];
    current_week: number | null;
  }>(`/v1/cycles/${cycleId}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  return data.blocks.map(mapBlockWithTitles);
}

export async function listSchedulingState(cycleId: string, weekStartISO: string, weekEndISO: string) {
  const data = await get<{
    blocks: ApiRow[];
    scheduling: ApiRow[];
    current_week: number | null;
  }>(`/v1/cycles/${cycleId}/calendar?from=${encodeURIComponent(weekStartISO)}&to=${encodeURIComponent(weekEndISO)}`);
  return data.scheduling.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    goalTitle: String(row.goal_title),
    executionStyle: String(row.execution_style),
    baseWeekTarget: Number(row.base_week_target),
    weekTargets: (row.week_targets as Record<number, number>) ?? {},
    weekTarget: Number(row.week_target),
    scheduled: Number(row.scheduled),
    remaining: Number(row.remaining),
    scheduledDates: ((row.scheduled_dates as string[]) ?? []).map(String),
    trackingType: String(row.tracking_type),
    unit: String(row.unit)
  }));
}

// ---------------------------------------------------------------- scores & dashboard & report

export async function getWeekScore(
  cycleId: string,
  weekNumber: number,
  options?: { asOfDate?: string; includeAsOfDate?: boolean }
): Promise<WeekScore> {
  const params = new URLSearchParams({ week: String(weekNumber) });
  if (options?.asOfDate) params.set("as_of", options.asOfDate);
  if (options?.includeAsOfDate) params.set("include_as_of", "true");
  const data = await get<{ score: ApiRow }>(`/v1/cycles/${cycleId}/score?${params}`);
  return mapScore(data.score);
}

export async function getOverallScore(
  cycleId: string,
  currentWeek: number
): Promise<{ score: number; status: TrackStatus; weeksScored: number }> {
  const data = await get<{ score: number; status: TrackStatus; weeks_scored: number }>(
    `/v1/cycles/${cycleId}/overall?week=${currentWeek}`
  );
  return { score: data.score, status: data.status, weeksScored: data.weeks_scored };
}

export async function getWeekScoresBatch(
  cycleId: string,
  weekNumbers: number[]
): Promise<Map<number, WeekScore>> {
  if (!weekNumbers.length) return new Map();
  const data = await get<{ scores: ApiRow[] }>(
    `/v1/cycles/${cycleId}/weeks/scores?weeks=${weekNumbers.join(",")}`
  );
  return new Map(data.scores.map((row) => [Number(row.week_number), mapScore(row)]));
}

export async function getDashboardData(
  cycleId?: string,
  weekNumber?: number,
  asOfDate?: string
): Promise<DashboardData | null> {
  const params = new URLSearchParams();
  if (cycleId) params.set("cycle_id", cycleId);
  void weekNumber;
  if (asOfDate) params.set("as_of", asOfDate);
  const query = params.toString();
  const data = await get<{ dashboard: ApiRow | null }>(`/v1/dashboard${query ? `?${query}` : ""}`);
  if (!data.dashboard) return null;
  return mapDashboard(data.dashboard);
}

export async function getWeekReport(cycleId: string, weekNumber: number): Promise<WeekReport> {
  const data = await get<ApiRow>(`/v1/cycles/${cycleId}/weeks/${weekNumber}/report`);
  const review = (data.review as ApiRow) ?? null;
  const score = mapScore(data.score as ApiRow);
  return {
    cycle: mapCycle(data.cycle as ApiRow),
    week: {
      weekNumber: Number((data.week as ApiRow).week_number),
      startDate: String((data.week as ApiRow).start_date),
      endDate: String((data.week as ApiRow).end_date)
    },
    score,
    blocks: ((data.blocks as ApiRow[]) ?? []).map(mapBlockWithTitles),
    dailyLogs: ((data.daily_logs as ApiRow[]) ?? []).map(mapDailyLog),
    entries: ((data.entries as ApiRow[]) ?? []).map((row) => ({
      id: String(row.id),
      date: row.date ? String(row.date) : null,
      tacticTitle: String(row.tactic_title),
      goalTitle: String(row.goal_title),
      value: Number(row.value),
      completed: Boolean(Number(row.completed)),
      note: (row.note as string) || null
    })),
    review: review ? mapReview(review) : null,
    highlights: {
      completedTactics: score.tacticScores.filter((tactic) => tactic.score >= 1),
      offTrackTactics: score.tacticScores.filter((tactic) => tactic.status !== "on_track"),
      carryOverTactics: score.tacticScores.filter(
        (tactic) => tactic.status !== "on_track" && tactic.recurrenceType === "once"
      ),
      recurringGaps: score.tacticScores.filter(
        (tactic) => tactic.status !== "on_track" && tactic.recurrenceType !== "once"
      ),
      bestGoal: [...score.goalScores].sort((a, b) => b.score - a.score)[0] ?? null,
      weakestGoal: [...score.goalScores].sort((a, b) => a.score - b.score)[0] ?? null
    }
  };
}

// ---------------------------------------------------------------- daily logs & check-in

export async function getDailyLog(cycleId: string, date: string): Promise<DailyLog | null> {
  const data = await get<{ daily_log: ApiRow | null }>(
    `/v1/daily-logs?cycle_id=${encodeURIComponent(cycleId)}&date=${encodeURIComponent(date)}`
  );
  return data.daily_log ? mapDailyLog(data.daily_log) : null;
}

export async function listDailyLogs(cycleId: string, from: string, to: string): Promise<DailyLog[]> {
  const data = await get<{ daily_logs: ApiRow[]; total: number }>(
    `/v1/daily-logs?cycle_id=${encodeURIComponent(cycleId)}&limit=100&filters=${encodeURIComponent(
      JSON.stringify([
        { field: "date", op: "is_not_empty" }
      ])
    )}`
  );
  return data.daily_logs
    .map(mapDailyLog)
    .filter((log) => log.date >= from && log.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function morning(input: { oneThing?: string; stress?: number; date?: string }) {
  const data = await send<{ daily_log: ApiRow }>("POST", "/v1/daily-logs/checkin", {
    kind: "morning",
    date: input.date,
    one_thing: input.oneThing,
    stress_level: input.stress
  });
  return mapDailyLog(data.daily_log);
}

export async function evening(input: {
  agency?: number;
  stress?: number;
  wins?: string;
  avoidance?: string;
  notes?: string;
  deepWorkMinutes?: number;
  comfortZoneDone?: boolean;
  date?: string;
}) {
  const data = await send<{ daily_log: ApiRow }>("POST", "/v1/daily-logs/checkin", {
    kind: "evening",
    date: input.date,
    agency_score: input.agency,
    stress_level: input.stress,
    private_victories: input.wins,
    avoidance_trigger: input.avoidance,
    notes: input.notes,
    deep_work_minutes: input.deepWorkMinutes,
    comfort_zone_done: input.comfortZoneDone
  });
  return mapDailyLog(data.daily_log);
}
