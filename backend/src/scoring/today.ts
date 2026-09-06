import { normalizeAmount } from '../common/util';
import {
  deriveExecutionStyle,
  type ExecutionStyle,
  type TacticPlan,
} from '../tactics/plan';
import {
  getActualProgress,
  getTodayProgress,
  resolveScheduledStatus,
} from './week';
import type { ScoreEntry, TacticWeekScore } from './types';

/** Port of core buildTodayTactics + mergeTodayScoreRows (snake_case). */

export interface TodayBlockRow {
  id: string;
  tactic_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  planned_value: number;
  note: string | null;
}

export interface TodayTacticProgress extends TacticWeekScore {
  remaining: number;
  is_complete: boolean;
  today_actual: number;
  /** null for pool rows (occurrence): the actionable number is week_remaining. */
  today_target: number | null;
  today_remaining: number;
  is_today_complete: boolean;
  due_today: boolean;
  today_kind: 'scheduled' | 'recurring' | 'unscheduled' | 'pool';
  today_label: string;
  week_remaining: number;
  week_target: number;
  scheduled_blocks: TodayBlockRow[];
}

export interface DashboardTacticRow {
  tactic: {
    id: string;
    title: string;
    goal_id: string;
    tracking_type: string;
    recurrence_type: string;
    recurrence_count: number;
    target_value: number;
    scoring_weight: number;
    unit: string;
    execution_style: string | null;
  };
  goal_title: string;
}

