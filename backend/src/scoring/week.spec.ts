import { resolveTacticEntryValue } from '../entries/entry-value';
import { getPlannedWeeklyTarget } from '../tactics/plan';
import type { TacticPlan } from '../tactics/plan';
import { buildTodayTactics, isDueToday, isWeekdayDate } from './today';
import type { TacticWeekScore } from './types';
import {
  getActualProgress,
  getPlannedTargetForDate,
  getTacticExecutionScore,
  getTodayProgress,
  resolveScheduledStatus,
  statusFromScore,
} from './week';

/**
 * Port of src/test/scoring.test.ts (same values, snake_case rows).
 */

const qtyPlan: TacticPlan = {
  trackingType: 'quantity',
  recurrenceType: 'times_per_week',
  recurrenceCount: 1,
  targetValue: 10,
  unit: 'activities',
};

describe('scoring thresholds', () => {
  it('maps scores to statuses', () => {
    expect(statusFromScore(0.9)).toBe('on_track');
    expect(statusFromScore(0.85)).toBe('on_track');
    expect(statusFromScore(0.75)).toBe('warning');
    expect(statusFromScore(0.7)).toBe('warning');
    expect(statusFromScore(0.5)).toBe('off_track');
  });
});

describe('getTacticExecutionScore', () => {
  it('is proportional for quantity tactics with planned > 1', () => {
    expect(getTacticExecutionScore(qtyPlan, 10, 5)).toBe(0.5);
    expect(getTacticExecutionScore(qtyPlan, 10, 12)).toBe(1);
  });

  it('is binary for planned <= 1', () => {
    expect(getTacticExecutionScore({ ...qtyPlan, targetValue: 1 }, 1, 1)).toBe(
      1,
    );
    expect(getTacticExecutionScore({ ...qtyPlan, targetValue: 1 }, 1, 0)).toBe(
      0,
    );
  });

  it('is binary for once tactics regardless of overshoot', () => {
    const oncePlan: TacticPlan = {
      trackingType: 'boolean',
      recurrenceType: 'once',
      recurrenceCount: 1,
      targetValue: 1,
      unit: 'done',
    };
    expect(getTacticExecutionScore(oncePlan, 1, 1)).toBe(1);
    expect(getTacticExecutionScore(oncePlan, 1, 0)).toBe(0);
  });

  it('rewards actual > 0 when planned <= 0', () => {
    expect(getTacticExecutionScore(qtyPlan, 0, 3)).toBe(1);
    expect(getTacticExecutionScore(qtyPlan, 0, 0)).toBe(0);
  });
});

describe('progress aggregation', () => {
  it('counts completed entries for boolean tactics', () => {
    const plan: TacticPlan = {
      trackingType: 'boolean',
      recurrenceType: 'daily',
      recurrenceCount: 1,
      targetValue: 1,
      unit: 'done',
    };
    const entries = [
      { tactic_id: 't1', date: '2026-04-20', value: 1, completed: true },
      { tactic_id: 't1', date: '2026-04-21', value: 0, completed: true },
      { tactic_id: 't1', date: '2026-04-22', value: 0, completed: false },
    ];
    expect(getActualProgress(plan, entries)).toBe(2);
  });

  it('sums values for quantity tactics', () => {
    const plan: TacticPlan = {
      trackingType: 'quantity',
      recurrenceType: 'times_per_week',
      recurrenceCount: 1,
      targetValue: 10,
      unit: 'count',
    };
    const entries = [
      { tactic_id: 't1', date: '2026-04-20', value: 4, completed: false },
      { tactic_id: 't1', date: '2026-04-22', value: 3, completed: false },
    ];
    expect(getActualProgress(plan, entries)).toBe(7);
  });

  it('filters today progress by date', () => {
    const plan: TacticPlan = {
      trackingType: 'quantity',
      recurrenceType: 'daily',
      recurrenceCount: 1,
      targetValue: 1,
      unit: 'count',
    };
    const entries = [
      { tactic_id: 't1', date: '2026-04-20', value: 2, completed: false },
      { tactic_id: 't1', date: '2026-04-21', value: 5, completed: false },
    ];
    expect(getTodayProgress(plan, entries, '2026-04-21')).toBe(5);
    expect(getTodayProgress(plan, entries, '2026-04-25')).toBe(0);
  });

  it('aggregates same-day boolean entries when occurrence is explicit', () => {
    const plan: TacticPlan = {
      trackingType: 'boolean',
      recurrenceType: 'daily',
      recurrenceCount: 1,
      targetValue: 1,
      unit: 'done',
    };
    const entries = [
      { tactic_id: 't1', date: '2026-04-21', value: 1, completed: true },
      { tactic_id: 't1', date: '2026-04-21', value: 1, completed: true },
    ];
    expect(getActualProgress(plan, entries, 'occurrence')).toBe(2);
    expect(getTodayProgress(plan, entries, '2026-04-21', 'occurrence')).toBe(2);
  });
});

