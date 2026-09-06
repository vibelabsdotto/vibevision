import { DatabaseService } from '../database/database.service';
import { EntriesService } from './entries.service';

function seedTactic(
  db: DatabaseService,
  overrides: Record<string, unknown> = {},
): { tacticId: string; cycleId: string } {
  const now = new Date().toISOString();
  const cycleId = 'cycle-1';
  db.sqlite
    .prepare(
      'insert into cycles (id, slug, title, vision, start_date, end_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      cycleId,
      'c1',
      'C1',
      '',
      '2026-08-31',
      '2026-11-22',
      'active',
      now,
      now,
    );
  for (let w = 1; w <= 12; w += 1) {
    const start = new Date(Date.UTC(2026, 7, 31 + (w - 1) * 7));
    const end = new Date(Date.UTC(2026, 7, 31 + (w - 1) * 7 + 6));
    db.sqlite
      .prepare(
        'insert into cycle_weeks (id, cycle_id, week_number, start_date, end_date, label, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        `w${w}`,
        cycleId,
        w,
        start.toISOString().slice(0, 10),
        end.toISOString().slice(0, 10),
        `Week ${w}`,
        now,
        now,
      );
  }
  db.sqlite
    .prepare(
      "insert into goals (id, cycle_id, title, description, sort_order, status, created_at, updated_at) values (?, ?, ?, ?, ?, 'in_progress', ?, ?)",
    )
    .run('goal-1', cycleId, 'G1', '', 0, now, now);
  const tacticId = 'tactic-1';
  db.sqlite
    .prepare(
      `insert into tactics (id, goal_id, title, type, tracking_type, recurrence_type, execution_style,
        recurrence_count, target_value, unit, target_per_week, target_per_day, scoring_weight,
        starts_week, ends_week, active, sort_order, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      tacticId,
      'goal-1',
      'T1',
      (overrides.type as string) ?? 'habit',
      (overrides.tracking_type as string) ?? 'quantity',
      (overrides.recurrence_type as string) ?? 'daily',
      (overrides.execution_style as string) ?? null,
      (overrides.recurrence_count as number) ?? 1,
      (overrides.target_value as number) ?? 1,
      'units',
      0,
      0,
      1,
      null,
      null,
      1,
      0,
      now,
      now,
    );
  return { tacticId, cycleId };
}

function setup(overrides: Record<string, unknown> = {}): {
  entries: EntriesService;
  tacticId: string;
  cycleId: string;
} {
  const db = new DatabaseService(':memory:');
  db.onModuleInit();
  const { tacticId, cycleId } = seedTactic(db, overrides);
  return { entries: new EntriesService(db), tacticId, cycleId };
}

describe('EntriesService', () => {
  it('logs a daily entry and caps at the daily target', () => {
    const { entries, tacticId } = setup();
    const first = entries.create({
      tactic_id: tacticId,
      date: '2026-09-02',
      value: 1,
    });
    expect(first.value).toBe(1);
    expect(first.week_number).toBe(1);
    expect(() =>
      entries.create({ tactic_id: tacticId, date: '2026-09-02', value: 1 }),
    ).toThrow(/remain for this date/);
  });

  it('counts toggle completes and rejects empty ones', () => {
    const { entries, tacticId } = setup({
      type: 'daily_checkbox',
      tracking_type: 'boolean',
      recurrence_type: 'daily',
      target_value: 1,
    });
    expect(() =>
      entries.create({ tactic_id: tacticId, date: '2026-09-02', value: 0 }),
    ).toThrow(/Invalid tactic entry value/);
    const done = entries.create({
      tactic_id: tacticId,
      date: '2026-09-02',
      completed: true,
    });
    expect(done.completed).toBe(1);
  });

  it('requires whole numbers for occurrence', () => {
    const { entries, tacticId } = setup({
      tracking_type: 'boolean',
      recurrence_type: 'times_per_week',
      recurrence_count: 3,
      target_value: 1,
    });
    expect(() =>
      entries.create({ tactic_id: tacticId, date: '2026-09-02', value: 1.5 }),
    ).toThrow(/whole number/);
  });

  it('rejects forged buckets and out-of-cycle dates', () => {
    const { entries, tacticId, cycleId } = setup();
    expect(() =>
      entries.create({
        tactic_id: tacticId,
        cycle_id: 'forged',
        date: '2026-09-02',
        value: 1,
      }),
    ).toThrow(/cycle does not match/);
    expect(cycleId).toBe('cycle-1');
    expect(() =>
      entries.create({ tactic_id: tacticId, date: '2027-05-05', value: 1 }),
    ).toThrow(/not inside the tactic cycle/);
  });

  it('refuses to delete negative rows', () => {
    const { entries, tacticId } = setup({ target_value: 5 });
    entries.create({ tactic_id: tacticId, date: '2026-09-02', value: 3 });
    const neg = entries.create({
      tactic_id: tacticId,
      date: '2026-09-02',
      value: -1,
    });
    expect(neg.value).toBe(-1);
    expect(() => entries.remove(neg.id)).toThrow(/cannot be deleted directly/);
  });

  it('rejects entries that would drive the day below zero', () => {
    const { entries, tacticId } = setup();
    expect(() =>
      entries.create({ tactic_id: tacticId, date: '2026-09-02', value: -1 }),
    ).toThrow(/cannot be negative/);
  });
});
