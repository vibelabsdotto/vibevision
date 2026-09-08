/**
 * Shared API shapes — Next-free (no next/* imports): used by the web core
 * (@/app/core) AND the CLI. snake_case API rows in, camelCase web shapes out.
 */
// ---------------------------------------------------------------- types (camelCase)

export type TrackStatus = "on_track" | "warning" | "off_track" | "coming";

export type Cycle = {
  id: string;
  slug: string;
  title: string;
  vision: string | null;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CycleWeek = {
  id: string;
  cycleId: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  label: string;
};

export type Goal = {
  id: string;
  cycleId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  status: string;
};

export type LagIndicator = {
  id: string;
  goalId: string;
  title: string;
  type: string;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  achieved: boolean;
  sortOrder: number;
};

export type Tactic = {
  id: string;
  goalId: string;
  title: string;
  type: string;
  trackingType: string;
  recurrenceType: string;
  recurrenceCount: number;
  targetValue: number;
  unit: string;
  executionStyle?: string;
  targetPerWeek: number | null;
  targetPerDay: number | null;
  scoringWeight: number;
  startsWeek: number | null;
  endsWeek: number | null;
  active: boolean;
  sortOrder: number;
};

export type TacticWeekScore = {
  tacticId: string;
  tacticTitle: string;
  goalId: string;
  goalTitle: string;
  planned: number;
  fullWeekPlanned: number;
  actual: number;
  score: number;
  weight: number;
  status: TrackStatus;
  unit: string;
  scheduled?: number;
  trackingType: string;
  recurrenceType: string;
  recurrenceCount: number;
  targetValue: number;
  executionStyle: string;
};

export type TodayTacticProgress = TacticWeekScore & {
  remaining: number;
  isComplete: boolean;
  todayActual: number;
  todayTarget: number | null;
  todayRemaining: number;
  isTodayComplete: boolean;
  dueToday: boolean;
  todayKind: "scheduled" | "recurring" | "unscheduled" | "pool";
  todayLabel: string;
  weekRemaining: number;
  weekTarget: number;
  scheduledBlocks: Array<{
    id: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    durationMinutes: number | null;
    plannedValue: number;
    note: string | null;
  }>;
};

export type TacticTodayState = {
  tactic: Tactic;
  executionStyle: string;
  todayActual: number;
  todayTarget: number | null;
};

export type DailyLog = {
  id: string;
  cycleId: string;
  date: string;
  oneThing: string | null;
  morningDone: boolean;
  eveningDone: boolean;
  stressLevel: number | null;
  agencyScore: number | null;
  comfortZoneDone: boolean;
  deepWorkMinutes: number;
  avoidanceTrigger: string | null;
  privateVictories: string | null;
  notes: string | null;
};

export type CalendarBlock = {
  id: string;
  tacticId: string;
  cycleId: string;
  weekNumber: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  plannedValue: number;
  note: string | null;
};

export type CalendarBlockWithTitles = CalendarBlock & {
  originalDate: string;
  scheduledValue: number;
  tacticTitle: string;
  goalTitle: string;
  unit: string;
};

export type SchedulingItem = {
  id: string;
  title: string;
  goalTitle: string;
  executionStyle: string;
  baseWeekTarget: number;
  weekTargets: Record<number, number>;
  weekTarget: number;
  scheduled: number;
  remaining: number;
  scheduledDates: string[];
  trackingType: string;
  unit: string;
};

export type WeekScore = {
  cycleId: string;
  weekNumber: number;
  weeklyScore: number;
  status: TrackStatus;
  goalScores: Array<{ goalId: string; goalTitle: string; score: number; status: TrackStatus }>;
  tacticScores: TacticWeekScore[];
};

export type TodaySummary = {
  relevantCount: number;
  completedCount: number;
  remainingCount: number;
  totalRemaining: number;
};

export type TodayScheduledBlock = {
  id: string;
  tacticId: string;
  tacticTitle: string;
  goalTitle: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  plannedValue: number;
  note: string | null;
  unit: string;
};

export type DashboardData = {
  cycle: Cycle;
  currentWeek: number;
  weeks: CycleWeek[];
  goals: Array<Goal & { lagIndicators: LagIndicator[] }>;
  score: WeekScore;
  tactics: Array<{ tactic: Tactic; goalTitle: string }>;
  daysLeft: number;
  todaySummary: TodaySummary;
  todayTactics: TodayTacticProgress[];
  todayScheduledBlocks: TodayScheduledBlock[];
  recentEvents: Array<{ id: string; type: string; createdAt: string }>;
  reviews: WeeklyReview[];
};

export type WeeklyReview = {
  id: string;
  cycleId: string;
  weekNumber: number;
  executionScore: number | null;
  weeklyGoals: string | null;
  wins: string | null;
  misses: string | null;
  avoidancePatterns: string | null;
  lessons: string | null;
  nextWeekAdjustments: string | null;
  completedAt: string | null;
};

export type WeekReportEntry = {
  id: string;
  date: string | null;
  tacticTitle: string;
  goalTitle: string;
  value: number;
  completed: boolean;
  note: string | null;
};

export type WeekReport = {
  cycle: Cycle;
  week: { weekNumber: number; startDate: string; endDate: string };
  score: WeekScore;
  blocks: CalendarBlockWithTitles[];
  dailyLogs: DailyLog[];
  entries: WeekReportEntry[];
  review: WeeklyReview | null;
  highlights: {
    completedTactics: TacticWeekScore[];
    offTrackTactics: TacticWeekScore[];
    carryOverTactics: TacticWeekScore[];
    recurringGaps: TacticWeekScore[];
    bestGoal: WeekScore["goalScores"][number] | null;
    weakestGoal: WeekScore["goalScores"][number] | null;
  };
};

// ---------------------------------------------------------------- mappers (snake_case API → camelCase)

export type ApiRow = Record<string, unknown>;

type R = ApiRow;

export function mapCycle(row: R): Cycle {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    vision: (row.vision as string) ?? null,
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function mapWeek(row: R): CycleWeek {
  return {
    id: String(row.id),
    cycleId: String(row.cycle_id),
    weekNumber: Number(row.week_number),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    label: String(row.label)
  };
}

export function mapGoal(row: R): Goal {
  return {
    id: String(row.id),
    cycleId: String(row.cycle_id),
    title: String(row.title),
    description: (row.description as string) ?? null,
    sortOrder: Number(row.sort_order),
    status: String(row.status)
  };
}

export function mapLag(row: R): LagIndicator {
  return {
    id: String(row.id),
    goalId: String(row.goal_id),
    title: String(row.title),
    type: String(row.type ?? ""),
    targetValue: Number(row.target_value),
    currentValue: Number(row.current_value),
    unit: (row.unit as string) ?? null,
    achieved: Number(row.achieved) === 1,
    sortOrder: Number(row.sort_order)
  };
}

export function mapTactic(row: R): Tactic {
  return {
    id: String(row.id),
    goalId: String(row.goal_id),
    title: String(row.title),
    type: String(row.type),
    trackingType: String(row.tracking_type),
    recurrenceType: String(row.recurrence_type),
    recurrenceCount: Number(row.recurrence_count),
    targetValue: Number(row.target_value),
    unit: String(row.unit),
    executionStyle: (row.execution_style as string) || undefined,
    targetPerWeek: (row.target_per_week as number) ?? null,
    targetPerDay: (row.target_per_day as number) ?? null,
    scoringWeight: Number(row.scoring_weight),
    startsWeek: (row.starts_week as number) ?? null,
    endsWeek: (row.ends_week as number) ?? null,
    active: Number(row.active) === 1,
    sortOrder: Number(row.sort_order)
  };
}

export function mapTacticScore(row: R): TacticWeekScore {
  return {
    tacticId: String(row.tactic_id),
    tacticTitle: String(row.tactic_title),
    goalId: String(row.goal_id),
    goalTitle: String(row.goal_title),
    planned: Number(row.planned),
    fullWeekPlanned: Number(row.full_week_planned),
    actual: Number(row.actual),
    score: Number(row.score),
    weight: Number(row.weight),
    status: row.status as TrackStatus,
    unit: String(row.unit),
    scheduled: row.scheduled === undefined ? undefined : Number(row.scheduled),
    trackingType: String(row.tracking_type),
    recurrenceType: String(row.recurrence_type),
    recurrenceCount: Number(row.recurrence_count),
    targetValue: Number(row.target_value),
    executionStyle: String(row.execution_style)
  };
}

export function mapTodayTactic(row: R): TodayTacticProgress {
  const base = mapTacticScore(row);
  return {
    ...base,
    remaining: Number(row.remaining),
    isComplete: Boolean(row.is_complete),
    todayActual: Number(row.today_actual),
    todayTarget: (row.today_target as number) ?? null,
    todayRemaining: Number(row.today_remaining),
    isTodayComplete: Boolean(row.is_today_complete),
    dueToday: Boolean(row.due_today),
    todayKind: row.today_kind as TodayTacticProgress["todayKind"],
    todayLabel: String(row.today_label),
    weekRemaining: Number(row.week_remaining),
    weekTarget: Number(row.week_target),
    scheduledBlocks: ((row.scheduled_blocks as R[]) ?? []).map((block) => ({
      id: String(block.id),
      date: String(block.date),
      startTime: (block.start_time as string) ?? null,
      endTime: (block.end_time as string) ?? null,
      durationMinutes: (block.duration_minutes as number) ?? null,
      plannedValue: Number(block.planned_value),
      note: (block.note as string) ?? null
    }))
  };
}

export function mapScore(row: R): WeekScore {
  return {
    cycleId: String(row.cycle_id),
    weekNumber: Number(row.week_number),
    weeklyScore: Number(row.weekly_score),
    status: row.status as TrackStatus,
    goalScores: ((row.goal_scores as R[]) ?? []).map((goal) => ({
      goalId: String(goal.goal_id),
      goalTitle: String(goal.goal_title),
      score: Number(goal.score),
      status: goal.status as TrackStatus
    })),
    tacticScores: ((row.tactic_scores as R[]) ?? []).map(mapTacticScore)
  };
}

export function mapDailyLog(row: R): DailyLog {
  return {
    id: String(row.id),
    cycleId: String(row.cycle_id),
    date: String(row.date),
    oneThing: (row.one_thing as string) || null,
    morningDone: Number(row.morning_done) === 1,
    eveningDone: Number(row.evening_done) === 1,
    stressLevel: row.stress_level === null || row.stress_level === undefined ? null : Number(row.stress_level),
    agencyScore: row.agency_score === null || row.agency_score === undefined ? null : Number(row.agency_score),
    comfortZoneDone: Number(row.comfort_zone_done) === 1,
    deepWorkMinutes: Number(row.deep_work_minutes ?? 0),
    avoidanceTrigger: (row.avoidance_trigger as string) || null,
    privateVictories: (row.private_victories as string) || null,
    notes: (row.notes as string) || null
  };
}

export function mapBlock(row: R): CalendarBlock {
  return {
    id: String(row.id),
    tacticId: String(row.tactic_id),
    cycleId: String(row.cycle_id),
    weekNumber: Number(row.week_number),
    date: String(row.date),
    startTime: (row.start_time as string) || null,
    endTime: (row.end_time as string) || null,
    durationMinutes:
      row.duration_minutes === "" || row.duration_minutes === null || row.duration_minutes === undefined
        ? null
        : Number(row.duration_minutes),
    plannedValue: Number(row.planned_value),
    note: (row.note as string) || null
  };
}

export function mapBlockWithTitles(row: R): CalendarBlockWithTitles {
  return {
    ...mapBlock(row),
    originalDate: String(row.original_date ?? row.date),
    scheduledValue: Number(row.scheduled_value ?? row.planned_value),
    tacticTitle: String(row.tactic_title ?? "Unknown"),
    goalTitle: String(row.goal_title ?? "Unknown"),
    unit: String(row.unit ?? "")
  };
}

export function mapReview(row: R): WeeklyReview {
  return {
    id: String(row.id),
    cycleId: String(row.cycle_id),
    weekNumber: Number(row.week_number),
    executionScore: (row.execution_score as number) ?? null,
    weeklyGoals: (row.weekly_goals as string) || null,
    wins: (row.wins as string) || null,
    misses: (row.misses as string) || null,
    avoidancePatterns: (row.avoidance_patterns as string) || null,
    lessons: (row.lessons as string) || null,
    nextWeekAdjustments: (row.next_week_adjustments as string) || null,
    completedAt: (row.completed_at as string) || null
  };
}

// ---------------------------------------------------------------- dashboard

export function mapDashboard(root: ApiRow): DashboardData {
  return {
    cycle: mapCycle(root.cycle as ApiRow),
    currentWeek: Number(root.current_week),
    weeks: ((root.weeks as ApiRow[]) ?? []).map(mapWeek),
    goals: ((root.goals as ApiRow[]) ?? []).map((goal) => ({
      ...mapGoal(goal),
      lagIndicators: ((goal.lag_indicators as ApiRow[]) ?? []).map(mapLag)
    })),
    score: mapScore(root.score as ApiRow),
    tactics: ((root.tactics as ApiRow[]) ?? []).map((row) => ({
      tactic: mapTactic(row.tactic as ApiRow),
      goalTitle: String(row.goal_title)
    })),
    daysLeft: Number(root.days_left),
    todaySummary: {
      relevantCount: Number((root.today_summary as ApiRow).relevant_count),
      completedCount: Number((root.today_summary as ApiRow).completed_count),
      remainingCount: Number((root.today_summary as ApiRow).remaining_count),
      totalRemaining: Number((root.today_summary as ApiRow).total_remaining)
    },
    todayTactics: ((root.today_tactics as ApiRow[]) ?? []).map(mapTodayTactic),
    todayScheduledBlocks: ((root.today_scheduled_blocks as ApiRow[]) ?? []).map((row) => ({
      id: String(row.id),
      tacticId: String(row.tactic_id),
      tacticTitle: String(row.tactic_title),
      goalTitle: String(row.goal_title),
      date: String(row.date),
      startTime: (row.start_time as string) ?? null,
      endTime: (row.end_time as string) ?? null,
      durationMinutes: (row.duration_minutes as number) ?? null,
      plannedValue: Number(row.planned_value),
      note: (row.note as string) ?? null,
      unit: String(row.unit)
    })),
    recentEvents: ((root.recent_events as ApiRow[]) ?? []).map((event) => ({
      id: String(event.id),
      type: String(event.type),
      createdAt: String(event.created_at)
    })),
    reviews: ((root.reviews as ApiRow[]) ?? []).map(mapReview)
  };
}
