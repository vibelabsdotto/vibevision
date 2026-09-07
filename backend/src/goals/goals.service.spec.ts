import { DatabaseService } from '../database/database.service';
import { GoalsService } from './goals.service';

const USER_A = 'user-a';
const USER_B = 'user-b';

function setup(): { goals: GoalsService; cycleId: string } {
  const database = new DatabaseService(':memory:');
  database.onModuleInit();
  const now = Date.now();
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
  const cycleId = 'cycle-1';
  database.sqlite
    .prepare(
      'insert into cycles (id, user_id, slug, title, vision, start_date, end_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      cycleId,
      USER_A,
      'c1',
      'C1',
      '',
      '2026-08-31',
      '2026-11-22',
      'active',
      new Date().toISOString(),
      new Date().toISOString(),
    );
  return { goals: new GoalsService(database), cycleId };
}

describe('GoalsService', () => {
  it('creates with defaults and lists by cycle', () => {
    const { goals, cycleId } = setup();
    const goal = goals.create(USER_A, { cycle_id: cycleId, title: 'G1' });
    expect(goal.status).toBe('in_progress');
    expect(goals.list(USER_A, { cycle_id: cycleId }).total).toBe(1);
  });

  it('rejects unknown cycle and bad status', () => {
    const { goals } = setup();
    expect(() => goals.create(USER_A, { cycle_id: 'missing', title: 'X' })).toThrow(
      /unknown cycle_id/,
    );
    const { cycleId } = setup();
    expect(() =>
      goals.create(USER_A, { cycle_id: cycleId, title: 'X', status: 'nope' }),
    ).toThrow(/Invalid status/);
  });

  it('keeps cycle immutable and 404s missing rows', () => {
    const { goals, cycleId } = setup();
    const goal = goals.create(USER_A, { cycle_id: cycleId, title: 'G1' });
    expect(() => goals.update(USER_A, goal.id, { cycle_id: 'other' })).toThrow(
      /immutable/,
    );
    expect(() => goals.get(USER_A, 'missing')).toThrow(/404|not_found/i);
  });

  it('isolates goals per user (controller: GET/LIST/PUT/DELETE)', () => {
    const { goals, cycleId } = setup();
    const owned = goals.create(USER_A, { cycle_id: cycleId, title: 'Mine' });
    expect(goals.list(USER_B, {}).total).toBe(0);
    expect(() => goals.get(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() => goals.update(USER_B, owned.id, { title: 'Hijack' })).toThrow(
      /404|not_found/i,
    );
    expect(() => goals.remove(USER_B, owned.id)).toThrow(/404|not_found/i);
    // another user's cycle id is not usable as a parent
    expect(() =>
      goals.create(USER_B, { cycle_id: cycleId, title: 'Cross' }),
    ).toThrow(/unknown cycle_id/);
  });
});
