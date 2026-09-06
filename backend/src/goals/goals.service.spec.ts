import { DatabaseService } from '../database/database.service';
import { GoalsService } from './goals.service';

function setup(): { goals: GoalsService; cycleId: string } {
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
  return { goals: new GoalsService(database), cycleId };
}

describe('GoalsService', () => {
  it('creates with defaults and lists by cycle', () => {
    const { goals, cycleId } = setup();
    const goal = goals.create({ cycle_id: cycleId, title: 'G1' });
    expect(goal.status).toBe('in_progress');
    expect(goals.list({ cycle_id: cycleId }).total).toBe(1);
  });

  it('rejects unknown cycle and bad status', () => {
    const { goals } = setup();
    expect(() => goals.create({ cycle_id: 'missing', title: 'X' })).toThrow(
      /unknown cycle_id/,
    );
    const { cycleId } = setup();
    expect(() =>
      goals.create({ cycle_id: cycleId, title: 'X', status: 'nope' }),
    ).toThrow(/Invalid status/);
  });

  it('keeps cycle immutable and 404s missing rows', () => {
    const { goals, cycleId } = setup();
    const goal = goals.create({ cycle_id: cycleId, title: 'G1' });
    expect(() => goals.update(goal.id, { cycle_id: 'other' })).toThrow(
      /immutable/,
    );
    expect(() => goals.get('missing')).toThrow(/404|not_found/i);
  });
});