describe('weekly targets', () => {
  it('derives planned weekly targets from recurrence', () => {
    const p = (
      trackingType: TacticPlan['trackingType'],
      recurrenceType: TacticPlan['recurrenceType'],
      recurrenceCount: number,
      targetValue: number,
    ): TacticPlan => ({
      trackingType,
      recurrenceType,
      recurrenceCount,
      targetValue,
      unit: 'x',
    });
    expect(getPlannedWeeklyTarget(p('boolean', 'daily', 1, 1))).toBe(7);
    expect(getPlannedWeeklyTarget(p('boolean', 'weekdays', 1, 1))).toBe(5);
    expect(getPlannedWeeklyTarget(p('quantity', 'times_per_week', 3, 2))).toBe(
      6,
    );
    expect(getPlannedWeeklyTarget(p('boolean', 'once', 1, 1))).toBe(1);
  });
});

describe('due today', () => {
  const dailyPlan: TacticPlan = {
    trackingType: 'boolean',
    recurrenceType: 'daily',
    recurrenceCount: 1,
    targetValue: 1,
    unit: 'done',
  };
  const weekdayPlan: TacticPlan = {
    trackingType: 'boolean',
    recurrenceType: 'weekdays',
    recurrenceCount: 1,
    targetValue: 1,
    unit: 'done',
  };
  const weeklyPlan: TacticPlan = {
    trackingType: 'boolean',
    recurrenceType: 'times_per_week',
    recurrenceCount: 3,
    targetValue: 1,
    unit: 'done',
  };

  it('daily is due until today occurrence is done', () => {
    expect(isDueToday(dailyPlan, '2026-04-20', 5, 0, true)).toBe(true);
    expect(isDueToday(dailyPlan, '2026-04-20', 5, 1, true)).toBe(false);
    expect(isDueToday(dailyPlan, '2026-04-20', 0, 1, true)).toBe(false);
  });

  it('weekdays are not due on weekends', () => {
    expect(isWeekdayDate('2026-04-18')).toBe(false);
    expect(isWeekdayDate('2026-04-20')).toBe(true);
    expect(isDueToday(weekdayPlan, '2026-04-18', 5, 0, true)).toBe(false);
    expect(isDueToday(weekdayPlan, '2026-04-20', 5, 0, true)).toBe(true);
  });

  it('times_per_week boolean tactics are due while weekly remaining > 0', () => {
    expect(isDueToday(weeklyPlan, '2026-04-20', 2, 0, true)).toBe(true);
    expect(isDueToday(weeklyPlan, '2026-04-20', 0, 1, true)).toBe(false);
  });
});

describe('toggle idempotency', () => {
  it('two completes on the same day count once', () => {
    const plan: TacticPlan = {
      trackingType: 'boolean',
      recurrenceType: 'daily',
      recurrenceCount: 1,
      targetValue: 1,
      unit: 'done',
    };
    const entries = [
      { tactic_id: 't1', date: '2026-04-20', value: 1, completed: true },
      { tactic_id: 't1', date: '2026-04-20', value: 1, completed: true },
    ];
    expect(getActualProgress(plan, entries)).toBe(1);
    expect(getTodayProgress(plan, entries, '2026-04-20')).toBe(1);
  });
});

