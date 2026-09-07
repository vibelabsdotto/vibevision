import { DatabaseService } from '../database/database.service';
import { LagIndicatorsService } from './lag-indicators.service';

const USER_A = 'user-a';
const USER_B = 'user-b';

function setup(): { lags: LagIndicatorsService; goalId: string } {
  const database = new DatabaseService(':memory:');
  database.onModuleInit();
  const now = Date.now();
  const iso = new Date().toISOString();
  for (const [id, email] of [
    [USER_A, 'a@test.local'],
    [USER_B, 'b@test.local'],
  ] as const) {
    database.sqlite
      .prepare(
        'insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      )
      .run(id, id, email, 0, now, now);
  }
  database.sqlite
    .prepare(
      'insert into cycles (id, user_id, slug, title, vision, start_date, end_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('cycle-1', USER_A, 'c1', 'C1', '', '2026-08-31', '2026-11-22', 'active', iso, iso);
  const goalId = 'goal-1';
  database.sqlite
    .prepare(
      "insert into goals (id, user_id, cycle_id, title, description, sort_order, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)",
    )
    .run(goalId, USER_A, 'cycle-1', 'G1', '', 0, iso, iso);
  return { lags: new LagIndicatorsService(database), goalId };
}

describe('LagIndicatorsService', () => {
  it('creates and achieves', () => {
    const { lags, goalId } = setup();
    const lag = lags.create(USER_A, {
      goal_id: goalId,
      title: 'Revenue',
      type: 'number',
      target_value: 100,
      current_value: 40,
    });
    expect(lag.achieved).toBe(0);
    const done = lags.achieve(USER_A, lag.id);
    expect(done.achieved).toBe(1);
    expect(done.current_value).toBe(100);
  });

  it('rejects bad types and unknown goals', () => {
    const { lags, goalId } = setup();
    expect(() =>
      lags.create(USER_A, { goal_id: goalId, title: 'X', type: 'nope' }),
    ).toThrow(/Invalid type/);
    expect(() => lags.create(USER_A, { goal_id: 'missing', title: 'X' })).toThrow(
      /unknown goal_id/,
    );
  });

  it('isolates lag indicators per user (controller: GET/LIST/PUT/ACHIEVE/DELETE)', () => {
    const { lags, goalId } = setup();
    const owned = lags.create(USER_A, { goal_id: goalId, title: 'Mine' });
    expect(lags.list(USER_B, {}).total).toBe(0);
    expect(() => lags.get(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() => lags.update(USER_B, owned.id, { title: 'Hijack' })).toThrow(
      /404|not_found/i,
    );
    expect(() => lags.achieve(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() => lags.remove(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() =>
      lags.create(USER_B, { goal_id: goalId, title: 'Cross' }),
    ).toThrow(/unknown goal_id/);
  });
});
