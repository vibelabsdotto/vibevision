import { CalendarBlocksService } from '../calendar-blocks/calendar-blocks.service';
import { CyclesService } from '../cycles/cycles.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { DatabaseService } from '../database/database.service';
import { EntriesService } from '../entries/entries.service';
import { GoalsService } from '../goals/goals.service';
import { ScoresService } from '../scores/scores.service';
import { SettingsService } from '../settings/settings.service';
import { TacticsService } from '../tactics/tactics.service';
import { CalendarService } from './calendar.service';

const USER = 'rollover-user';
const MONDAY = '2026-09-07';
const TUESDAY = '2026-09-08';
const WEDNESDAY = '2026-09-09';
const SUNDAY = '2026-09-13';

let db: DatabaseService;
let calendar: CalendarService;
let blocks: CalendarBlocksService;
let entries: EntriesService;
let tactics: TacticsService;
let scores: ScoresService;
let dashboard: DashboardService;
let cycleId: string;
let tacticId: string;
let goalId: string;

function at(date: string) {
  jest.setSystemTime(new Date(`${date}T12:00:00.000Z`));
}

function view(from = MONDAY, to = SUNDAY) {
  return calendar.getCalendar(USER, cycleId, from, to);
}

function addBlock(date: string, value: number, id = tacticId) {
  return blocks.create(USER, { tactic_id: id, date, planned_value: value });
}

function log(date: string, value: number, id = tacticId) {
  return entries.create(USER, { tactic_id: id, date, value });
}

beforeEach(() => {
  jest.useFakeTimers();
  at(TUESDAY);
  db = new DatabaseService(':memory:');
  db.onModuleInit();
  for (const id of [USER, 'other-user']) {
    db.sqlite
      .prepare(
        'insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, 0, ?, ?)',
      )
      .run(id, id, `${id}@test.local`, Date.now(), Date.now());
  }
  const cycles = new CyclesService(db, new SettingsService(db));
  cycleId = cycles.create(USER, { title: 'Rollover', start_date: MONDAY }).id;
  cycles.activate(USER, cycleId);
  goalId = new GoalsService(db).create(USER, {
    cycle_id: cycleId,
    title: 'Work',
  }).id;
  tactics = new TacticsService(db);
  tacticId = tactics.create(USER, {
    goal_id: goalId,
    title: 'Write',
    tracking_type: 'quantity',
    recurrence_type: 'times_per_week',
    target_value: 10,
    unit: 'pages',
  }).id;
  calendar = new CalendarService(db);
  blocks = new CalendarBlocksService(db);
  entries = new EntriesService(db);
  scores = new ScoresService(db);
  dashboard = new DashboardService(db, scores);
});

afterEach(() => {
  db?.close();
  jest.useRealTimers();
});

