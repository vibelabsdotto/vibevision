import { DatabaseService } from '../database/database.service';
import { TacticsService } from './tactics.service';

const USER_A = 'user-a';
const USER_B = 'user-b';

function setup(): { tactics: TacticsService; goalId: string } {
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
  const cycleId = 'cycle-1';
  database.sqlite
    .prepare(
      'insert into cycles (id, user_id, slug, title, vision, start_date, end_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(cycleId, USER_A, 'c1', 'C1', '', '2026-08-31', '2026-11-22', 'active', iso, iso);
  const goalId = 'goal-1';
  database.sqlite
    .prepare(
      "insert into goals (id, user_id, cycle_id, title, description, sort_order, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)",
    )
    .run(goalId, USER_A, cycleId, 'G1', '', 0, iso, iso);
  return { tactics: new TacticsService(database), goalId };
}

const BASE = {
  tracking_type: 'quantity',
  recurrence_type: 'times_per_week',
  target_value: 3,
  unit: 'assets',
};

describe('TacticsService', () => {
  it('creates a volume tactic', () => {
    const { tactics, goalId } = setup();
    const tactic = tactics.create(USER_A, {
      goal_id: goalId,
      title: 'SEO',
      ...BASE,
    });
    expect(tactic.tracking_type).toBe('quantity');
    expect(tactic.target_value).toBe(3);
    expect(tactic.type).toBe('habit');
  });

  it('rejects unknown goal_id', () => {
    const { tactics } = setup();
    expect(() =>
      tactics.create(USER_A, { goal_id: 'missing', title: 'X', ...BASE }),
    ).toThrow(/unknown goal_id/);
  });

  it('rejects bad tracking_type and boolean target != 1', () => {
    const { tactics, goalId } = setup();
    expect(() =>
      tactics.create(USER_A, {
        goal_id: goalId,
        title: 'X',
        tracking_type: 'nope',
        recurrence_type: 'daily',
        target_value: 1,
        unit: 'x',
      }),
    ).toThrow(/tracking_type/);
    expect(() =>
      tactics.create(USER_A, {
        goal_id: goalId,
        title: 'X',
        tracking_type: 'boolean',
        recurrence_type: 'daily',
        target_value: 2,
        unit: 'x',
      }),
    ).toThrow(/must be 1/);
  });

  it('rejects contradicting execution_style', () => {
    const { tactics, goalId } = setup();
    expect(() =>
      tactics.create(USER_A, {
        goal_id: goalId,
        title: 'X',
        ...BASE,
        execution_style: 'toggle',
      }),
    ).toThrow(/contradicts/);
  });

  it('revalidates the merged plan on update', () => {
    const { tactics, goalId } = setup();
    const tactic = tactics.create(USER_A, {
      goal_id: goalId,
      title: 'SEO',
      ...BASE,
    });
    expect(() =>
      tactics.update(USER_A, tactic.id, { tracking_type: 'boolean' }),
    ).toThrow(/must be 1/);
    const updated = tactics.update(USER_A, tactic.id, { target_value: 5 });
    expect(updated.target_value).toBe(5);
  });

  it('lists filtered by goal', () => {
    const { tactics, goalId } = setup();
    tactics.create(USER_A, { goal_id: goalId, title: 'A', ...BASE });
    tactics.create(USER_A, { goal_id: goalId, title: 'B', ...BASE });
    const list = tactics.list(USER_A, { goal_id: goalId });
    expect(list.total).toBe(2);
  });

  it('isolates tactics per user (controller: GET/LIST/PUT/DELETE/today-state)', () => {
    const { tactics, goalId } = setup();
    const owned = tactics.create(USER_A, {
      goal_id: goalId,
      title: 'Mine',
      ...BASE,
    });
    expect(tactics.list(USER_B, {}).total).toBe(0);
    expect(() => tactics.get(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() => tactics.update(USER_B, owned.id, { title: 'Hijack' })).toThrow(
      /404|not_found/i,
    );
    expect(() => tactics.remove(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() =>
      tactics.create(USER_B, { goal_id: goalId, title: 'Cross', ...BASE }),
    ).toThrow(/unknown goal_id/);
  });
});
