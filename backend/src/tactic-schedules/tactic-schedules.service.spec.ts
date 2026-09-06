import { DatabaseService } from '../database/database.service';
import { TacticSchedulesService } from './tactic-schedules.service';

function setup(): { schedules: TacticSchedulesService; tacticId: string } {
  const database = new DatabaseService(':memory:');
  database.onModuleInit();
  const now = new Date().toISOString();
  database.sqlite
    .prepare(
      'insert into cycles (id, slug, title, vision, start_date, end_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      'cycle-1',
      'c1',
      'C1',
      '',
      '2026-08-31',
      '2026-11-22',
      'active',
      now,
      now,
    );
  database.sqlite
    .prepare(
      "insert into goals (id, cycle_id, title, description, sort_order, status, created_at, updated_at) values (?, ?, ?, ?, ?, 'in_progress', ?, ?)",
    )
    .run('goal-1', 'cycle-1', 'G1', '', 0, now, now);
  const tacticId = 'tactic-1';
  database.sqlite
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
      'habit',
      'boolean',
      'times_per_week',
      null,
      3,
      1,
      'x',
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
  return { schedules: new TacticSchedulesService(database), tacticId };
}

describe('TacticSchedulesService', () => {
  it('upserts per tactic+week', () => {
    const { schedules, tacticId } = setup();
    const first = schedules.upsert({
      tactic_id: tacticId,
      week_number: 3,
      planned_target: 5,
      required: true,
    });
    expect(first.created).toBe(true);
    expect(first.schedule.planned_target).toBe(5);
    const second = schedules.upsert({
      tactic_id: tacticId,
      week_number: 3,
      planned_target: 7,
    });
    expect(second.created).toBe(false);
    expect(second.schedule.id).toBe(first.schedule.id);
    expect(second.schedule.planned_target).toBe(7);
    expect(second.schedule.required).toBe(0);
  });

  it('rejects unknown tactic and bad weeks', () => {
    const { schedules } = setup();
    expect(() =>
      schedules.upsert({ tactic_id: 'missing', week_number: 1 }),
    ).toThrow(/unknown tactic_id/);
    const { tacticId } = setup();
    expect(() =>
      schedules.upsert({ tactic_id: tacticId, week_number: 13 }),
    ).toThrow(/1\.\.12/);
  });

  it('keeps tactic/week immutable on update', () => {
    const { schedules, tacticId } = setup();
    const { schedule } = schedules.upsert({
      tactic_id: tacticId,
      week_number: 2,
      planned_target: 4,
    });
    expect(() => schedules.update(schedule.id, { week_number: 3 })).toThrow(
      /immutable/,
    );
  });
});