describe('weekly scheduled tactic rollover', () => {
  it('rolls missed blocks to today, even after multiple missed days, without rewriting the plan', () => {
    const missed = addBlock(MONDAY, 3);
    const future = addBlock('2026-09-11', 2);
    expect(view().blocks.find((block) => block.id === missed.id)?.date).toBe(
      TUESDAY,
    );
    at(WEDNESDAY);
    expect(view().blocks.map((block) => [block.id, block.date])).toEqual([
      [missed.id, WEDNESDAY],
      [future.id, '2026-09-11'],
    ]);
    expect(view()).toEqual(view());
    expect(blocks.get(USER, missed.id).date).toBe(MONDAY);
    expect(
      view().scheduling.find((item) => item.id === tacticId),
    ).toMatchObject({
      scheduled: 5,
      remaining: 5,
    });
  });

  it('counts only unfinished volume in Today and in the focused logging target', () => {
    addBlock(MONDAY, 5);
    addBlock(TUESDAY, 2);
    log(MONDAY, 3);
    expect(tactics.todayState(USER, tacticId, TUESDAY)).toMatchObject({
      today_target: 4,
      today_actual: 0,
    });
    const today = dashboard.getDashboard(USER, cycleId, TUESDAY).dashboard!;
    expect(today.today_tactics[0]).toMatchObject({
      today_target: 4,
      today_remaining: 4,
      week_remaining: 7,
    });
    expect(
      today.today_scheduled_blocks.map((block) => block.planned_value),
    ).toEqual([2, 2]);
    log(TUESDAY, 1);
    expect(tactics.todayState(USER, tacticId, TUESDAY)).toMatchObject({
      today_target: 4,
      today_actual: 1,
    });
    at(WEDNESDAY);
    expect(tactics.todayState(USER, tacticId, WEDNESDAY).today_target).toBe(3);
  });

  it.each([
    ['volume', 'daily'],
    ['volume', 'weekdays'],
    ['occurrence', 'daily'],
    ['occurrence', 'weekdays'],
  ] as const)(
    'keeps an already credited %s/%s block complete instead of offering a rejected recurring target',
    (style, recurrence) => {
      const recurring = tactics.create(USER, {
        goal_id: goalId,
        title: 'Recurring work',
        tracking_type: 'quantity',
        execution_style: style,
        recurrence_type: recurrence,
        target_value: 1,
        unit: 'pages',
      });
      const block = addBlock(TUESDAY, 1, recurring.id);
      log(MONDAY, 1, recurring.id);

      expect(view().blocks.find((item) => item.id === block.id)).toMatchObject({
        date: TUESDAY,
        planned_value: 1,
        scheduled_value: 0,
      });
      expect(tactics.todayState(USER, recurring.id, TUESDAY)).toMatchObject({
        today_target: 0,
        today_actual: 0,
      });
      const today = dashboard.getDashboard(USER, cycleId, TUESDAY).dashboard!;
      expect(
        today.today_tactics.find((item) => item.tactic_id === recurring.id),
      ).toMatchObject({
        today_target: 0,
        today_remaining: 0,
        today_kind: 'scheduled',
        is_today_complete: true,
        due_today: false,
      });
      expect(today.today_summary).toMatchObject({
        completed_count: 1,
        remaining_count: 0,
        total_remaining: 0,
      });
      expect(() => log(TUESDAY, 1, recurring.id)).toThrow(
        /remain for this date/,
      );

      entries.undo(USER, recurring.id, MONDAY);
      expect(tactics.todayState(USER, recurring.id, TUESDAY).today_target).toBe(
        1,
      );
      expect(
        dashboard.getDashboard(USER, cycleId, TUESDAY).dashboard!
          .today_tactics[0],
      ).toMatchObject({
        today_target: 1,
        today_remaining: 1,
        is_today_complete: false,
        due_today: true,
      });
      expect(() => log(TUESDAY, 1, recurring.id)).not.toThrow();
      expect(tactics.todayState(USER, recurring.id, TUESDAY)).toMatchObject({
        today_target: 1,
        today_actual: 1,
      });
      expect(
        tactics.todayState(USER, recurring.id, WEDNESDAY).today_target,
      ).toBe(1);
    },
  );

  it('allows catching up with the API daily cap, then stops at the combined due amount', () => {
    addBlock(MONDAY, 3);
    addBlock(TUESDAY, 2);
    expect(() => log(TUESDAY, 5)).not.toThrow();
    expect(() => log(TUESDAY, 1)).toThrow(/remain for this date/);
    expect(
      dashboard.getDashboard(USER, cycleId, TUESDAY).dashboard!
        .today_tactics[0],
    ).toMatchObject({
      today_target: 5,
      today_actual: 5,
      is_today_complete: true,
    });
    at(WEDNESDAY);
    expect(view().blocks.every((block) => block.date === TUESDAY)).toBe(true);
    expect(
      dashboard.getDashboard(USER, cycleId, WEDNESDAY).dashboard!.today_tactics,
    ).toEqual([]);
  });

  it('does not move completed blocks or count a completed occurrence twice', () => {
    const occurrence = tactics.create(USER, {
      goal_id: goalId,
      title: 'Sessions',
      tracking_type: 'boolean',
      recurrence_type: 'times_per_week',
      recurrence_count: 3,
      target_value: 1,
      unit: 'sessions',
    });
    const done = addBlock(MONDAY, 1, occurrence.id);
    addBlock(TUESDAY, 1, occurrence.id);
    log(MONDAY, 1, occurrence.id);
    expect(view().blocks.find((block) => block.id === done.id)?.date).toBe(
      MONDAY,
    );
    at(WEDNESDAY);
    expect(
      tactics.todayState(USER, occurrence.id, WEDNESDAY).today_target,
    ).toBe(1);
    expect(() => log(WEDNESDAY, 1, occurrence.id)).not.toThrow();
  });

  it('rolls through Sunday but never carries a closed week into the next week or cycle', () => {
    addBlock(MONDAY, 3);
    at(SUNDAY);
    expect(view().blocks[0].date).toBe(SUNDAY);
    at('2026-09-14');
    expect(view('2026-09-14', '2026-09-20').blocks).toEqual([]);
    expect(
      tactics.todayState(USER, tacticId, '2026-09-14').today_target,
    ).toBeNull();
    expect(view().blocks[0].date).toBe(MONDAY);
    at('2026-12-01');
    expect(view('2026-11-30', '2026-12-06').blocks).toEqual([]);
  });

  it('loads earlier source blocks when only today is requested', () => {
    const block = addBlock(MONDAY, 3);
    expect(view(TUESDAY, TUESDAY).blocks).toEqual([
      expect.objectContaining({ id: block.id, date: TUESDAY }),
    ]);
  });

  it('reopens missed work after undo and ignores future-dated completions', () => {
    const block = addBlock(MONDAY, 1);
    log(MONDAY, 1);
    expect(view().blocks[0].date).toBe(MONDAY);
    entries.undo(USER, tacticId, MONDAY);
    expect(view().blocks[0].date).toBe(TUESDAY);
    log('2026-09-10', 1);
    expect(view().blocks.find((item) => item.id === block.id)?.date).toBe(
      TUESDAY,
    );
  });

  it('keeps original scoring pace, totals, and user isolation on calendar reads', () => {
    addBlock(MONDAY, 3);
    const before = scores.getWeekScore(USER, cycleId, 1, {
      as_of_date: TUESDAY,
    });
    expect(view().blocks[0].date).toBe(TUESDAY);
    const after = scores.getWeekScore(USER, cycleId, 1, {
      as_of_date: TUESDAY,
    });
    expect(after).toEqual(before);
    expect(() =>
      calendar.getCalendar('other-user', cycleId, MONDAY, SUNDAY),
    ).toThrow(/not_found/);
    expect(
      dashboard.getDashboard('other-user', cycleId, TUESDAY).dashboard,
    ).toBeNull();
  });

  it('keeps the full blocked weekly target when a schedule excludes the tactic from scoring', () => {
    addBlock(MONDAY, 5);
    log(MONDAY, 3);
    db.sqlite
      .prepare(
        'insert into tactic_schedules (id, user_id, tactic_id, week_number, planned_target, required, created_at, updated_at) values (?, ?, ?, 1, 5, 0, ?, ?)',
      )
      .run(
        'excluded',
        USER,
        tacticId,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    const today = dashboard.getDashboard(USER, cycleId, TUESDAY).dashboard!
      .today_tactics[0];
    expect(today).toMatchObject({
      week_target: 5,
      week_remaining: 2,
      today_target: 2,
    });
  });

  it('normalizes partial decimal carryover and excludes an entry being moved to a later day', () => {
    addBlock(MONDAY, 0.3);
    const entry = log(MONDAY, 0.1);
    expect(tactics.todayState(USER, tacticId, TUESDAY).today_target).toBe(0.2);
    expect(() =>
      entries.update(USER, entry.id, { date: TUESDAY, value: 0.3 }),
    ).not.toThrow();
    expect(tactics.todayState(USER, tacticId, TUESDAY)).toMatchObject({
      today_actual: 0.3,
      today_target: 0.3,
    });
    at(WEDNESDAY);
    expect(view().blocks[0].date).toBe(TUESDAY);
  });

  it('does not invent calendar blocks for unscheduled weekly pools or daily toggles', () => {
    tactics.create(USER, {
      goal_id: goalId,
      title: 'Daily habit',
      tracking_type: 'boolean',
      recurrence_type: 'daily',
      target_value: 1,
      unit: 'done',
    });
    expect(view().blocks).toEqual([]);
    expect(tactics.todayState(USER, tacticId, TUESDAY).today_target).toBeNull();
  });
});
