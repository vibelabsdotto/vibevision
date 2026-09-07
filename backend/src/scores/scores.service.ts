import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, nowIso, str, toBool } from '../common/util';
import { DatabaseService } from '../database/database.service';
import { isTacticActiveInWeek } from '../tactics/plan';
import {
  goalScoresFromTacticScores,
  scoreTacticsForWeek,
  statusFromScore,
  weekScoreFromTacticScores,
} from '../scoring/week';
import type {
  ScoreBlockRow,
  ScoreEntry,
  ScoreScheduleRow,
  ScoreTacticRow,
  WeekScore,
} from '../scoring/types';

/** Current week number for a cycle+date (null when outside the cycle). */
export function currentWeekNumber(
  weeks: Array<{ week_number: number; start_date: string; end_date: string }>,
  date: string,
): number | null {
  const week = weeks.find((w) => w.start_date <= date && w.end_date >= date);
  return week ? week.week_number : null;
}

export interface WeekSnapshotDoc {
  version: 1;
  cycle_id: string;
  week_number: number;
  week: { start_date: string; end_date: string; label: string } | null;
  captured_at: string;
  goals: Array<{
    id: string;
    title: string;
    description: string;
    sort_order: number;
    status: string;
  }>;
  lag_indicators: Array<{
    id: string;
    goal_id: string;
    title: string;
    type: string;
    target_value: number;
    current_value: number;
    unit: string;
    achieved: boolean;
    sort_order: number;
  }>;
  tactics: Array<{
    id: string;
    goal_id: string;
    title: string;
    type: string;
    tracking_type: string;
    recurrence_type: string;
    recurrence_count: number;
    target_value: number;
    unit: string;
    execution_style: string | null;
    target_per_week: number | null;
    target_per_day: number | null;
    scoring_weight: number;
    starts_week: number | null;
    ends_week: number | null;
    active: boolean;
    sort_order: number;
  }>;
  tactic_schedules: ScoreScheduleRow[];
  tactic_calendar_blocks: Array<{
    id: string;
    tactic_id: string;
    week_number: number;
    date: string;
    start_time: string | null;
    end_time: string | null;
    duration_minutes: number | null;
    planned_value: number;
    note: string | null;
  }>;
}

@Injectable()
export class ScoresService {
  constructor(private readonly database: DatabaseService) {}

  weeksOf(cycleId: string, userId: string): Array<{
    id: string;
    week_number: number;
    start_date: string;
    end_date: string;
    label: string;
  }> {
    return this.database.sqlite
      .prepare(
        'select id, week_number, start_date, end_date, label from cycle_weeks where cycle_id = ? and user_id = ? order by week_number asc',
      )
      .all(cycleId, userId) as Array<{
      id: string;
      week_number: number;
      start_date: string;
      end_date: string;
      label: string;
    }>;
  }

  currentWeek(cycleId: string, userId: string, date: string): number | null {
    return currentWeekNumber(this.weeksOf(cycleId, userId), date);
  }