describe('occurrence counting', () => {
  const plan: TacticPlan = {
    trackingType: 'boolean',
    recurrenceType: 'times_per_week',
    recurrenceCount: 7,
    targetValue: 1,
    unit: 'posts',
  };

  it('seven +1 entries score 1.0 with no fractions', () => {
    const entries = Array.from({ length: 7 }, (_, i) => ({
      tactic_id: 't1',
      date: `2026-04-${String(13 + i).padStart(2, '0')}`,
      value: 1,
      completed: false,
    }));
    const actual = getActualProgress(plan, entries);
    expect(actual).toBe(7);
    expect(Number.isInteger(actual)).toBe(true);
    expect(getTacticExecutionScore(plan, 7, actual)).toBe(1);
  });
});

describe('floor pace', () => {
  // Week Mon 2026-04-13 → Sun 2026-04-19, cutoff Wed 2026-04-15 (3 elapsed days)
  it('occurrence uses floor(N * elapsed/7)', () => {
    const plan: TacticPlan = {
      trackingType: 'boolean',
      recurrenceType: 'times_per_week',
      recurrenceCount: 3,
      targetValue: 1,
      unit: 'done',
    };
    expect(
      getPlannedTargetForDate({
        plan,
        full_week_planned: 3,
        blocks: [],
        week_start_date: '2026-04-13',
        week_end_date: '2026-04-19',
        scoring_cutoff_date: '2026-04-15',
      }),
    ).toBe(1);
  });

  it('volume keeps the exact prorata pace', () => {
    const plan: TacticPlan = {
      trackingType: 'quantity',
      recurrenceType: 'times_per_week',
      recurrenceCount: 1,
      targetValue: 10,
      unit: 'count',
    };
    expect(
      getPlannedTargetForDate({
        plan,
        full_week_planned: 10,
        blocks: [],
        week_start_date: '2026-04-13',
        week_end_date: '2026-04-19',
        scoring_cutoff_date: '2026-04-15',
      }),
    ).toBeCloseTo((10 * 3) / 7, 10);
  });

  it('uses floor pace when a quantity tactic explicitly uses occurrence', () => {
    const plan: TacticPlan = {
      trackingType: 'quantity',
      recurrenceType: 'times_per_week',
      recurrenceCount: 1,
      targetValue: 10,
      unit: 'count',
    };
    expect(
      getPlannedTargetForDate({
        plan,
        execution_style: 'occurrence',
        full_week_planned: 10,
        blocks: [],
        week_start_date: '2026-04-13',
        week_end_date: '2026-04-19',
        scoring_cutoff_date: '2026-04-15',
      }),
    ).toBe(4);
  });
});

describe('entry guards', () => {
  const occurrencePlan: TacticPlan = {
    trackingType: 'boolean',
    recurrenceType: 'times_per_week',
    recurrenceCount: 7,
    targetValue: 1,
    unit: 'posts',
  };
  const quantityPlan: TacticPlan = {
    trackingType: 'quantity',
    recurrenceType: 'times_per_week',
    recurrenceCount: 1,
    targetValue: 7,
    unit: 'posts',
  };
  const durationPlan: TacticPlan = {
    trackingType: 'duration',
    recurrenceType: 'times_per_week',
    recurrenceCount: 1,
    targetValue: 5,
    unit: 'hours',
  };

  it('occurrence needs positive whole values', () => {
    expect(resolveTacticEntryValue(occurrencePlan, 'occurrence', 2)).toBe(2);
    expect(
      resolveTacticEntryValue(occurrencePlan, 'occurrence', undefined),
    ).toBe(1);
    expect(() =>
      resolveTacticEntryValue(occurrencePlan, 'occurrence', 1.5),
    ).toThrow();
    expect(() =>
      resolveTacticEntryValue(occurrencePlan, 'occurrence', 0),
    ).toThrow();
    expect(() =>
      resolveTacticEntryValue(occurrencePlan, 'occurrence', -1),
    ).toThrow();
  });

  it('quantity defaults to 1', () => {
    expect(resolveTacticEntryValue(quantityPlan, 'volume', undefined)).toBe(1);
    expect(resolveTacticEntryValue(quantityPlan, 'volume', 3)).toBe(3);
  });

  it('duration requires a value', () => {
    expect(() =>
      resolveTacticEntryValue(durationPlan, 'volume', undefined),
    ).toThrow();
    expect(resolveTacticEntryValue(durationPlan, 'volume', 30)).toBe(30);
  });
});

