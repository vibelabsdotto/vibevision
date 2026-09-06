import { normalizeAmount } from '../common/util';

/**
 * Pure tactic-plan resolution — port of core resolveTacticPlan /
 * resolveExecutionStyle / getPlannedWeeklyTarget. DB-agnostic (snake_case
 * input); throws Error on contradictions, services map to 400.
 */

export type TrackingType = 'boolean' | 'quantity' | 'duration';
export type RecurrenceType = 'daily' | 'weekdays' | 'times_per_week' | 'once';
export type ExecutionStyle = 'toggle' | 'occurrence' | 'volume';

export const TRACKING_TYPES = ['boolean', 'quantity', 'duration'] as const;
export const RECURRENCE_TYPES = [
  'daily',
  'weekdays',
  'times_per_week',
  'once',
] as const;
export const EXECUTION_STYLES = ['toggle', 'occurrence', 'volume'] as const;
export const LEGACY_TACTIC_TYPES = [
  'daily_checkbox',
  'weekly_hours',
  'weekly_count',
  'habit',
  'one_time',
] as const;

export interface PlanInput {
  type?: string | null;
  tracking_type?: string | null;
  recurrence_type?: string | null;
  recurrence_count?: number | null;
  target_value?: number | null;
  target_per_week?: number | null;
  target_per_day?: number | null;
  unit?: string | null;
  execution_style?: string | null;
}

export interface TacticPlan {
  trackingType: TrackingType;
  recurrenceType: RecurrenceType;
  recurrenceCount: number;
  targetValue: number;
  unit: string;
}

function isTrackingType(v: unknown): v is TrackingType {
  return v === 'boolean' || v === 'quantity' || v === 'duration';
}

function isRecurrenceType(v: unknown): v is RecurrenceType {
  return (
    v === 'daily' || v === 'weekdays' || v === 'times_per_week' || v === 'once'
  );
}

function isExecutionStyle(v: unknown): v is ExecutionStyle {
  return v === 'toggle' || v === 'occurrence' || v === 'volume';
}

/** Derived style when no (valid) explicit execution_style is stored. */
export function deriveExecutionStyle(plan: TacticPlan): ExecutionStyle {
  if (plan.trackingType === 'boolean') {
    return plan.recurrenceType === 'daily' || plan.recurrenceType === 'weekdays'
      ? 'toggle'
      : 'occurrence';
  }
  return 'volume';
}

function isStyleValidForTracking(
  style: ExecutionStyle,
  trackingType: string,
  plan: TacticPlan,
): boolean {
  switch (style) {
    case 'toggle':
      return trackingType === 'boolean';
    case 'occurrence':
      return (
        trackingType === 'boolean' ||
        (trackingType === 'quantity' && Number.isInteger(plan.targetValue))
      );
    case 'volume':
      return trackingType === 'quantity' || trackingType === 'duration';
  }
}

/**
 * Explicit execution_style wins IF valid for the tracking type.
 * Contradiction → throw with { strict: true } (write paths), derive otherwise.
 */
export function resolveExecutionStyle(
  plan: TacticPlan,
  input?: {
    execution_style?: string | null;
    tracking_type?: string | null;
  } | null,
  opts?: { strict?: boolean },
): ExecutionStyle {
  const raw = input?.execution_style;
  if (isExecutionStyle(raw)) {
    const trackingType = input?.tracking_type ?? plan.trackingType;
    if (isStyleValidForTracking(raw, trackingType, plan)) return raw;
    if (opts?.strict) {
      throw new Error(
        `execution_style "${raw}" contradicts tracking_type "${trackingType}"`,
      );
    }
    return deriveExecutionStyle(plan);
  }
  return deriveExecutionStyle(plan);
}

