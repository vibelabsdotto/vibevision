import { DatabaseService } from '../database/database.service';
import { SettingsService } from '../settings/settings.service';
import { CyclesService } from './cycles.service';

function setup(): CyclesService {
  const database = new DatabaseService(':memory:');
  database.onModuleInit();
  return new CyclesService(database, new SettingsService(database));
}

describe('CyclesService', () => {
  it('creates a cycle with 12 monday-start weeks', () => {
    const cycles = setup();
    // 2026-09-06 is a Sunday → week starts Monday 2026-08-31
    const cycle = cycles.create({
      title: 'Test Cycle',
      start_date: '2026-09-06',
    });
    expect(cycle.slug).toBe('test-cycle');
    expect(cycle.start_date).toBe('2026-08-31');
    expect(cycle.end_date).toBe('2026-11-22');
    expect(cycle.status).toBe('planned');
    const list = cycles.list({});
    expect(list.total).toBe(1);
    // weeks are readable via the shared db handle
    const db = (cycles as unknown as { database: DatabaseService }).database
      .sqlite;
    const weeks = db
      .prepare(
        'select * from cycle_weeks where cycle_id = ? order by week_number',
      )
      .all(cycle.id) as Array<{ week_number: number; label: string }>;
    expect(weeks).toHaveLength(12);
    expect(weeks[0]).toMatchObject({ week_number: 1, label: 'Week 1' });
    expect(weeks[11]?.week_number).toBe(12);
  });

  it('dedupes slugs', () => {
    const cycles = setup();
    const first = cycles.create({ title: 'Same', start_date: '2026-08-31' });
    const second = cycles.create({ title: 'Same', start_date: '2026-08-31' });
    expect(first.slug).toBe('same');
    expect(second.slug).toBe('same-2');
  });

  it('activates exclusively and records the setting', () => {
    const cycles = setup();
    const first = cycles.create({ title: 'One', start_date: '2026-08-31' });
    const second = cycles.create({ title: 'Two', start_date: '2026-08-31' });
    cycles.activate(first.id);
    expect(cycles.get(first.id).status).toBe('active');
    cycles.activate(second.id);
    expect(cycles.get(first.id).status).toBe('planned');
    expect(cycles.get(second.id).status).toBe('active');
    expect(cycles.getActive()?.id).toBe(second.id);
  });

  it('rejects status=active via PUT', () => {
    const cycles = setup();
    const cycle = cycles.create({ title: 'One', start_date: '2026-08-31' });
    expect(() => cycles.update(cycle.id, { status: 'active' })).toThrow(
      /activate/,
    );
  });

  it('rejects unknown fields with 422', () => {
    const cycles = setup();
    expect(() =>
      cycles.create({ title: 'X', start_date: '2026-08-31', nope: 1 } as never),
    ).toThrow(/unprocessable|Unknown/i);
  });

  it('removes with cascade', () => {
    const cycles = setup();
    const cycle = cycles.create({ title: 'Gone', start_date: '2026-08-31' });
    expect(cycles.remove(cycle.id)).toEqual({ ok: true });
    expect(() => cycles.get(cycle.id)).toThrow(/404|not_found/i);
    const db = (cycles as unknown as { database: DatabaseService }).database
      .sqlite;
    const weeks = db
      .prepare('select * from cycle_weeks where cycle_id = ?')
      .all(cycle.id) as unknown[];
    expect(weeks).toHaveLength(0);
  });

  it('returns null when no active cycle exists', () => {
    expect(setup().getActive()).toBeNull();
  });
});