describe('scheduled today tactics', () => {
  const occurrenceRow: TacticWeekScore = {
    tactic_id: 't1',
    tactic_title: 'Publish posts',
    goal_id: 'g1',
    goal_title: 'Audience',
    planned: 0,
    full_week_planned: 5,
    actual: 0,
    score: 0,
    weight: 1,
    status: 'off_track',
    unit: 'posts',
    tracking_type: 'boolean',
    recurrence_type: 'times_per_week',
    recurrence_count: 5,
    target_value: 1,
    execution_style: 'occurrence',
  };
  const durationRow: TacticWeekScore = {
    ...occurrenceRow,
    tactic_id: 't2',
    tactic_title: 'Bulk Up development',
    planned: 0,
    full_week_planned: 10,
    unit: 'hours',
    tracking_type: 'duration',
    recurrence_type: 'times_per_week',
    recurrence_count: 1,
    target_value: 10,
    execution_style: 'volume',
  };
  const block = (
    id: string,
    tacticId: string,
    date: string,
    plannedValue: number,
  ) => ({
    id,
    tactic_id: tacticId,
    date,
    start_time: null,
    end_time: null,
    duration_minutes: null,
    planned_value: plannedValue,
    note: null,
  });

  it('does not surface unscheduled flexible tactics', () => {
    expect(
      buildTodayTactics([occurrenceRow, durationRow], [], '2026-04-15', []),
    ).toEqual([]);
  });

  it('uses the sum of today scheduled occurrence blocks as today target', () => {
    const todayBlocks = [
      block('b1', 't1', '2026-04-15', 1),
      block('b2', 't1', '2026-04-15', 1),
    ];
    const entries = [
      { tactic_id: 't1', date: '2026-04-15', value: 1, completed: true },
    ];
    const rows = buildTodayTactics(
      [occurrenceRow],
      entries,
      '2026-04-15',
      todayBlocks,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.today_kind).toBe('scheduled');
    expect(rows[0]?.today_target).toBe(2);
    expect(rows[0]?.today_actual).toBe(1);
    expect(rows[0]?.today_remaining).toBe(1);
    expect(rows[0]?.today_label).toBe('2 posts scheduled');
    expect(rows[0]?.is_today_complete).toBe(false);
  });

  it('uses explicit occurrence semantics for a boolean daily tactic', () => {
    const explicitOccurrence: TacticWeekScore = {
      ...occurrenceRow,
      tactic_id: 'daily-occurrence',
      full_week_planned: 7,
      tracking_type: 'boolean',
      recurrence_type: 'daily',
      recurrence_count: 1,
      target_value: 1,
      execution_style: 'occurrence',
    };
    const todayBlocks = [block('b1', 'daily-occurrence', '2026-04-15', 2)];
    const entries = [
      {
        tactic_id: 'daily-occurrence',
        date: '2026-04-15',
        value: 1,
        completed: true,
      },
      {
        tactic_id: 'daily-occurrence',
        date: '2026-04-15',
        value: 1,
        completed: true,
      },
    ];
    const rows = buildTodayTactics(
      [explicitOccurrence],
      entries,
      '2026-04-15',
      todayBlocks,
    );
    expect(rows[0]?.today_actual).toBe(2);
    expect(rows[0]?.today_remaining).toBe(0);
    expect(rows[0]?.is_today_complete).toBe(true);
  });

  it('uses a custom duration block instead of the full weekly tactic target', () => {
    const todayBlock = block('b1', 't2', '2026-04-15', 2);
    const rows = buildTodayTactics([durationRow], [], '2026-04-15', [
      todayBlock,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.today_target).toBe(2);
    expect(rows[0]?.today_remaining).toBe(2);
    expect(rows[0]?.week_target).toBe(10);
    expect(rows[0]?.today_label).toBe('2 hours scheduled');
  });

  it('keeps a completed scheduled block visible for the day', () => {
    const todayBlock = block('b1', 't2', '2026-04-15', 2);
    const entries = [
      { tactic_id: 't2', date: '2026-04-15', value: 1, completed: false },
      { tactic_id: 't2', date: '2026-04-15', value: 1, completed: false },
    ];
    const rows = buildTodayTactics(
      [{ ...durationRow, actual: 2 }],
      entries,
      '2026-04-15',
      [todayBlock],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.due_today).toBe(false);
    expect(rows[0]?.is_today_complete).toBe(true);
    expect(rows[0]?.today_remaining).toBe(0);
  });

  it('does not show weekday toggles on weekends', () => {
    const weekdayToggle: TacticWeekScore = {
      ...occurrenceRow,
      tactic_id: 'toggle-weekday',
      full_week_planned: 5,
      planned: 5,
      tracking_type: 'boolean',
      recurrence_type: 'weekdays',
      recurrence_count: 1,
      target_value: 1,
      execution_style: 'toggle',
    };
    expect(buildTodayTactics([weekdayToggle], [], '2026-04-18', [])).toEqual(
      [],
    );
  });

  it('keeps completed recurring volume tactics visible on their recurrence day', () => {
    const dailyVolume: TacticWeekScore = {
      ...durationRow,
      tactic_id: 'daily-volume',
      planned: 2,
      full_week_planned: 14,
      actual: 2,
      recurrence_type: 'daily',
      target_value: 2,
      execution_style: 'volume',
    };
    const entries = [
      {
        tactic_id: 'daily-volume',
        date: '2026-04-15',
        value: 2,
        completed: false,
      },
    ];
    const rows = buildTodayTactics([dailyVolume], entries, '2026-04-15', []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.today_kind).toBe('recurring');
    expect(rows[0]?.today_target).toBe(2);
    expect(rows[0]?.is_today_complete).toBe(true);
  });
});

describe('resolveScheduledStatus', () => {
  const base = {
    style: 'occurrence' as const,
    full_week_planned: 3,
    planned: 1,
    actual: 0,
    scheduled_dates: [] as string[],
    as_of_date: '2026-09-03',
  };
  it('returns null when nothing is scheduled', () => {
    expect(resolveScheduledStatus(base)).toBeNull();
  });
  it('returns coming when untouched and everything is in the future', () => {
    expect(
      resolveScheduledStatus({
        ...base,
        scheduled_dates: ['2026-09-04', '2026-09-05'],
      }),
    ).toBe('coming');
  });
  it('returns null once the pool is full', () => {
    expect(
      resolveScheduledStatus({
        ...base,
        actual: 3,
        scheduled_dates: ['2026-09-04'],
      }),
    ).toBeNull();
  });
  it('compares actual vs due-by-now for occurrence', () => {
    expect(
      resolveScheduledStatus({
        ...base,
        scheduled_dates: ['2026-09-01', '2026-09-03', '2026-09-05'],
      }),
    ).toBe('off_track');
    expect(
      resolveScheduledStatus({
        ...base,
        actual: 2,
        scheduled_dates: ['2026-09-01', '2026-09-03', '2026-09-05'],
      }),
    ).toBe('on_track');
    expect(
      resolveScheduledStatus({
        ...base,
        actual: 1,
        scheduled_dates: ['2026-09-01', '2026-09-03', '2026-09-05'],
      }),
    ).toBe('warning');
  });
  it('uses scheduled values rather than block count for occurrence status', () => {
    const input = {
      ...base,
      actual: 1,
      scheduled_dates: ['2026-09-01'],
      scheduled_blocks: [{ date: '2026-09-01', planned_value: 3 }],
    };
    expect(resolveScheduledStatus(input)).toBe('warning');
  });
  it('keeps volume on its score status (null) past the coming check', () => {
    expect(
      resolveScheduledStatus({
        ...base,
        style: 'volume',
        scheduled_dates: ['2026-09-01'],
      }),
    ).toBeNull();
    expect(
      resolveScheduledStatus({
        ...base,
        style: 'volume',
        scheduled_dates: ['2026-09-05'],
      }),
    ).toBe('coming');
  });
  it('marks toggles coming when their day is still ahead', () => {
    expect(
      resolveScheduledStatus({
        ...base,
        style: 'toggle',
        planned: 1,
        scheduled_dates: ['2026-09-05'],
      }),
    ).toBe('coming');
  });
});
