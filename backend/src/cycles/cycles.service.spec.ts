import { DatabaseService } from '../database/database.service';
import { SettingsService } from '../settings/settings.service';
import { CyclesService } from './cycles.service';

const USER_A = 'user-a';
const USER_B = 'user-b';

function seedUsers(database: DatabaseService): void {
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
}

function setup(): CyclesService {
  const database = new DatabaseService(':memory:');
  database.onModuleInit();
  seedUsers(database);
  return new CyclesService(database, new SettingsService(database));
}

describe('CyclesService', () => {
  it('creates a cycle with 12 monday-start weeks', () => {
    const cycles = setup();
    // 2026-09-06 is a Sunday → week starts Monday 2026-08-31
    const cycle = cycles.create(USER_A, {
      title: 'Test Cycle',
      start_date: '2026-09-06',
    });
    expect(cycle.slug).toBe('test-cycle');
    expect(cycle.start_date).toBe('2026-08-31');
    expect(cycle.end_date).toBe('2026-11-22');
    expect(cycle.status).toBe('planned');
    const list = cycles.list(USER_A, {});
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
    const first = cycles.create(USER_A, {
      title: 'Same',
      start_date: '2026-08-31',
    });
    const second = cycles.create(USER_A, {
      title: 'Same',
      start_date: '2026-08-31',
    });
    expect(first.slug).toBe('same');
    expect(second.slug).toBe('same-2');
  });

  it('activates exclusively and records the setting', () => {
    const cycles = setup();
    const first = cycles.create(USER_A, {
      title: 'One',
      start_date: '2026-08-31',
    });
    const second = cycles.create(USER_A, {
      title: 'Two',
      start_date: '2026-08-31',
    });
    cycles.activate(USER_A, first.id);
    expect(cycles.get(USER_A, first.id).status).toBe('active');
    cycles.activate(USER_A, second.id);
    expect(cycles.get(USER_A, first.id).status).toBe('planned');
    expect(cycles.get(USER_A, second.id).status).toBe('active');
    expect(cycles.getActive(USER_A)?.id).toBe(second.id);
  });

  it('rejects status=active via PUT', () => {
    const cycles = setup();
    const cycle = cycles.create(USER_A, {
      title: 'One',
      start_date: '2026-08-31',
    });
    expect(() => cycles.update(USER_A, cycle.id, { status: 'active' })).toThrow(
      /activate/,
    );
  });

  it('rejects unknown fields with 422', () => {
    const cycles = setup();
    expect(() =>
      cycles.create(USER_A, {
        title: 'X',
        start_date: '2026-08-31',
        nope: 1,
      } as never),
    ).toThrow(/unprocessable|Unknown/i);
  });

  it('removes with cascade', () => {
    const cycles = setup();
    const cycle = cycles.create(USER_A, {
      title: 'Gone',
      start_date: '2026-08-31',
    });
    expect(cycles.remove(USER_A, cycle.id)).toEqual({ ok: true });
    expect(() => cycles.get(USER_A, cycle.id)).toThrow(/404|not_found/i);
    const db = (cycles as unknown as { database: DatabaseService }).database
      .sqlite;
    const weeks = db
      .prepare('select * from cycle_weeks where cycle_id = ?')
      .all(cycle.id) as unknown[];
    expect(weeks).toHaveLength(0);
  });

  it('returns null when no active cycle exists', () => {
    expect(setup().getActive(USER_A)).toBeNull();
  });

  it('isolates cycles per user (controller: GET/LIST/PUT/DELETE)', () => {
    const cycles = setup();
    const owned = cycles.create(USER_A, {
      title: 'Mine',
      start_date: '2026-08-31',
    });
    // other user sees nothing: empty list, 404 on direct access
    expect(cycles.list(USER_B, {}).total).toBe(0);
    expect(() => cycles.get(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() => cycles.update(USER_B, owned.id, { title: 'Hijack' })).toThrow(
      /404|not_found/i,
    );
    expect(() => cycles.remove(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() => cycles.activate(USER_B, owned.id)).toThrow(/404|not_found/i);
    // slugs are unique per user, not globally
    const sameSlug = cycles.create(USER_B, {
      title: 'Mine',
      start_date: '2026-08-31',
    });
    expect(sameSlug.slug).toBe('mine');
    // activation is per user
    cycles.activate(USER_A, owned.id);
    expect(cycles.getActive(USER_B)).toBeNull();
    expect(cycles.getActive(USER_A)?.id).toBe(owned.id);
  });
});
