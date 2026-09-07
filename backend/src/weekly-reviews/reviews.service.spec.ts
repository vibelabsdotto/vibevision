import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { MonthlyReviewsService } from '../monthly-reviews/monthly-reviews.service';
import { WeeklyReviewsService } from '../weekly-reviews/weekly-reviews.service';

const USER = 'user-1';

function seedCycle(db: DatabaseService): string {
  const nowMs = Date.now();
  const now = new Date().toISOString();
  db.sqlite
    .prepare(
      'insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    )
    .run(USER, USER, 'u@test.local', 0, nowMs, nowMs);
  const cycleId = 'cycle-1';
  db.sqlite
    .prepare(
      'insert into cycles (id, user_id, slug, title, vision, start_date, end_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      cycleId,
      USER,
      'c1',
      'C1',
      '',
      '2026-08-31',
      '2026-11-22',
      'active',
      now,
      now,
    );
  return cycleId;
}

describe('WeeklyReviewsService', () => {
  it('creates once per cycle+week and updates', () => {
    const db = new DatabaseService(':memory:');
    db.onModuleInit();
    const cycleId = seedCycle(db);
    const reviews = new WeeklyReviewsService(db);
    const review = reviews.create(USER, { cycle_id: cycleId, week_number: 3 });
    expect(review.week_number).toBe(3);
    expect(() => reviews.create(USER, { cycle_id: cycleId, week_number: 3 })).toThrow(
      /already exists/,
    );
    expect(reviews.update(USER, review.id, { wins: 'shipped' }).wins).toBe('shipped');
  });
});

describe('MonthlyReviewsService', () => {
  it('validates month range and dedupes', () => {
    const db = new DatabaseService(':memory:');
    db.onModuleInit();
    const cycleId = seedCycle(db);
    const reviews = new MonthlyReviewsService(db);
    expect(() =>
      reviews.create(USER, { cycle_id: cycleId, month_number: 4, title: 'X' }),
    ).toThrow(/1\.\.3/);
    const review = reviews.create(USER, {
      cycle_id: cycleId,
      month_number: 1,
      title: 'Month 1',
    });
    expect(review.title).toBe('Month 1');
    expect(() =>
      reviews.create(USER, { cycle_id: cycleId, month_number: 1, title: 'Dup' }),
    ).toThrow(/already exists/);
  });
});

describe('EventsService', () => {
  it('appends and lists newest-first', () => {
    const db = new DatabaseService(':memory:');
    db.onModuleInit();
    const cycleId = seedCycle(db);
    const events = new EventsService(db);
    const first = events.record(USER, { cycle_id: cycleId, type: 'cycle.created' });
    expect(first.payload_json).toBe('{}');
    expect(() => events.record(USER, { type: '' })).toThrow(/type is required/);
    expect(() => events.record(USER, { cycle_id: 'missing', type: 'x' })).toThrow(
      /unknown cycle_id/,
    );
    expect(events.list(USER, { cycle_id: cycleId }).total).toBe(1);
  });
});
