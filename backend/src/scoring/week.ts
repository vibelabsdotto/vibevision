import { normalizeAmount } from '../common/util';
import {
  deriveExecutionStyle,
  getPlannedWeeklyTarget,
  isTacticActiveInWeek,
  resolveExecutionStyle,
  resolveTacticPlan,
  type TacticPlan,
} from '../tactics/plan';
import type {
  ScoreBlockRow,
  ScoreEntry,
  ScoreInput,
  ScoreScheduleRow,
  ScoreTacticRow,
  TacticWeekScore,
  TrackStatus,
  WeekScore,
  GoalScore,
} from './types';

/**
 * Pure week-scoring — port of core scoreTacticsForWeek + helpers.
 * DB-free: callers load rows, this module computes. snake_case throughout.
 */

export function statusFromScore(score: number): TrackStatus {
  if (score >= 0.85) return 'on_track';
  if (score >= 0.7) return 'warning';
  return 'off_track';
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function getElapsedDaysInWeek(
  weekStartDate: string,
  asOfDate: string,
): number {
  const diffDays =
    Math.floor(
      (parseDate(asOfDate).getTime() - parseDate(weekStartDate).getTime()) /
        86400000,
    ) + 1;
  return Math.max(0, Math.min(diffDays, 7));
}

export function getElapsedWeekdaysInWeek(
  weekStartDate: string,
  asOfDate: string,
): number {
  const elapsedDays = getElapsedDaysInWeek(weekStartDate, asOfDate);
  let weekdays = 0;
  for (let offset = 0; offset < elapsedDays; offset += 1) {
    const date = parseDate(weekStartDate);
    date.setUTCDate(date.getUTCDate() + offset);
    if (date.getUTCDay() >= 1 && date.getUTCDay() <= 5) weekdays += 1;
  }
  return weekdays;
}

function getPreviousDate(date: string): string {
  const previous = parseDate(date);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

export function getScoringCutoffDate(
  weekStartDate: string | null,
  weekEndDate: string | null,
  asOfDate: string,
  options?: { include_as_of_date?: boolean },
): string {
  if (!weekStartDate || !weekEndDate) return asOfDate;
  if (asOfDate < weekStartDate || asOfDate > weekEndDate) return asOfDate;
  if (options?.include_as_of_date) return asOfDate;
  return getPreviousDate(asOfDate);
}

export function getPlannedTargetForDate(params: {
  plan: TacticPlan;
  execution_style?: string;
  full_week_planned: number;
  blocks: Array<{ date: string; planned_value: number }>;
  week_start_date: string | null;
  week_end_date: string | null;
  scoring_cutoff_date: string;
}): number {
  const {
    plan,
    execution_style,
    full_week_planned,
    blocks,
    week_start_date,
    week_end_date,
    scoring_cutoff_date,
  } = params;
  if (blocks.length > 0) {
    return blocks
      .filter(
        (block) =>
          !week_start_date ||
          !week_end_date ||
          (block.date >= week_start_date && block.date <= week_end_date),
      )
      .filter((block) =>
        week_start_date &&
        week_end_date &&
        scoring_cutoff_date >= week_start_date &&
        scoring_cutoff_date <= week_end_date
          ? block.date <= scoring_cutoff_date
          : true,
      )
      .reduce((sum, block) => sum + Number(block.planned_value), 0);
  }

  if (
    !week_start_date ||
    !week_end_date ||
    scoring_cutoff_date < week_start_date ||
    scoring_cutoff_date > week_end_date
  ) {
    return full_week_planned;
  }

  const elapsedDays = getElapsedDaysInWeek(
    week_start_date,
    scoring_cutoff_date,
  );
  const style =
    execution_style === 'toggle' ||
    execution_style === 'occurrence' ||
    execution_style === 'volume'
      ? execution_style
      : deriveExecutionStyle(plan);
  if (style === 'toggle') {
    switch (plan.recurrenceType) {
      case 'daily':
        return plan.targetValue * elapsedDays;
      case 'weekdays':
        return (
          plan.targetValue *
          getElapsedWeekdaysInWeek(week_start_date, scoring_cutoff_date)
        );
      default:
        return full_week_planned;
    }
  }
  if (style === 'occurrence') {
    // Floor pace for flexible weekly pools (no prorata fractions).
    switch (plan.recurrenceType) {
      case 'times_per_week':
        return Math.floor(full_week_planned * (elapsedDays / 7));
      case 'once':
        return full_week_planned;
      default:
        return full_week_planned;
    }
  }
  // Volume keeps the exact prorata pace.
  switch (plan.recurrenceType) {
    case 'daily':
      return plan.targetValue * elapsedDays;
    case 'weekdays':
      return (
        plan.targetValue *
        getElapsedWeekdaysInWeek(week_start_date, scoring_cutoff_date)
      );
    case 'times_per_week':
      return full_week_planned * (elapsedDays / 7);
    case 'once':
      return full_week_planned;
  }
}

export function getActualProgress(
  plan: TacticPlan,
  entries: ScoreEntry[],
  style: string = deriveExecutionStyle(plan),
): number {
  if (style === 'toggle') {
    // One done-day counts once: a double-complete on the same date no longer inflates.
    const doneDates = new Set<string>();
    let undated = 0;
    for (const entry of entries) {
      if (!(entry.completed || entry.value > 0)) continue;
      if (entry.date) doneDates.add(entry.date);
      else undated += 1;
    }
    return doneDates.size + undated;
  }
  if (style === 'occurrence' && plan.trackingType === 'boolean') {
    // Whole occurrences; legacy boolean completes (value 0 + completed) still count 1.
    return Math.max(
      0,
      entries.reduce(
        (sum, entry) =>
          sum +
          (entry.completed || entry.value > 0
            ? Math.max(1, Number(entry.value))
            : Number(entry.value)),
        0,
      ),
    );
  }
  return Math.max(
    0,
    entries.reduce((sum, entry) => sum + Number(entry.value), 0),
  );
}

export function getTodayProgress(
  plan: TacticPlan,
  entries: ScoreEntry[],
  date: string,
  style: string = deriveExecutionStyle(plan),
): number {
  return getActualProgress(
    plan,
    entries.filter((entry) => entry.date === date),
    style,
  );
}

export function getTacticExecutionScore(
  plan: TacticPlan,
  planned: number,
  actual: number,
): number {
  const safeActual = Math.max(0, actual);
  if (planned <= 0) return safeActual > 0 ? 1 : 0;
  if (plan.recurrenceType === 'once') return safeActual >= planned ? 1 : 0;
  if (planned > 1) return Math.min(safeActual / planned, 1);
  return safeActual >= planned ? 1 : 0;
}

/** Pace status for occurrence pools: actual vs floor(N * elapsed/7). */
function occurrencePaceStatus(
  weekTarget: number,
  actual: number,
  weekStartDate: string | null,
  scoringCutoffDate: string,
): TrackStatus {
  if (!weekStartDate) {
    return statusFromScore(
      weekTarget > 0 ? Math.min(actual / weekTarget, 1) : actual > 0 ? 1 : 0,
    );
  }
  const paceFloor = Math.floor(
    weekTarget * (getElapsedDaysInWeek(weekStartDate, scoringCutoffDate) / 7),
  );
  if (paceFloor <= 0) return 'on_track';
  return statusFromScore(Math.min(actual / paceFloor, 1));
}

/** Pace status for volume tactics: actual vs exact prorata pace target. */
export function volumePaceStatus(
  plan: TacticPlan,
  weekTarget: number,
  actual: number,
  weekStartDate: string | null,
  weekEndDate: string | null,
  scoringCutoffDate: string,
): TrackStatus {
  if (!weekStartDate || !weekEndDate) {
    return statusFromScore(
      weekTarget > 0 ? Math.min(actual / weekTarget, 1) : actual > 0 ? 1 : 0,
    );
  }
  // Nothing due yet (cutoff before the week): can't be behind — mirrors the
  // occurrence pace floor of 0 resolving to on_track.
  if (scoringCutoffDate < weekStartDate) return 'on_track';
  const paceTarget = getPlannedTargetForDate({
    plan,
    execution_style: 'volume',
    full_week_planned: weekTarget,
    blocks: [],
    week_start_date: weekStartDate,
    week_end_date: weekEndDate,
    scoring_cutoff_date: scoringCutoffDate,
  });
  if (paceTarget <= 0) return 'on_track';
  return statusFromScore(Math.min(actual / paceTarget, 1));
}

/**
 * Schedule-aware weekly status override (pure, unit-tested).
 * Returns null when the existing pace/score status should stand.
 */
export function resolveScheduledStatus(input: {
  style: string;
  full_week_planned: number;
  planned: number;
  actual: number;
  scheduled_dates: string[];
  scheduled_blocks?: Array<{ date: string; planned_value: number }>;
  as_of_date: string;
}): TrackStatus | null {
  const scheduledBlocks =
    input.scheduled_blocks ??
    input.scheduled_dates.map((date) => ({ date, planned_value: 1 }));
  if (scheduledBlocks.length === 0) return null;
  const remaining =
    input.style === 'toggle'
      ? input.planned - input.actual
      : input.full_week_planned - input.actual;
  if (remaining <= 0) return null;
  const futureCount = scheduledBlocks.filter(
    (block) => block.date > input.as_of_date,
  ).length;
  if (input.actual <= 0 && futureCount === scheduledBlocks.length) {
    return 'coming';
  }
  const dueBlocks = scheduledBlocks.filter(
    (block) => block.date <= input.as_of_date,
  );
  const dueByNow =
    input.style === 'occurrence' || input.style === 'volume'
      ? normalizeAmount(
          dueBlocks.reduce((sum, block) => {
            const value = Number(block.planned_value);
            return sum + (Number.isFinite(value) && value > 0 ? value : 1);
          }, 0),
        )
      : dueBlocks.length;
  if (input.actual >= dueByNow) return 'on_track';
  return input.actual > 0 ? 'warning' : 'off_track';
}

/** Pure reimplementation of getWeekScore's per-tactic reduce over pre-fetched rows. */
export function scoreTacticsForWeek(input: ScoreInput): TacticWeekScore[] {
  const {
    week_number,
    as_of_date,
    include_as_of_date,
    tactic_rows,
    schedule_rows,
    calendar_blocks,
    entries,
    week_start_date,
    week_end_date,
    has_snapshot,
  } = input;
  const scoringCutoffDate = getScoringCutoffDate(
    week_start_date,
    week_end_date,
    as_of_date,
    { include_as_of_date },
  );
  return tactic_rows.reduce<TacticWeekScore[]>(
    (acc, { tactic, goal_title }) => {
      const schedule = schedule_rows.find(
        (row) => row.tactic_id === tactic.id && row.week_number === week_number,
      );
      const activeInWeek = has_snapshot
        ? true
        : isTacticActiveInWeek(
            {
              starts_week: tactic.starts_week,
              ends_week: tactic.ends_week,
              active: tactic.active,
            },
            week_number,
            schedule ? { required: schedule.required } : null,
          );
      if (!activeInWeek) return acc;
      const plan = resolveTacticPlan({
        type: tactic.type,
        tracking_type: tactic.tracking_type,
        recurrence_type: tactic.recurrence_type,
        recurrence_count: tactic.recurrence_count,
        target_value: tactic.target_value,
        target_per_week: tactic.target_per_week,
        target_per_day: tactic.target_per_day,
        unit: tactic.unit,
      });
      const style = resolveExecutionStyle(plan, {
        execution_style: tactic.execution_style,
        tracking_type: tactic.tracking_type,
      });
      const fullWeekPlanned = Number(
        schedule?.planned_target ??
          (plan.recurrenceType === 'once'
            ? tactic.starts_week === week_number ||
              tactic.ends_week === week_number
              ? plan.targetValue
              : 0
            : getPlannedWeeklyTarget(plan)),
      );
      const planned = Number(
        getPlannedTargetForDate({
          plan,
          execution_style: style,
          full_week_planned: fullWeekPlanned,
          blocks: calendar_blocks
            .filter((block) => block.tactic_id === tactic.id)
            .map((block) => ({
              date: block.date,
              planned_value: block.planned_value,
            })),
          week_start_date,
          week_end_date,
          scoring_cutoff_date: scoringCutoffDate,
        }),
      );
      const scheduledDatesUpfront = calendar_blocks
        .filter((block) => block.tactic_id === tactic.id)
        .map((block) => block.date);
      if (
        planned <= 0 &&
        entries.every((entry) => entry.tactic_id !== tactic.id) &&
        scheduledDatesUpfront.length === 0
      ) {
        return acc;
      }
      const tacticEntriesForWeek = entries.filter(
        (entry) => entry.tactic_id === tactic.id,
      );
      const actual = getActualProgress(plan, tacticEntriesForWeek, style);
      // Toggle: min(doneDueDays/dueDaysElapsed, 1) — actual is already clamped per date.
      // Occurrence: min(actual/N, 1) with pace status vs floor(N*elapsed/7).
      // Volume: absolute score, pace-aware status (blocks due by now or prorata).
      const score =
        style === 'occurrence'
          ? fullWeekPlanned > 0
            ? Math.min(actual / fullWeekPlanned, 1)
            : actual > 0
              ? 1
              : 0
          : style === 'toggle'
            ? planned > 0
              ? Math.min(actual / planned, 1)
              : actual > 0
                ? 1
                : 0
            : getTacticExecutionScore(plan, planned, actual);
      const baseStatus =
        style === 'occurrence'
          ? occurrencePaceStatus(
              fullWeekPlanned,
              actual,
              week_start_date,
              scoringCutoffDate,
            )
          : style === 'volume'
            ? volumePaceStatus(
                plan,
                fullWeekPlanned,
                actual,
                week_start_date,
                week_end_date,
                scoringCutoffDate,
              )
            : statusFromScore(score);
      const scheduledBlocks = calendar_blocks
        .filter((block) => block.tactic_id === tactic.id)
        .map((block) => ({
          date: block.date,
          planned_value: Number(block.planned_value),
        }))
        .sort((left, right) => left.date.localeCompare(right.date));
      const scheduledDates = scheduledBlocks.map((block) => block.date);
      const tacticStatus =
        resolveScheduledStatus({
          style,
          full_week_planned: fullWeekPlanned,
          planned,
          actual,
          scheduled_dates: scheduledDates,
          scheduled_blocks: scheduledBlocks,
          as_of_date,
        }) ?? baseStatus;
      acc.push({
        tactic_id: tactic.id,
        tactic_title: tactic.title,
        goal_id: tactic.goal_id,
        goal_title,
        planned,
        full_week_planned: fullWeekPlanned,
        actual,
        score,
        weight: Number(tactic.scoring_weight),
        status: tacticStatus,
        scheduled: scheduledDates.length,
        unit: tactic.unit,
        tracking_type: plan.trackingType,
        recurrence_type: plan.recurrenceType,
        recurrence_count: plan.recurrenceCount,
        target_value: plan.targetValue,
        execution_style: style,
      });
      return acc;
    },
    [],
  );
}

export function goalScoresFromTacticScores(
  scores: TacticWeekScore[],
): GoalScore[] {
  return Object.values(
    scores.reduce<
      Record<
        string,
        { goal_id: string; goal_title: string; total: number; count: number }
      >
    >((acc, score) => {
      acc[score.goal_id] ??= {
        goal_id: score.goal_id,
        goal_title: score.goal_title,
        total: 0,
        count: 0,
      };
      const bucket = acc[score.goal_id];
      if (bucket) {
        bucket.total += score.score;
        bucket.count += 1;
      }
      return acc;
    }, {}),
  ).map((row) => ({
    goal_id: row.goal_id,
    goal_title: row.goal_title,
    score: row.count > 0 ? row.total / row.count : 0,
    status: statusFromScore(row.count > 0 ? row.total / row.count : 0),
  }));
}

export function weekScoreFromTacticScores(
  cycleId: string,
  weekNumber: number,
  scores: TacticWeekScore[],
): WeekScore {
  const weeklyScore =
    scores.length > 0
      ? scores.reduce((sum, score) => sum + score.score, 0) / scores.length
      : 0;
  return {
    cycle_id: cycleId,
    week_number: weekNumber,
    weekly_score: weeklyScore,
    status: statusFromScore(weeklyScore),
    goal_scores: goalScoresFromTacticScores(scores),
    tactic_scores: scores,
  };
}

export type { ScoreScheduleRow, ScoreTacticRow, ScoreBlockRow };
