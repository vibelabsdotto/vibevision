import { DatabaseService } from '../database/database.service';
import { newId, nowIso } from '../common/util';
import { SnapshotsService } from './snapshots.service';

let cycleSeq = 0;

function setup(): { database: DatabaseService; snapshots: SnapshotsService } {
  const database = new DatabaseService(':memory:');
  database.onModuleInit();
  return { database, snapshots: new SnapshotsService(database) };
}

function makeCycle(database: DatabaseService): string {
  cycleSeq += 1;
  const id = newId();
  const now = nowIso();
  database.sqlite
    .prepare(
      'insert into cycles (id, slug, title, vision, start_date, end_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
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
    const created = snapshots.create({
      cycle_id: cycleId,
      week_number: 3,
      snapshot_json: '{"score":0.8}',
    });
    expect(created.cycle_id).toBe(cycleId);
    expect(created.week_number).toBe(3);
    expect(created.snapshot_json).toBe('{"score":0.8}');
    expect(created.captured_at).toBeTruthy();
    expect(snapshots.get(created.id)).toMatchObject({ id: created.id });
  });

  it('updates partially and removes', () => {
    const { database, snapshots } = setup();
    const cycleId = makeCycle(database);
    const created = snapshots.create({
      cycle_id: cycleId,
      week_number: 1,
      snapshot_json: '{}',
    });
    const updated = snapshots.update(created.id, {
      snapshot_json: '{"v":2}',
      week_number: 2,
    });
    expect(updated.snapshot_json).toBe('{"v":2}');
    expect(updated.week_number).toBe(2);
    expect(snapshots.remove(created.id)).toEqual({ ok: true });
    expect(() => snapshots.get(created.id)).toThrow(/404|not_found/i);
  });

  it('lists newest first by default and filters by cycle', () => {
    const { database, snapshots } = setup();
    const first = makeCycle(database);
    const second = makeCycle(database);
    snapshots.create({ cycle_id: first, week_number: 1, snapshot_json: '{}' });
    snapshots.create({ cycle_id: second, week_number: 2, snapshot_json: '{}' });
    const all = snapshots.list({});
    expect(all.total).toBe(2);
    const filtered = snapshots.list({ cycle_id: first });
    expect(filtered.total).toBe(1);
    expect(filtered.snapshots[0]?.cycle_id).toBe(first);
  });

  it('404s on unknown id', () => {
    const { snapshots } = setup();
    expect(() => snapshots.get('missing')).toThrow(/404|not_found/i);
    expect(() => snapshots.update('missing', {})).toThrow(/404|not_found/i);
    expect(() => snapshots.remove('missing')).toThrow(/404|not_found/i);
  });

  it('rejects unknown fields with 422', () => {
    const { database, snapshots } = setup();
    const cycleId = makeCycle(database);
    expect(() =>
      snapshots.create({
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
      snapshots.create({ cycle_id: cycleId, week_number: 1 }),
    ).toThrow(/snapshot_json is required/);
    expect(() =>
      snapshots.create({
        cycle_id: cycleId,
        week_number: 0,
        snapshot_json: '{}',
      }),
    ).toThrow(/week_number/);
    expect(() =>
      snapshots.create({ week_number: 1, snapshot_json: '{}' }),
    ).toThrow(/cycle_id/);
    expect(() =>
      snapshots.create({
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
      snapshots.create({
        cycle_id: cycleId,
        week_number: 1,
        snapshot_json: `{"d":"${'x'.repeat(2 * 1024 * 1024)}"}`,
      }),
    ).toThrow(/payload_too_large/);
  });
});
