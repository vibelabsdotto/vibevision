import { BadRequestException } from '@nestjs/common';
import type Database from 'better-sqlite3';
import { normalizeAmount, toBool } from '../common/util';
import {
  getPlannedWeeklyTarget,
  isTacticActiveInWeek,
  resolveExecutionStyle,
  resolveTacticPlan,
  type ExecutionStyle,
  type TacticPlan,
} from '../tactics/plan';

export interface TacticRow {
  id: string;
  goal_id: string;
  title: string;
  type: string;
  tracking_type: string;
  recurrence_type: string;
  execution_style: string | null;
  recurrence_count: number;
  target_value: number;
  target_per_week: number;
  target_per_day: number;
  unit: string;
  starts_week: number | null;
  ends_week: number | null;
  active: number;
}

export interface TacticBucket {
  tactic: TacticRow;
  plan: TacticPlan;
  style: ExecutionStyle;
  cycleId: string;
  weekNumber: number;
}

/**
 * Load a tactic + resolve its plan/style (strict — write paths).
 * Per-user: tactics of other users read as unknown (never confirmed).
 */
export function loadTacticWithPlan(
  sqlite: Database.Database,
  tacticId: string,
  userId: string,
): { tactic: TacticRow; plan: TacticPlan; style: ExecutionStyle } {
  const tactic = sqlite
    .prepare('select * from tactics where id = ? and user_id = ?')
    .get(tacticId, userId) as TacticRow | undefined;
  if (!tactic) throw new BadRequestException('unknown tactic_id');
  let plan: TacticPlan;
  try {
    plan = resolveTacticPlan(
      {
        type: tactic.type,
        tracking_type: tactic.tracking_type,
        recurrence_type: tactic.recurrence_type,
        recurrence_count: tactic.recurrence_count,
        target_value: tactic.target_value,
        target_per_week: tactic.target_per_week,
        target_per_day: tactic.target_per_day,
        unit: tactic.unit,
      },
      { strict: true },
    );
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Invalid tactic plan',
    );
  }
  let style: ExecutionStyle;
  try {
    style = resolveExecutionStyle(
      plan,
      {
        execution_style: tactic.execution_style,
        tracking_type: tactic.tracking_type,
      },
      { strict: true },
    );
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Invalid execution style',
    );
  }
  return { tactic, plan, style };
}

/**
 * Resolve the (cycle, week) bucket for a tactic + date. Port of the hooks'
 * getBucket: the date must fall into exactly one week of the tactic's cycle.
 * Per-user: the goal lookup and the week lookup are both user-scoped, so a
 * tactic id guessed from another user never resolves.
 */
export function resolveBucket(
  sqlite: Database.Database,
  tactic: TacticRow,
  date: string,
  userId: string,
): { cycleId: string; weekNumber: number } {
  const goal = sqlite
    .prepare('select cycle_id from goals where id = ? and user_id = ?')
    .get(tactic.goal_id, userId) as { cycle_id: string } | undefined;
  if (!goal) throw new BadRequestException('tactic goal not found');
  const weeks = sqlite
    .prepare(
      'select week_number from cycle_weeks where cycle_id = ? and user_id = ? and start_date <= ? and end_date >= ?',
    )
    .all(goal.cycle_id, userId, date, date) as Array<{ week_number: number }>;
  if (weeks.length !== 1 || weeks[0] === undefined) {
    throw new BadRequestException('Date is not inside the tactic cycle');
  }
  return { cycleId: goal.cycle_id, weekNumber: weeks[0].week_number };
}

/** Weekly scheduling target: schedule override wins, else base target. */
export function weeklyTarget(
  sqlite: Database.Database,
  tacticId: string,
  weekNumber: number,
  plan: TacticPlan,
  userId: string,
): number {
  const schedule = sqlite
    .prepare(
      'select planned_target from tactic_schedules where tactic_id = ? and week_number = ? and user_id = ?',
    )
    .get(tacticId, weekNumber, userId) as
    | { planned_target: number }
    | undefined;
  if (!schedule) return normalizeAmount(getPlannedWeeklyTarget(plan));
  const target = normalizeAmount(Number(schedule.planned_target));
  if (!Number.isFinite(target) || target < 0) {
    throw new BadRequestException('Invalid weekly target');
  }
  return target;
}

/** Sum of scheduled block values for a tactic/week (optionally excl. one id). */
export function scheduledSum(
  sqlite: Database.Database,
  tacticId: string,
  cycleId: string,
  weekNumber: number,
  userId: string,
  excludeId?: string,
): number {
  const rows = sqlite
    .prepare(
      `select planned_value from tactic_calendar_blocks
       where tactic_id = ? and cycle_id = ? and week_number = ? and user_id = ?${excludeId ? ' and id != ?' : ''}`,
    )
    .all(
      ...(excludeId
        ? [tacticId, cycleId, weekNumber, userId, excludeId]
        : [tacticId, cycleId, weekNumber, userId]),
    ) as Array<{ planned_value: number }>;
  return normalizeAmount(
    rows.reduce((sum, row) => {
      const v = normalizeAmount(Number(row.planned_value));
      return v > 0 ? sum + v : sum;
    }, 0),
  );
}

/**
 * Reject scheduling writes for a tactic that the week score would exclude.
 * Mirrors the scorer's activity check (schedule `required` override wins,
 * else starts_week/ends_week/active) so blocks and scores can never disagree
 * about whether a tactic exists in a week.
 */
export function assertTacticActiveInWeek(
  sqlite: Database.Database,
  tactic: TacticRow,
  weekNumber: number,
  userId: string,
): void {
  const schedule = sqlite
    .prepare(
      'select required from tactic_schedules where tactic_id = ? and week_number = ? and user_id = ?',
    )
    .get(tactic.id, weekNumber, userId) as { required: number } | undefined;
  const active = isTacticActiveInWeek(
    {
      starts_week: tactic.starts_week,
      ends_week: tactic.ends_week,
      active: tactic.active === 1,
    },
    weekNumber,
    schedule ? { required: toBool(schedule.required) } : null,
  );
  if (!active) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `Tactic is not active in week ${weekNumber}`,
    });
  }
}