export function resolveTacticPlan(
  input: PlanInput,
  opts?: { strict?: boolean },
): TacticPlan {
  if (input.tracking_type && input.recurrence_type) {
    if (opts?.strict) {
      if (!isTrackingType(input.tracking_type)) {
        throw new Error(`Unknown tracking_type: ${input.tracking_type}`);
      }
      if (!isRecurrenceType(input.recurrence_type)) {
        throw new Error(`Unknown recurrence_type: ${input.recurrence_type}`);
      }
    }
    return {
      trackingType: input.tracking_type as TrackingType,
      recurrenceType: input.recurrence_type as RecurrenceType,
      recurrenceCount: Math.max(1, Number(input.recurrence_count ?? 1)),
      targetValue: Number(input.target_value ?? 1),
      unit: String(input.unit ?? ''),
    };
  }
  switch (input.type) {
    case 'weekly_hours':
      return {
        trackingType: 'duration',
        recurrenceType: 'times_per_week',
        recurrenceCount: 1,
        targetValue: Number(input.target_per_week ?? 0),
        unit: String(input.unit ?? ''),
      };
    case 'weekly_count':
      return {
        trackingType: 'quantity',
        recurrenceType: 'times_per_week',
        recurrenceCount: 1,
        targetValue: Number(input.target_per_week ?? 0),
        unit: String(input.unit ?? ''),
      };
    case 'daily_checkbox':
      return {
        trackingType: 'boolean',
        recurrenceType: 'daily',
        recurrenceCount: 1,
        targetValue: Number(input.target_per_day ?? 1),
        unit: String(input.unit ?? ''),
      };
    case 'one_time':
      return {
        trackingType: 'boolean',
        recurrenceType: 'once',
        recurrenceCount: 1,
        targetValue: 1,
        unit: String(input.unit ?? ''),
      };
    case 'habit':
      return Number(input.target_per_week ?? 0) >= 7
        ? {
            trackingType: 'boolean',
            recurrenceType: 'daily',
            recurrenceCount: 1,
            targetValue: 1,
            unit: String(input.unit ?? ''),
          }
        : {
            trackingType: 'boolean',
            recurrenceType: 'times_per_week',
            recurrenceCount: Math.max(1, Number(input.target_per_week ?? 1)),
            targetValue: 1,
            unit: String(input.unit ?? ''),
          };
    default:
      if (opts?.strict) throw new Error(`Unknown tactic type: ${input.type}`);
      return {
        trackingType: 'boolean',
        recurrenceType: 'times_per_week',
        recurrenceCount: 1,
        targetValue: 1,
        unit: String(input.unit ?? ''),
      };
  }
}

/** Write-path plan validation — port of the PB hooks' plan checks. */
export function assertValidPlan(plan: TacticPlan): void {
  const target = normalizeAmount(plan.targetValue);
  if (!Number.isFinite(plan.targetValue) || target <= 0) {
    throw new Error('target_value must be greater than 0');
  }
  if (!Number.isFinite(plan.recurrenceCount) || plan.recurrenceCount < 1) {
    throw new Error('recurrence_count must be at least 1');
  }
  if (
    (plan.recurrenceType === 'daily' ||
      plan.recurrenceType === 'weekdays' ||
      plan.recurrenceType === 'once') &&
    plan.recurrenceCount !== 1
  ) {
    throw new Error(`recurrence_count must be 1 for ${plan.recurrenceType}`);
  }
  if (plan.trackingType === 'boolean' && target !== 1) {
    throw new Error('target_value must be 1 for boolean tactics');
  }
}

export function getPlannedWeeklyTarget(plan: TacticPlan): number {
  switch (plan.recurrenceType) {
    case 'daily':
      return plan.targetValue * 7;
    case 'weekdays':
      return plan.targetValue * 5;
    case 'times_per_week':
      return plan.targetValue * plan.recurrenceCount;
    case 'once':
      return plan.targetValue;
  }
}

export interface SchedulingProgress {
  week_target: number;
  scheduled: number;
  remaining: number;
}

/** Port of core getSchedulingProgress (scheduled units, not block count). */
export function getSchedulingProgress(
  plan: TacticPlan,
  blocks: Array<{ planned_value: number }>,
  weeklyTargetOverride?: number,
): SchedulingProgress {
  const weekTarget = normalizeAmount(
    weeklyTargetOverride === undefined
      ? getPlannedWeeklyTarget(plan)
      : weeklyTargetOverride,
  );
  const scheduled = normalizeAmount(
    blocks.reduce((sum, block) => {
      const value = Number(block.planned_value);
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0),
  );
  return {
    week_target: weekTarget,
    scheduled,
    remaining: normalizeAmount(Math.max(weekTarget - scheduled, 0)),
  };
}

export function isTacticActiveInWeek(
  tactic: {
    starts_week: number | null;
    ends_week: number | null;
    active: boolean;
  },
  weekNumber: number,
  schedule?: { required: boolean } | null,
): boolean {
  if (schedule) return schedule.required;
  return (
    tactic.active &&
    (tactic.starts_week === null || tactic.starts_week <= weekNumber) &&
    (tactic.ends_week === null || tactic.ends_week >= weekNumber)
  );
}
