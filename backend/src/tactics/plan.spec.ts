import {
  deriveExecutionStyle,
  getPlannedWeeklyTarget,
  isTacticActiveInWeek,
  resolveExecutionStyle,
  resolveTacticPlan,
  assertValidPlan,
} from './plan';

describe('tactic plan', () => {
  it('maps legacy types', () => {
    expect(
      resolveTacticPlan({ type: 'daily_checkbox', unit: 'x' }),
    ).toMatchObject({ trackingType: 'boolean', recurrenceType: 'daily' });
    expect(
      resolveTacticPlan({
        type: 'weekly_hours',
        target_per_week: 5,
        unit: 'h',
      }),
    ).toMatchObject({
      trackingType: 'duration',
      recurrenceType: 'times_per_week',
      targetValue: 5,
    });
    expect(
      resolveTacticPlan({
        type: 'weekly_count',
        target_per_week: 3,
        unit: 'x',
      }),
    ).toMatchObject({ trackingType: 'quantity', targetValue: 3 });
    expect(resolveTacticPlan({ type: 'one_time', unit: 'x' })).toMatchObject({
      recurrenceType: 'once',
      targetValue: 1,
    });
    expect(
      resolveTacticPlan({ type: 'habit', target_per_week: 3, unit: 'x' }),
    ).toMatchObject({
      recurrenceType: 'times_per_week',
      recurrenceCount: 3,
    });
    expect(
      resolveTacticPlan({ type: 'habit', target_per_week: 7, unit: 'x' }),
    ).toMatchObject({ recurrenceType: 'daily' });
  });

  it('strict rejects unknown types', () => {
    expect(() =>
      resolveTacticPlan({ type: 'nope', unit: 'x' }, { strict: true }),
    ).toThrow(/Unknown tactic type/);
    expect(() =>
      resolveTacticPlan(
        { tracking_type: 'nope', recurrence_type: 'daily', unit: 'x' },
        { strict: true },
      ),
    ).toThrow(/Unknown tracking_type/);
  });

  it('derives execution styles', () => {
    const toggle = resolveTacticPlan({ type: 'daily_checkbox', unit: 'x' });
    expect(deriveExecutionStyle(toggle)).toBe('toggle');
    const occurrence = resolveTacticPlan({
      type: 'habit',
      target_per_week: 3,
      unit: 'x',
    });
    expect(deriveExecutionStyle(occurrence)).toBe('occurrence');
    const volume = resolveTacticPlan({
      type: 'weekly_hours',
      target_per_week: 5,
      unit: 'h',
    });
    expect(deriveExecutionStyle(volume)).toBe('volume');
  });

  it('explicit style wins when valid, throws when strict and contradicting', () => {
    const plan = resolveTacticPlan({ type: 'daily_checkbox', unit: 'x' });
    expect(resolveExecutionStyle(plan, { execution_style: 'toggle' })).toBe(
      'toggle',
    );
    expect(() =>
      resolveExecutionStyle(
        plan,
        { execution_style: 'volume' },
        { strict: true },
      ),
    ).toThrow(/contradicts/);
    // non-strict falls back to derived
    expect(resolveExecutionStyle(plan, { execution_style: 'volume' })).toBe(
      'toggle',
    );
  });

  it('computes weekly targets', () => {
    expect(
      getPlannedWeeklyTarget(
        resolveTacticPlan({
          tracking_type: 'quantity',
          recurrence_type: 'daily',
          target_value: 2,
          unit: 'x',
        }),
      ),
    ).toBe(14);
    expect(
      getPlannedWeeklyTarget(
        resolveTacticPlan({
          tracking_type: 'quantity',
          recurrence_type: 'times_per_week',
          recurrence_count: 3,
          target_value: 2,
          unit: 'x',
        }),
      ),
    ).toBe(6);
  });

  it('validates write-path plans', () => {
    expect(() =>
      assertValidPlan({
        trackingType: 'quantity',
        recurrenceType: 'daily',
        recurrenceCount: 1,
        targetValue: 0,
        unit: 'x',
      }),
    ).toThrow(/greater than 0/);
    expect(() =>
      assertValidPlan({
        trackingType: 'boolean',
        recurrenceType: 'daily',
        recurrenceCount: 1,
        targetValue: 2,
        unit: 'x',
      }),
    ).toThrow(/must be 1/);
  });

  it('checks week activity windows', () => {
    expect(
      isTacticActiveInWeek({ starts_week: 2, ends_week: 5, active: true }, 3),
    ).toBe(true);
    expect(
      isTacticActiveInWeek({ starts_week: 2, ends_week: 5, active: true }, 6),
    ).toBe(false);
    expect(
      isTacticActiveInWeek(
        { starts_week: null, ends_week: null, active: false },
        1,
      ),
    ).toBe(false);
    expect(
      isTacticActiveInWeek(
        { starts_week: null, ends_week: null, active: false },
        1,
        { required: true },
      ),
    ).toBe(true);
  });
});
