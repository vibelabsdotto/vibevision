import { DatabaseService } from '../database/database.service';
import { CalendarBlocksService } from './calendar-blocks.service';

function setup(): {
  blocks: CalendarBlocksService;
  db: DatabaseService;
  tacticId: string;
  cycleId: string;
} {
  const db = new DatabaseService(':memory:');
  db.onModuleInit();
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
      'habit',
      'quantity',
      'times_per_week',
      'volume',
      1,
      3,
      'assets',
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
  return { blocks: new CalendarBlocksService(db), db, tacticId, cycleId };
}

describe('CalendarBlocksService', () => {
  it('schedules within the weekly budget', () => {
    const { blocks, tacticId } = setup();
    const block = blocks.create({
      tactic_id: tacticId,
      date: '2026-09-02',
      planned_value: 2,
    });
    expect(block.week_number).toBe(1);
    expect(block.planned_value).toBe(2);
  });

  it('rejects over-budget and out-of-cycle dates', () => {
    const { blocks, tacticId } = setup();
    blocks.create({
      tactic_id: tacticId,
      date: '2026-09-02',
      planned_value: 3,
    });
    expect(() =>
      blocks.create({
        tactic_id: tacticId,
        date: '2026-09-03',
        planned_value: 1,
      }),
    ).toThrow(/remain to schedule/);
    expect(() =>
      blocks.create({
        tactic_id: tacticId,
        date: '2027-01-01',
        planned_value: 1,
      }),
    ).toThrow(/not inside the tactic cycle/);
  });

  it('rejects mismatched cycle and bad times', () => {
    const { blocks, tacticId, cycleId } = setup();
    expect(() =>
      blocks.create({
        tactic_id: tacticId,
        cycle_id: 'other',
        date: '2026-09-02',
        planned_value: 1,
      }),
    ).toThrow(/cycle does not match/);
    expect(() =>
      blocks.create({
        tactic_id: tacticId,
        cycle_id: cycleId,
        date: '2026-09-02',
        start_time: '10:00',
        end_time: '09:00',
        planned_value: 1,
      }),
    ).toThrow(/after start_time/);
  });
});
