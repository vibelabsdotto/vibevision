import { DatabaseService } from '../database/database.service';
import { newId, nowIso } from '../common/util';
import { EntriesService } from '../entries/entries.service';
import { DailyLogsService } from './daily-logs.service';

let cycleSeq = 0;

function setup(): { database: DatabaseService; logs: DailyLogsService } {
  const database = new DatabaseService(':memory:');
  database.onModuleInit();
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
      'insert into cycles (id, slug, title, vision, start_date, end_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
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
    const created = logs.create({
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
    const fetched = logs.get(created.id);
    expect(fetched).toMatchObject({ id: created.id, date: '2026-09-06' });
  });

  it('returns a single entry or null for ?cycle_id=&date=', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    expect(logs.getByCycleAndDate(cycleId, '2026-09-06')).toBeNull();
    logs.create({ cycle_id: cycleId, date: '2026-09-06' });
    expect(logs.getByCycleAndDate(cycleId, '2026-09-06')?.date).toBe(
      '2026-09-06',
    );
  });

  it('upserts on the same id for cycle+date', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    const first = logs.upsert({
      cycle_id: cycleId,
      date: '2026-09-06',
      one_thing: 'Morning plan',
    });
    const second = logs.upsert({
      cycle_id: cycleId,
      date: '2026-09-06',
      agency_score: 8,
      evening_done: true,
    });
    expect(second.id).toBe(first.id);
    expect(second.one_thing).toBe('Morning plan');
    expect(second.agency_score).toBe(8);
    expect(second.evening_done).toBe(1);
    expect(logs.list({}).total).toBe(1);
  });

  it('updates partially and removes', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    const created = logs.create({ cycle_id: cycleId, date: '2026-09-06' });
    const updated = logs.update(created.id, {
      notes: 'edited',
      deep_work_minutes: 90,
    });
    expect(updated.notes).toBe('edited');
    expect(updated.deep_work_minutes).toBe(90);
    expect(updated.date).toBe('2026-09-06');
    expect(logs.remove(created.id)).toEqual({ ok: true });
    expect(() => logs.get(created.id)).toThrow(/404|not_found/i);
  });

  it('lists sorted by date desc', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    logs.create({ cycle_id: cycleId, date: '2026-09-01' });
    logs.create({ cycle_id: cycleId, date: '2026-09-06' });
    const list = logs.list({});
    expect(list.total).toBe(2);
    expect(list.daily_logs.map((l) => l.date)).toEqual([
      '2026-09-06',
      '2026-09-01',
    ]);
  });

  it('conflicts on duplicate POST', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    logs.create({ cycle_id: cycleId, date: '2026-09-06' });
    expect(() =>
      logs.create({ cycle_id: cycleId, date: '2026-09-06' }),
    ).toThrow(/409|conflict/i);
  });

  it('404s on unknown id', () => {
    const { logs } = setup();
    expect(() => logs.get('missing')).toThrow(/404|not_found/i);
    expect(() => logs.update('missing', {})).toThrow(/404|not_found/i);
    expect(() => logs.remove('missing')).toThrow(/404|not_found/i);
  });

  it('rejects unknown fields with 422', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    expect(() =>
      logs.create({ cycle_id: cycleId, date: '2026-09-06', nope: 1 } as never),
    ).toThrow(/unprocessable/i);
  });

  it('rejects bad dates, missing/unknown cycles and bad ints', () => {
    const { database, logs } = setup();
    const cycleId = makeCycle(database);
    expect(() =>
      logs.create({ cycle_id: cycleId, date: '09/06/2026' }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() => logs.create({ date: '2026-09-06' })).toThrow(/cycle_id/);
    expect(() => logs.create({ cycle_id: 'nope', date: '2026-09-06' })).toThrow(
      /cycle not found/,
    );
    expect(() =>
      logs.create({ cycle_id: cycleId, date: '2026-09-06', stress_level: 2.5 }),
    ).toThrow(/integer/);
    expect(() =>
      logs.create({
        cycle_id: cycleId,
        date: '2026-09-06',
        notes: 'x'.repeat(10_001),
      }),
    ).toThrow(/at most 10000/);
  });
});
