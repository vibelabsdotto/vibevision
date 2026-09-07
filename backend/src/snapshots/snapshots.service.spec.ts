import { DatabaseService } from '../database/database.service';
import { newId, nowIso } from '../common/util';
import { SnapshotsService } from './snapshots.service';

const USER_A = 'user-a';
const USER_B = 'user-b';

let cycleSeq = 0;

function setup(): { database: DatabaseService; snapshots: SnapshotsService } {
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
  return { database, snapshots: new SnapshotsService(database) };
}

function makeCycle(database: DatabaseService): string {
  cycleSeq += 1;
  const id = newId();
  const now = nowIso();
  database.sqlite
    .prepare(
      'insert into cycles (id, user_id, slug, title, vision, start_date, end_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      USER_A,
      `snapshot-cycle-${cycleSeq}`,
      `Cycle ${cycleSeq}`,
      '',
      '2026-08-31',
      '2026-11-22',
      'planned',
      now,
      now,
    );
  return id;
}

describe('SnapshotsService', () => {
  it('creates and gets a snapshot', () => {
    const { database, snapshots } = setup();
    const cycleId = makeCycle(database);
    const created = snapshots.create(USER_A, {
      cycle_id: cycleId,
      week_number: 3,
      snapshot_json: '{"score":0.8}',
    });
    expect(created.cycle_id).toBe(cycleId);
    expect(created.week_number).toBe(3);
    expect(created.snapshot_json).toBe('{"score":0.8}');
    expect(created.captured_at).toBeTruthy();
    expect(snapshots.get(USER_A, created.id)).toMatchObject({ id: created.id });
  });

  it('updates partially and removes', () => {
    const { database, snapshots } = setup();
    const cycleId = makeCycle(database);
    const created = snapshots.create(USER_A, {
      cycle_id: cycleId,
      week_number: 1,
      snapshot_json: '{}',
    });
    const updated = snapshots.update(USER_A, created.id, {
      snapshot_json: '{"v":2}',
      week_number: 2,
    });
    expect(updated.snapshot_json).toBe('{"v":2}');
    expect(updated.week_number).toBe(2);
    expect(snapshots.remove(USER_A, created.id)).toEqual({ ok: true });
    expect(() => snapshots.get(USER_A, created.id)).toThrow(/404|not_found/i);
  });

  it('lists newest first by default and filters by cycle', () => {
    const { database, snapshots } = setup();
    const first = makeCycle(database);
    const second = makeCycle(database);
    snapshots.create(USER_A, { cycle_id: first, week_number: 1, snapshot_json: '{}' });
    snapshots.create(USER_A, { cycle_id: second, week_number: 2, snapshot_json: '{}' });
    const all = snapshots.list(USER_A, {});
    expect(all.total).toBe(2);
    const filtered = snapshots.list(USER_A, { cycle_id: first });
    expect(filtered.total).toBe(1);
    expect(filtered.snapshots[0]?.cycle_id).toBe(first);
  });

  it('404s on unknown id', () => {
    const { snapshots } = setup();
    expect(() => snapshots.get(USER_A, 'missing')).toThrow(/404|not_found/i);
    expect(() => snapshots.update(USER_A, 'missing', {})).toThrow(
      /404|not_found/i,
    );
    expect(() => snapshots.remove(USER_A, 'missing')).toThrow(/404|not_found/i);
  });

  it('rejects unknown fields with 422', () => {
    const { database, snapshots } = setup();
    const cycleId = makeCycle(database);
    expect(() =>
      snapshots.create(USER_A, {
        cycle_id: cycleId,
        week_number: 1,
        snapshot_json: '{}',
        nope: 1,
      } as never),
    ).toThrow(/unprocessable/i);
  });

  it('rejects missing/invalid input with 400', () => {
    const { database, snapshots } = setup();
    const cycleId = makeCycle(database);
    expect(() =>
      snapshots.create(USER_A, { cycle_id: cycleId, week_number: 1 }),
    ).toThrow(/snapshot_json is required/);
    expect(() =>
      snapshots.create(USER_A, {
        cycle_id: cycleId,
        week_number: 0,
        snapshot_json: '{}',
      }),
    ).toThrow(/week_number/);
    expect(() =>
      snapshots.create(USER_A, { week_number: 1, snapshot_json: '{}' }),
    ).toThrow(/cycle_id/);
    expect(() =>
      snapshots.create(USER_A, {
        cycle_id: 'missing',
        week_number: 1,
        snapshot_json: '{}',
      }),
    ).toThrow(/cycle not found/);
  });

  it('rejects oversized snapshot_json with 413', () => {
    const { database, snapshots } = setup();
    const cycleId = makeCycle(database);
    expect(() =>
      snapshots.create(USER_A, {
        cycle_id: cycleId,
        week_number: 1,
        snapshot_json: `{"d":"${'x'.repeat(2 * 1024 * 1024)}"}`,
      }),
    ).toThrow(/payload_too_large/);
  });

  it('isolates snapshots per user (controller: GET/LIST/PUT/DELETE)', () => {
    const { database, snapshots } = setup();
    const cycleId = makeCycle(database);
    const owned = snapshots.create(USER_A, {
      cycle_id: cycleId,
      week_number: 1,
      snapshot_json: '{}',
    });
    expect(snapshots.list(USER_B, {}).total).toBe(0);
    expect(() => snapshots.get(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() => snapshots.update(USER_B, owned.id, { week_number: 2 })).toThrow(
      /404|not_found/i,
    );
    expect(() => snapshots.remove(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() =>
      snapshots.create(USER_B, {
        cycle_id: cycleId,
        week_number: 2,
        snapshot_json: '{}',
      }),
    ).toThrow(/cycle not found/);
  });
});
