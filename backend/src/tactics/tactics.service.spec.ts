import { DatabaseService } from '../database/database.service';
import { TacticsService } from './tactics.service';

function setup(): { tactics: TacticsService; goalId: string } {
  const database = new DatabaseService(':memory:');
  database.onModuleInit();
  const now = new Date().toISOString();
  const cycleId = 'cycle-1';
  database.sqlite
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
  const goalId = 'goal-1';
  database.sqlite
    .prepare(
      "insert into goals (id, cycle_id, title, description, sort_order, status, created_at, updated_at) values (?, ?, ?, ?, ?, 'in_progress', ?, ?)",
    )
    .run(goalId, cycleId, 'G1', '', 0, now, now);
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
    const tactic = tactics.create({ goal_id: goalId, title: 'SEO', ...BASE });
    expect(tactic.tracking_type).toBe('quantity');
    expect(tactic.target_value).toBe(3);
    expect(tactic.type).toBe('habit');
  });

  it('rejects unknown goal_id', () => {
    const { tactics } = setup();
    expect(() =>
      tactics.create({ goal_id: 'missing', title: 'X', ...BASE }),
    ).toThrow(/unknown goal_id/);
  });

  it('rejects bad tracking_type and boolean target != 1', () => {
    const { tactics, goalId } = setup();
    expect(() =>
      tactics.create({
        goal_id: goalId,
        title: 'X',
        tracking_type: 'nope',
        recurrence_type: 'daily',
        target_value: 1,
        unit: 'x',
      }),
    ).toThrow(/tracking_type/);
    expect(() =>
      tactics.create({
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
      tactics.create({
        goal_id: goalId,
        title: 'X',
        ...BASE,
        execution_style: 'toggle',
      }),
    ).toThrow(/contradicts/);
  });

  it('revalidates the merged plan on update', () => {
    const { tactics, goalId } = setup();
    const tactic = tactics.create({ goal_id: goalId, title: 'SEO', ...BASE });
    expect(() =>
      tactics.update(tactic.id, { tracking_type: 'boolean' }),
    ).toThrow(/must be 1/);
    const updated = tactics.update(tactic.id, { target_value: 5 });
    expect(updated.target_value).toBe(5);
  });

  it('lists filtered by goal', () => {
    const { tactics, goalId } = setup();
    tactics.create({ goal_id: goalId, title: 'A', ...BASE });
    tactics.create({ goal_id: goalId, title: 'B', ...BASE });
    const list = tactics.list({ goal_id: goalId });
    expect(list.total).toBe(2);
  });
});
