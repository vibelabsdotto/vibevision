import { DatabaseService } from '../database/database.service';
import { newId, nowIso } from '../common/util';
import { EntriesService } from '../entries/entries.service';
import { DailyLogsService } from './daily-logs.service';

const USER_A = 'user-a';
const USER_B = 'user-b';

let cycleSeq = 0;

function setup(): { database: DatabaseService; logs: DailyLogsService } {
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
  return {
    database,
    logs: new DailyLogsService(database, new EntriesService(database)),
  };
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
      `daily-log-cycle-${cycleSeq}`,
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

describe('DailyLogsService', () => {
  it('creates and gets a log by id', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    const created = logs.create(USER_A, {
      cycle_id: cycleId,
      date: '2026-09-06',
      one_thing: 'Ship it',
      stress_level: 3,
      agency_score: null,
    });
    expect(created.cycle_id).toBe(cycleId);
    expect(created.date).toBe('2026-09-06');
    expect(created.one_thing).toBe('Ship it');
    expect(created.stress_level).toBe(3);
    expect(created.agency_score).toBeNull();
    expect(created.morning_done).toBe(0);
    const fetched = logs.get(USER_A, created.id);
    expect(fetched).toMatchObject({ id: created.id, date: '2026-09-06' });
  });

  it('returns a single entry or null for ?cycle_id=&date=', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    expect(logs.getByCycleAndDate(USER_A, cycleId, '2026-09-06')).toBeNull();
    logs.create(USER_A, { cycle_id: cycleId, date: '2026-09-06' });
    expect(
      logs.getByCycleAndDate(USER_A, cycleId, '2026-09-06')?.date,
    ).toBe('2026-09-06');
  });

  it('upserts on the same id for cycle+date', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    const first = logs.upsert(USER_A, {
      cycle_id: cycleId,
      date: '2026-09-06',
      one_thing: 'Morning plan',
    });
    const second = logs.upsert(USER_A, {
      cycle_id: cycleId,
      date: '2026-09-06',
      agency_score: 8,
      evening_done: true,
    });
    expect(second.id).toBe(first.id);
    expect(second.one_thing).toBe('Morning plan');
    expect(second.agency_score).toBe(8);
    expect(second.evening_done).toBe(1);
    expect(logs.list(USER_A, {}).total).toBe(1);
  });

  it('updates partially and removes', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    const created = logs.create(USER_A, { cycle_id: cycleId, date: '2026-09-06' });
    const updated = logs.update(USER_A, created.id, {
      notes: 'edited',
      deep_work_minutes: 90,
    });
    expect(updated.notes).toBe('edited');
    expect(updated.deep_work_minutes).toBe(90);
    expect(updated.date).toBe('2026-09-06');
    expect(logs.remove(USER_A, created.id)).toEqual({ ok: true });
    expect(() => logs.get(USER_A, created.id)).toThrow(/404|not_found/i);
  });

  it('lists sorted by date desc', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    logs.create(USER_A, { cycle_id: cycleId, date: '2026-09-01' });
    logs.create(USER_A, { cycle_id: cycleId, date: '2026-09-06' });
    const list = logs.list(USER_A, {});
    expect(list.total).toBe(2);
    expect(list.daily_logs.map((l) => l.date)).toEqual([
      '2026-09-06',
      '2026-09-01',
    ]);
  });

  it('conflicts on duplicate POST', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    logs.create(USER_A, { cycle_id: cycleId, date: '2026-09-06' });
    expect(() =>
      logs.create(USER_A, { cycle_id: cycleId, date: '2026-09-06' }),
    ).toThrow(/409|conflict/i);
  });

  it('404s on unknown id', () => {
    const { logs } = setup();
    expect(() => logs.get(USER_A, 'missing')).toThrow(/404|not_found/i);
    expect(() => logs.update(USER_A, 'missing', {})).toThrow(/404|not_found/i);
    expect(() => logs.remove(USER_A, 'missing')).toThrow(/404|not_found/i);
  });

  it('rejects unknown fields with 422', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    expect(() =>
      logs.create(USER_A, {
        cycle_id: cycleId,
        date: '2026-09-06',
        nope: 1,
      } as never),
    ).toThrow(/unprocessable/i);
  });

  it('rejects bad dates, missing/unknown cycles and bad ints', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    expect(() =>
      logs.create(USER_A, { cycle_id: cycleId, date: '09/06/2026' }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() => logs.create(USER_A, { date: '2026-09-06' })).toThrow(
      /cycle_id/,
    );
    expect(() =>
      logs.create(USER_A, { cycle_id: 'nope', date: '2026-09-06' }),
    ).toThrow(/cycle not found/);
    expect(() =>
      logs.create(USER_A, {
        cycle_id: cycleId,
        date: '2026-09-06',
        stress_level: 2.5,
      }),
    ).toThrow(/integer/);
    expect(() =>
      logs.create(USER_A, {
        cycle_id: cycleId,
        date: '2026-09-06',
        notes: 'x'.repeat(10_001),
      }),
    ).toThrow(/at most 10000/);
  });

  it('isolates daily logs per user (controller: GET/LIST/PUT/DELETE/checkin)', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    const owned = logs.create(USER_A, { cycle_id: cycleId, date: '2026-09-06' });
    expect(logs.list(USER_B, {}).total).toBe(0);
    expect(() => logs.get(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(
      logs.getByCycleAndDate(USER_B, cycleId, '2026-09-06'),
    ).toBeNull();
    expect(() => logs.update(USER_B, owned.id, { notes: 'x' })).toThrow(
      /404|not_found/i,
    );
    expect(() => logs.remove(USER_B, owned.id)).toThrow(/404|not_found/i);
    expect(() =>
      logs.create(USER_B, { cycle_id: cycleId, date: '2026-09-06' }),
    ).toThrow(/cycle not found/);
  });
});