export function isWeekdayDate(date: string): boolean {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

export function isDueToday(
  plan: TacticPlan,
  date: string,
  weeklyRemaining: number,
  todayProgress: number,
  activeInWeek: boolean,
): boolean {
  if (!activeInWeek) return false;
  switch (plan.recurrenceType) {
    case 'daily':
      return todayProgress < plan.targetValue;
    case 'weekdays':
      return isWeekdayDate(date) && todayProgress < plan.targetValue;
    case 'times_per_week':
      return plan.trackingType === 'boolean'
        ? weeklyRemaining > 0 && todayProgress < plan.targetValue
        : weeklyRemaining > 0;
    case 'once':
      return weeklyRemaining > 0 && todayProgress < plan.targetValue;
  }
}

export function getOccurrenceTarget(plan: TacticPlan): number {
  return Number(plan.targetValue);
}

function groupBlocksByTactic(
  blocks: TodayBlockRow[],
): Record<string, TodayBlockRow[]> {
  return blocks.reduce<Record<string, TodayBlockRow[]>>((acc, block) => {
    acc[block.tactic_id] ??= [];
    const list = acc[block.tactic_id];
    if (list) list.push(block);
    return acc;
  }, {});
}

export function mergeTodayScoreRows(params: {
  score_rows: TacticWeekScore[];
  tactic_rows: DashboardTacticRow[];
  entries: ScoreEntry[];
  today_blocks: TodayBlockRow[];
  week_blocks: TodayBlockRow[];
  as_of_date: string;
}): TacticWeekScore[] {
  const mergedRows = [...params.score_rows];
  const scoreIds = new Set(params.score_rows.map((row) => row.tactic_id));

  // Explicit calendar blocks for the week override schedule required:false:
  // a block is newer, specific intent, so the tactic becomes visible this week
  // even when the schedule row says it is not required.
  const blockedTacticIds = new Set([
    ...params.today_blocks.map((block) => block.tactic_id),
    ...params.week_blocks.map((block) => block.tactic_id),
  ]);
  for (const tacticId of blockedTacticIds) {
    if (scoreIds.has(tacticId)) continue;
    const tacticRow = params.tactic_rows.find(
      (row) => row.tactic.id === tacticId,
    );
    if (!tacticRow) continue;
    const plan: TacticPlan = {
      trackingType: tacticRow.tactic
        .tracking_type as TacticPlan['trackingType'],
      recurrenceType: tacticRow.tactic
        .recurrence_type as TacticPlan['recurrenceType'],
      recurrenceCount: Math.max(
        1,
        Number(tacticRow.tactic.recurrence_count ?? 1),
      ),
      targetValue: Number(tacticRow.tactic.target_value ?? 1),
      unit: tacticRow.tactic.unit,
    };
    const style =
      tacticRow.tactic.execution_style === 'toggle' ||
      tacticRow.tactic.execution_style === 'occurrence' ||
      tacticRow.tactic.execution_style === 'volume'
        ? tacticRow.tactic.execution_style
        : deriveExecutionStyle(plan);
    const tacticEntries = params.entries.filter(
      (entry) => entry.tactic_id === tacticId,
    );
    const fullWeekPlanned = params.week_blocks
      .filter((block) => block.tactic_id === tacticId)
      .reduce((sum, block) => sum + Number(block.planned_value), 0);
    const mergedScheduledBlocks = params.week_blocks
      .filter((block) => block.tactic_id === tacticId)
      .map((block) => ({
        date: block.date,
        planned_value: Number(block.planned_value),
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
    const mergedScheduledDates = mergedScheduledBlocks.map(
      (block) => block.date,
    );

    mergedRows.push({
      tactic_id: tacticId,
      tactic_title: tacticRow.tactic.title,
      goal_id: String(tacticRow.tactic.goal_id),
      goal_title: tacticRow.goal_title,
      planned: 0,
      full_week_planned: fullWeekPlanned,
      actual: getActualProgress(plan, tacticEntries, style),
      score: 0,
      weight: Number(tacticRow.tactic.scoring_weight),
      status:
        resolveScheduledStatus({
          style,
          full_week_planned: fullWeekPlanned,
          planned: 0,
          actual: getActualProgress(plan, tacticEntries, style),
          scheduled_dates: mergedScheduledDates,
          scheduled_blocks: mergedScheduledBlocks,
          as_of_date: params.as_of_date,
        }) ?? 'off_track',
      scheduled: normalizeAmount(
        mergedScheduledBlocks.reduce(
          (sum, block) => sum + Number(block.planned_value),
          0,
        ),
      ),
      unit: tacticRow.tactic.unit,
      tracking_type: plan.trackingType,
      recurrence_type: plan.recurrenceType,
      recurrence_count: plan.recurrenceCount,
      target_value: plan.targetValue,
      execution_style: style,
    });
  }

  return mergedRows;
}

function formatAmount(n: number): string {
  return String(normalizeAmount(n));
}

export function buildTodayTactics(
  scores: TacticWeekScore[],
  entries: ScoreEntry[],
  date: string,
  todayBlocks: TodayBlockRow[],
): TodayTacticProgress[] {
  const blocksTodayByTactic = groupBlocksByTactic(todayBlocks);

  return scores
    .map((score) => {
      const plan: TacticPlan = {
        trackingType: score.tracking_type as TacticPlan['trackingType'],
        recurrenceType: score.recurrence_type as TacticPlan['recurrenceType'],
        recurrenceCount: score.recurrence_count,
        targetValue: score.target_value,
        unit: score.unit,
      };
      const tacticEntriesForWeek = entries.filter(
        (entry) => entry.tactic_id === score.tactic_id,
      );
      const scheduledBlocks = (blocksTodayByTactic[score.tactic_id] ?? []).map(
        (block) => ({ ...block }),
      );
      const style: ExecutionStyle =
        score.execution_style === 'toggle' ||
        score.execution_style === 'occurrence' ||
        score.execution_style === 'volume'
          ? score.execution_style
          : deriveExecutionStyle(plan);
      const weekTarget = normalizeAmount(score.full_week_planned);
      const remaining = normalizeAmount(Math.max(weekTarget - score.actual, 0));
      const weekRemaining = remaining;
      const isComplete = remaining === 0;

      if (style === 'toggle') {
        const todayActual = getTodayProgress(
          plan,
          tacticEntriesForWeek,
          date,
          style,
        );
        const isRecurringToday =
          plan.recurrenceType === 'daily' ||
          (plan.recurrenceType === 'weekdays' && isWeekdayDate(date));
        const active = weekTarget > 0 || score.actual > 0;
        const todayTarget = active && isRecurringToday ? 1 : 0;
        const todayRemaining = normalizeAmount(
          Math.max(todayTarget - todayActual, 0),
        );
        return {
          ...score,
          planned: weekTarget,
          remaining,
          is_complete: isComplete,
          today_actual: todayActual,
          today_target: todayTarget,
          today_remaining: todayRemaining,
          is_today_complete: todayTarget > 0 && todayRemaining === 0,
          due_today: todayTarget > 0 && todayRemaining > 0,
          today_kind: todayTarget > 0 ? 'recurring' : 'unscheduled',
          today_label:
            todayTarget > 0 ? 'Recurring today' : 'Not scheduled today',
          week_remaining: weekRemaining,
          week_target: weekTarget,
          scheduled_blocks: scheduledBlocks,
        } satisfies TodayTacticProgress;
      }

      if (style === 'occurrence') {
        const todayActual = getTodayProgress(
          plan,
          tacticEntriesForWeek,
          date,
          style,
        );
        const scheduledTodayTarget = normalizeAmount(
          scheduledBlocks.reduce(
            (sum, block) => sum + Number(block.planned_value),
            0,
          ),
        );
        const hasScheduledToday = scheduledTodayTarget > 0;
        const isRecurringToday =
          !hasScheduledToday &&
          (weekTarget > 0 || score.actual > 0) &&
          (plan.recurrenceType === 'daily' ||
            (plan.recurrenceType === 'weekdays' && isWeekdayDate(date)));
        const todayTarget = hasScheduledToday
          ? scheduledTodayTarget
          : isRecurringToday
            ? getOccurrenceTarget(plan)
            : 0;
        const todayRemaining = normalizeAmount(
          Math.max(todayTarget - todayActual, 0),
        );
        return {
          ...score,
          planned: weekTarget,
          remaining,
          is_complete: isComplete,
          today_actual: todayActual,
          today_target: todayTarget > 0 ? todayTarget : null,
          today_remaining: todayTarget > 0 ? todayRemaining : weekRemaining,
          is_today_complete: todayTarget > 0 && todayRemaining === 0,
          due_today: todayTarget > 0 && todayRemaining > 0,
          today_kind: hasScheduledToday
            ? 'scheduled'
            : isRecurringToday
              ? 'recurring'
              : 'pool',
          today_label: hasScheduledToday
            ? `${formatAmount(scheduledTodayTarget)} ${score.unit} scheduled`
            : isRecurringToday
              ? 'Recurring today'
              : `${formatAmount(weekRemaining)} von ${formatAmount(weekTarget)} offen`,
          week_remaining: weekRemaining,
          week_target: weekTarget,
          scheduled_blocks: scheduledBlocks,
        } satisfies TodayTacticProgress;
      }

      // Volume: calendar blocks are due on their specific date. Daily and
      // weekday plans remain recurrence-scheduled; flexible weekly pools do not
      // leak into Today until the user places a block on the calendar.
      const todayActual = getTodayProgress(
        plan,
        tacticEntriesForWeek,
        date,
        style,
      );
      const scheduledTodayTarget = normalizeAmount(
        scheduledBlocks.reduce(
          (sum, block) => sum + Number(block.planned_value),
          0,
        ),
      );
      const recurringTarget = getOccurrenceTarget(plan);
      const hasScheduledToday = scheduledTodayTarget > 0;
      const isRecurringToday =
        !hasScheduledToday &&
        (score.full_week_planned > 0 || score.actual > 0) &&
        (plan.recurrenceType === 'daily' ||
          (plan.recurrenceType === 'weekdays' && isWeekdayDate(date)));
      const todayTarget = hasScheduledToday
        ? scheduledTodayTarget
        : isRecurringToday
          ? recurringTarget
          : 0;
      const todayRemaining = normalizeAmount(
        Math.max(todayTarget - todayActual, 0),
      );
      const isTodayComplete = todayTarget > 0 && todayRemaining === 0;
      const dueToday =
        (hasScheduledToday || isRecurringToday) && !isTodayComplete;
      const todayKind = hasScheduledToday
        ? 'scheduled'
        : isRecurringToday
          ? 'recurring'
          : 'unscheduled';
      const todayLabel =
        todayKind === 'scheduled'
          ? `${formatAmount(scheduledTodayTarget)} ${score.unit} scheduled`
          : isRecurringToday
            ? 'Recurring today'
            : 'Not scheduled today';

      return {
        ...score,
        planned: score.full_week_planned,
        remaining,
        is_complete: remaining === 0,
        today_actual: todayActual,
        today_target: todayTarget,
        today_remaining: todayRemaining,
        is_today_complete: isTodayComplete,
        due_today: dueToday,
        today_kind: todayKind,
        today_label: todayLabel,
        week_remaining: weekRemaining,
        week_target: weekTarget,
        scheduled_blocks: scheduledBlocks,
      } satisfies TodayTacticProgress;
    })
    .filter(
      (score) =>
        score.today_kind === 'scheduled' || score.today_kind === 'recurring',
    )
    .sort((left, right) => {
      const leftPriority =
        left.today_kind === 'scheduled'
          ? 0
          : left.today_kind === 'recurring'
            ? 1
            : 2;
      const rightPriority =
        right.today_kind === 'scheduled'
          ? 0
          : right.today_kind === 'recurring'
            ? 1
            : 2;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      const leftStart = left.scheduled_blocks[0]?.start_time ?? '99:99';
      const rightStart = right.scheduled_blocks[0]?.start_time ?? '99:99';
      if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);
      if (left.is_today_complete !== right.is_today_complete) {
        return Number(left.is_today_complete) - Number(right.is_today_complete);
      }
      if (left.today_remaining !== right.today_remaining) {
        return right.today_remaining - left.today_remaining;
      }
      if (left.remaining !== right.remaining) {
        return right.remaining - left.remaining;
      }
      return left.tactic_title.localeCompare(right.tactic_title);
    });
}
