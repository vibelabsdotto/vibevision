import { DatabaseService } from '../database/database.service';
import { LagIndicatorsService } from './lag-indicators.service';

function setup(): { lags: LagIndicatorsService; goalId: string } {
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
  const goalId = 'goal-1';
  database.sqlite
    .prepare(
      "insert into goals (id, cycle_id, title, description, sort_order, status, created_at, updated_at) values (?, ?, ?, ?, ?, 'in_progress', ?, ?)",
    )
    .run(goalId, 'cycle-1', 'G1', '', 0, now, now);
  return { lags: new LagIndicatorsService(database), goalId };
}

describe('LagIndicatorsService', () => {
  it('creates and achieves', () => {
    const { lags, goalId } = setup();
    const lag = lags.create({
      goal_id: goalId,
      title: 'Revenue',
      type: 'number',
      target_value: 100,
      current_value: 40,
    });
    expect(lag.achieved).toBe(0);
    const done = lags.achieve(lag.id);
    expect(done.achieved).toBe(1);
    expect(done.current_value).toBe(100);
  });

  it('rejects bad types and unknown goals', () => {
    const { lags, goalId } = setup();
    expect(() =>
      lags.create({ goal_id: goalId, title: 'X', type: 'nope' }),
    ).toThrow(/Invalid type/);
    expect(() => lags.create({ goal_id: 'missing', title: 'X' })).toThrow(
      /unknown goal_id/,
    );
  });
});