  tacticRows(cycleId: string, userId: string): ScoreTacticRow[] {
    const rows = this.database.sqlite
      .prepare(
        `select t.*, g.title as goal_title, g.sort_order as goal_sort
         from tactics t join goals g on g.id = t.goal_id
         where g.cycle_id = ? and g.user_id = ? and t.user_id = ? order by g.sort_order asc, t.sort_order asc, t.id asc`,
      )
      .all(cycleId, userId, userId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      tactic: {
        id: String(row.id),
        goal_id: String(row.goal_id),
        title: String(row.title),
        type: String(row.type),
        tracking_type: String(row.tracking_type),
        recurrence_type: String(row.recurrence_type),
        execution_style: str(row.execution_style) || null,
        recurrence_count: Number(row.recurrence_count),
        target_value: Number(row.target_value),
        target_per_week: (row.target_per_week as number) ?? null,
        target_per_day: (row.target_per_day as number) ?? null,
        unit: String(row.unit),
        scoring_weight: Number(row.scoring_weight),
        starts_week: (row.starts_week as number) ?? null,
        ends_week: (row.ends_week as number) ?? null,
        active: toBool(row.active),
        sort_order: Number(row.sort_order),
      },
      goal_title: str(row.goal_title) || 'Unknown goal',
    }));
  }

  scheduleRows(userId: string, weekNumber?: number): ScoreScheduleRow[] {
    const rows = (
      weekNumber === undefined
        ? this.database.sqlite
            .prepare(
              'select tactic_id, week_number, planned_target, required from tactic_schedules where user_id = ?',
            )
            .all(userId)
        : this.database.sqlite
            .prepare(
              'select tactic_id, week_number, planned_target, required from tactic_schedules where week_number = ? and user_id = ?',
            )
            .all(weekNumber, userId)
    ) as Array<{
      tactic_id: string;
      week_number: number;
      planned_target: number | null;
      required: number;
    }>;
    return rows.map((row) => ({
      tactic_id: String(row.tactic_id),
      week_number: Number(row.week_number),
      planned_target: row.planned_target ?? null,
      required: toBool(row.required),
    }));
  }

  blockRows(cycleId: string, userId: string, weekNumber: number): ScoreBlockRow[] {
    const rows = this.database.sqlite
      .prepare(
        'select tactic_id, date, planned_value from tactic_calendar_blocks where cycle_id = ? and user_id = ? and week_number = ? order by date asc',
      )
      .all(cycleId, userId, weekNumber) as Array<{
      tactic_id: string;
      date: string;
      planned_value: number;
    }>;
    return rows.map((row) => ({
      tactic_id: String(row.tactic_id),
      date: str(row.date),
      planned_value: Number(row.planned_value),
    }));
  }

  entryValues(cycleId: string, userId: string, weekNumber?: number): ScoreEntry[] {
    const rows = (
      weekNumber === undefined
        ? this.database.sqlite
            .prepare(
              'select tactic_id, date, value, completed from tactic_entries where cycle_id = ? and user_id = ?',
            )
            .all(cycleId, userId)
        : this.database.sqlite
            .prepare(
              'select tactic_id, date, value, completed from tactic_entries where cycle_id = ? and user_id = ? and week_number = ?',
            )
            .all(cycleId, userId, weekNumber)
    ) as Array<{
      tactic_id: string;
      date: string;
      value: number;
      completed: number;
    }>;
    return rows.map((row) => ({
      tactic_id: String(row.tactic_id),
      date: row.date ? str(row.date) : null,
      value: Number(row.value),
      completed: toBool(row.completed),
    }));
  }

  latestSnapshot(
    cycleId: string,
    userId: string,
    weekNumber: number,
  ): { id: string; snapshot: WeekSnapshotDoc } | null {
    const row = this.database.sqlite
      .prepare(
        'select id, snapshot_json from week_snapshots where cycle_id = ? and user_id = ? and week_number = ? order by created_at desc limit 1',
      )
      .get(cycleId, userId, weekNumber) as
      { id: string; snapshot_json: string } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      snapshot: JSON.parse(row.snapshot_json) as WeekSnapshotDoc,
    };
  }

  getWeekScore(
    userId: string,
    cycleId: string,
    weekNumber: number,
    options?: { as_of_date?: string; include_as_of_date?: boolean },
  ): WeekScore {
    const cycle = this.database.sqlite
      .prepare('select id from cycles where id = ? and user_id = ?')
      .get(cycleId, userId);
    if (!cycle) throw new NotFoundException('not_found');
    const weeks = this.weeksOf(cycleId, userId);
    const week = weeks.find((w) => w.week_number === weekNumber);
    if (!week) throw new NotFoundException('not_found');
    const asOfDate =
      options?.as_of_date ?? new Date().toISOString().slice(0, 10);

    const snapshot = this.latestSnapshot(cycleId, userId, weekNumber);
    let tacticRows: ScoreTacticRow[];
    let scheduleRows: ScoreScheduleRow[];
    let blocks: ScoreBlockRow[];
    if (snapshot) {
      const doc = snapshot.snapshot;
      tacticRows = doc.tactics.map((tactic) => ({
        tactic: { ...tactic },
        goal_title:
          doc.goals.find((goal) => goal.id === tactic.goal_id)?.title ??
          'Unknown goal',
      }));
      scheduleRows = doc.tactic_schedules;
      blocks = doc.tactic_calendar_blocks.map((block) => ({
        tactic_id: block.tactic_id,
        date: block.date,
        planned_value: block.planned_value,
      }));
    } else {
      tacticRows = this.tacticRows(cycleId, userId);
      scheduleRows = this.scheduleRows(userId, weekNumber);
      blocks = this.blockRows(cycleId, userId, weekNumber);
    }
    const entries = this.entryValues(cycleId, userId, weekNumber);
    const scores = scoreTacticsForWeek({
      week_number: weekNumber,
      as_of_date: asOfDate,
      include_as_of_date: options?.include_as_of_date,
      tactic_rows: tacticRows,
      schedule_rows: scheduleRows,
      calendar_blocks: blocks,
      entries,
      week_start_date: snapshot?.snapshot.week?.start_date ?? week.start_date,
      week_end_date: snapshot?.snapshot.week?.end_date ?? week.end_date,
      has_snapshot: Boolean(snapshot),
    });
    return weekScoreFromTacticScores(cycleId, weekNumber, scores);
  }

  getOverallScore(
    userId: string,
    cycleId: string,
    currentWeek: number,
  ): { score: number; status: string; weeks_scored: number } {
    const cycle = this.database.sqlite
      .prepare('select id from cycles where id = ? and user_id = ?')
      .get(cycleId, userId);
    if (!cycle) throw new NotFoundException('not_found');
    const weeks = this.weeksOf(cycleId, userId).filter(
      (week) => week.week_number <= currentWeek,
    );
    if (weeks.length === 0) {
      return { score: 0, status: 'off_track', weeks_scored: 0 };
    }
    const asOfDate = new Date().toISOString().slice(0, 10);
    const tacticRows = this.tacticRows(cycleId, userId);
    const scheduleRows = this.scheduleRows(userId);
    // regroup entries per week via their stored week_number
    const rawEntries = this.database.sqlite
      .prepare(
        'select tactic_id, date, value, completed, week_number from tactic_entries where cycle_id = ? and user_id = ?',
      )
      .all(cycleId, userId) as Array<{
      tactic_id: string;
      date: string;
      value: number;
      completed: number;
      week_number: number;
    }>;
    const perWeek = new Map<number, ScoreEntry[]>();
    for (const row of rawEntries) {
      const list = perWeek.get(row.week_number) ?? [];
      list.push({
        tactic_id: row.tactic_id,
        date: row.date ?? null,
        value: row.value,
        completed: toBool(row.completed),
      });
      perWeek.set(row.week_number, list);
    }
    let total = 0;
    for (const week of weeks) {
      const scores = scoreTacticsForWeek({
        week_number: week.week_number,
        as_of_date: asOfDate,
        tactic_rows: tacticRows.map((tactic) => ({
          tactic: tactic.tactic,
          goal_title: 'Overall',
        })),
        schedule_rows: scheduleRows,
        calendar_blocks: [],
        entries: perWeek.get(week.week_number) ?? [],
        week_start_date: week.start_date,
        week_end_date: week.end_date,
        has_snapshot: false,
      });
      total +=
        scores.length > 0
          ? scores.reduce((sum, score) => sum + score.score, 0) / scores.length
          : 0;
    }
    const score = total / weeks.length;
    return {
      score,
      status: statusFromScore(score),
      weeks_scored: weeks.length,
    };
  }

  /** Freeze the current week state into a snapshot row (port of captureWeekSnapshot). */
  captureSnapshot(
    userId: string,
    cycleId: string,
    weekNumber: number,
  ): { id: string; snapshot: WeekSnapshotDoc } {
    const cycle = this.database.sqlite
      .prepare('select id from cycles where id = ? and user_id = ?')
      .get(cycleId, userId);
    if (!cycle) throw new NotFoundException('not_found');
    const weeks = this.weeksOf(cycleId, userId);
    const week = weeks.find((w) => w.week_number === weekNumber);
    if (!week)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'week not found for cycle',
      });

    const goalRows = this.database.sqlite
      .prepare(
        'select id, title, description, sort_order, status from goals where cycle_id = ? and user_id = ? order by sort_order asc',
      )
      .all(cycleId, userId) as Array<{
      id: string;
      title: string;
      description: string;
      sort_order: number;
      status: string;
    }>;
    const lagRows = this.database.sqlite
      .prepare(
        `select l.id, l.goal_id, l.title, l.type, l.target_value, l.current_value, l.unit, l.achieved, l.sort_order
         from lag_indicators l join goals g on g.id = l.goal_id where g.cycle_id = ? and g.user_id = ? and l.user_id = ?`,
      )
      .all(cycleId, userId, userId) as Array<{
      id: string;
      goal_id: string;
      title: string;
      type: string;
      target_value: number;
      current_value: number;
      unit: string;
      achieved: number;
      sort_order: number;
    }>;
    const tacticRows = this.tacticRows(cycleId, userId);
    const scheduleRows = this.scheduleRows(userId, weekNumber);
    const blockRows = this.database.sqlite
      .prepare(
        'select id, tactic_id, week_number, date, start_time, end_time, duration_minutes, planned_value, note from tactic_calendar_blocks where cycle_id = ? and user_id = ? and week_number = ?',
      )
      .all(cycleId, userId, weekNumber) as Array<{
      id: string;
      tactic_id: string;
      week_number: number;
      date: string;
      start_time: string | null;
      end_time: string | null;
      duration_minutes: number | null;
      planned_value: number;
      note: string | null;
    }>;

    const activeTactics = tacticRows
      .map((row) => row.tactic)
      .filter((tactic) =>
        isTacticActiveInWeek(
          {
            starts_week: tactic.starts_week,
            ends_week: tactic.ends_week,
            active: tactic.active,
          },
          weekNumber,
          scheduleRows.find((schedule) => schedule.tactic_id === tactic.id) ??
            null,
        ),
      );
    const activeTacticIds = new Set(activeTactics.map((tactic) => tactic.id));
    const activeGoalIds = new Set(
      activeTactics.map((tactic) => tactic.goal_id),
    );
    for (const lag of lagRows) activeGoalIds.add(lag.goal_id);

    const capturedAt = nowIso();
    const snapshot: WeekSnapshotDoc = {
      version: 1,
      cycle_id: cycleId,
      week_number: weekNumber,
      week: {
        start_date: week.start_date,
        end_date: week.end_date,
        label: week.label,
      },
      captured_at: capturedAt,
      goals: goalRows
        .filter((goal) => activeGoalIds.has(goal.id))
        .map((goal) => ({
          id: goal.id,
          title: goal.title,
          description: goal.description,
          sort_order: goal.sort_order,
          status: goal.status,
        })),
      lag_indicators: lagRows
        .filter((lag) => activeGoalIds.has(lag.goal_id))
        .map((lag) => ({
          id: lag.id,
          goal_id: lag.goal_id,
          title: lag.title,
          type: lag.type,
          target_value: lag.target_value,
          current_value: lag.current_value,
          unit: lag.unit,
          achieved: toBool(lag.achieved),
          sort_order: lag.sort_order,
        })),
      tactics: activeTactics.map((tactic) => ({ ...tactic })),
      tactic_schedules: scheduleRows.filter((schedule) =>
        activeTacticIds.has(schedule.tactic_id),
      ),
      tactic_calendar_blocks: blockRows
        .filter((block) => activeTacticIds.has(block.tactic_id))
        .map((block) => ({
          id: block.id,
          tactic_id: block.tactic_id,
          week_number: block.week_number,
          date: block.date,
          start_time: block.start_time,
          end_time: block.end_time,
          duration_minutes: block.duration_minutes,
          planned_value: Number(block.planned_value) || 1,
          note: block.note,
        })),
    };
    const json = JSON.stringify(snapshot);
    if (json.length > 2_000_000) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'snapshot exceeds 2 MB',
      });
    }
    const id = newId();
    this.database.sqlite
      .prepare(
        'insert into week_snapshots (id, user_id, cycle_id, week_number, snapshot_json, captured_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, userId, cycleId, weekNumber, json, capturedAt, capturedAt, capturedAt);
    return { id, snapshot };
  }

  goalScores(userId: string, cycleId: string, weekNumber: number) {
    return goalScoresFromTacticScores(
      this.getWeekScore(userId, cycleId, weekNumber).tactic_scores,
    );
  }

  /**
   * Score several weeks without calendar-block precision (weeks overview):
   * full weekly plan per week, like the core batch variant.
   */
  getWeekScoresBatch(
    userId: string,
    cycleId: string,
    weekNumbers: number[],
  ): WeekScore[] {
    const cycle = this.database.sqlite
      .prepare('select id from cycles where id = ? and user_id = ?')
      .get(cycleId, userId);
    if (!cycle) throw new NotFoundException('not_found');
    const asOfDate = new Date().toISOString().slice(0, 10);
    const tacticRows = this.tacticRows(cycleId, userId);
    const scheduleRows = this.scheduleRows(userId);
    const rawEntries = this.database.sqlite
      .prepare(
        'select tactic_id, date, value, completed, week_number from tactic_entries where cycle_id = ? and user_id = ?',
      )
      .all(cycleId, userId) as Array<{
      tactic_id: string;
      date: string;
      value: number;
      completed: number;
      week_number: number;
    }>;
    const perWeek = new Map<number, ScoreEntry[]>();
    for (const row of rawEntries) {
      const list = perWeek.get(row.week_number) ?? [];
      list.push({
        tactic_id: row.tactic_id,
        date: row.date ?? null,
        value: row.value,
        completed: toBool(row.completed),
      });
      perWeek.set(row.week_number, list);
    }
    return weekNumbers.map((weekNumber) =>
      weekScoreFromTacticScores(
        cycleId,
        weekNumber,
        scoreTacticsForWeek({
          week_number: weekNumber,
          as_of_date: asOfDate,
          tactic_rows: tacticRows,
          schedule_rows: scheduleRows,
          calendar_blocks: [],
          entries: perWeek.get(weekNumber) ?? [],
          week_start_date: null,
          week_end_date: null,
          has_snapshot: false,
        }),
      ),
    );
  }
}
