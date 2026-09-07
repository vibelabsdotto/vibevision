import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isIsoDate, normalizeAmount, str, toBool } from '../common/util';
import { DatabaseService } from '../database/database.service';
import { currentWeekNumber } from '../scores/scores.service';
import {
  getPlannedWeeklyTarget,
  getSchedulingProgress,
  isTacticActiveInWeek,
  resolveExecutionStyle,
  resolveTacticPlan,
} from '../tactics/plan';

export interface CalendarBlockWithTitles {
  id: string;
  tactic_id: string;
  cycle_id: string;
  week_number: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  planned_value: number;
  note: string | null;
  tactic_title: string;
  goal_title: string;
  unit: string;
}

export interface SchedulingItem {
  id: string;
  title: string;
  goal_title: string;
  execution_style: string;
  base_week_target: number;
  week_targets: Record<number, number>;
  week_target: number;
  scheduled: number;
  remaining: number;
  scheduled_dates: string[];
  tracking_type: string;
  unit: string;
}

@Injectable()
export class CalendarService {
  constructor(private readonly database: DatabaseService) {}

  getCalendar(
    userId: string,
    cycleId: string,
    from: string,
    to: string,
  ): {
    blocks: CalendarBlockWithTitles[];
    scheduling: SchedulingItem[];
    current_week: number | null;
  } {
    const sqlite = this.database.sqlite;
    const cycle = sqlite
      .prepare('select id from cycles where id = ? and user_id = ?')
      .get(cycleId, userId);
    if (!cycle) throw new NotFoundException('not_found');
    if (!isIsoDate(from) || !isIsoDate(to)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'from/to must be YYYY-MM-DD',
      });
    }
    if (from > to) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'from must not exceed to',
      });
    }

    const blocks: CalendarBlockWithTitles[] = (
      sqlite
        .prepare(
          `select b.*, t.title as tactic_title, t.unit as unit, g.title as goal_title
           from tactic_calendar_blocks b
           left join tactics t on t.id = b.tactic_id
           left join goals g on g.id = t.goal_id
           where b.cycle_id = ? and b.user_id = ? and b.date >= ? and b.date <= ?
           order by b.date asc, b.start_time asc, b.id asc`,
        )
        .all(cycleId, userId, from, to) as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      tactic_id: String(row.tactic_id),
      cycle_id: String(row.cycle_id),
      week_number: Number(row.week_number),
      date: String(row.date),
      start_time: (row.start_time as string) ?? null,
      end_time: (row.end_time as string) ?? null,
      duration_minutes: (row.duration_minutes as number) ?? null,
      planned_value: Number(row.planned_value),
      note: (row.note as string) ?? null,
      tactic_title: str(row.tactic_title) || 'Unknown',
      goal_title: str(row.goal_title) || 'Unknown',
      unit: str(row.unit),
    }));

    const tacticRows = (
      sqlite
        .prepare(
          `select t.*, g.title as goal_title, g.sort_order as goal_sort
           from tactics t join goals g on g.id = t.goal_id
           where g.cycle_id = ? and g.user_id = ? and t.user_id = ? order by g.sort_order asc, t.sort_order asc, t.id asc`,
        )
        .all(cycleId, userId, userId) as Array<Record<string, unknown>>
    ).filter((row) => toBool(row.active));
    const schedules = sqlite
      .prepare(
        'select tactic_id, week_number, planned_target, required from tactic_schedules where user_id = ?',
      )
      .all(userId) as Array<{
      tactic_id: string;
      week_number: number;
      planned_target: number | null;
      required: number;
    }>;
    const weeks = sqlite
      .prepare(
        'select week_number, start_date, end_date from cycle_weeks where cycle_id = ? and user_id = ?',
      )
      .all(cycleId, userId) as Array<{
      week_number: number;
      start_date: string;
      end_date: string;
    }>;
    const referenceWeek = currentWeekNumber(weeks, from);

    const scheduling: SchedulingItem[] = tacticRows.map((row) => {
      const plan = resolveTacticPlan({
        type: String(row.type),
        tracking_type: String(row.tracking_type),
        recurrence_type: String(row.recurrence_type),
        recurrence_count: Number(row.recurrence_count),
        target_value: Number(row.target_value),
        target_per_week: (row.target_per_week as number) ?? null,
        target_per_day: (row.target_per_day as number) ?? null,
        unit: String(row.unit),
      });
      const tacticBlocks = blocks.filter(
        (block) => block.tactic_id === String(row.id),
      );
      const dates = tacticBlocks.map((block) => block.date).sort();
      const baseWeekTarget = normalizeAmount(getPlannedWeeklyTarget(plan));
      const weekTargets: Record<number, number> = {};
      for (const schedule of schedules.filter(
        (schedule) => schedule.tactic_id === String(row.id),
      )) {
        weekTargets[schedule.week_number] = normalizeAmount(
          schedule.planned_target ?? baseWeekTarget,
        );
      }
      // A tactic the week score would exclude must not advertise scheduling
      // room for the reference week (block writes there are rejected).
      const refSchedule =
        referenceWeek === null
          ? undefined
          : schedules.find(
              (schedule) =>
                schedule.tactic_id === String(row.id) &&
                schedule.week_number === referenceWeek,
            );
      const activeInRefWeek =
        referenceWeek === null ||
        isTacticActiveInWeek(
          {
            starts_week: (row.starts_week as number) ?? null,
            ends_week: (row.ends_week as number) ?? null,
            active: true,
          },
          referenceWeek,
          refSchedule ? { required: toBool(refSchedule.required) } : null,
        );
      const progress = getSchedulingProgress(
        plan,
        tacticBlocks,
        referenceWeek === null
          ? undefined
          : activeInRefWeek
            ? weekTargets[referenceWeek]
            : 0,
      );
      return {
        id: String(row.id),
        title: String(row.title),
        goal_title: str(row.goal_title) || 'Unknown goal',
        execution_style: resolveExecutionStyle(plan, {
          execution_style: (row.execution_style as string) ?? null,
          tracking_type: String(row.tracking_type),
        }),
        base_week_target: baseWeekTarget,
        week_targets: weekTargets,
        week_target: progress.week_target,
        scheduled: progress.scheduled,
        remaining: progress.remaining,
        scheduled_dates: dates,
        tracking_type: plan.trackingType,
        unit: plan.unit,
      };
    });
    scheduling.sort(
      (a, b) => a.scheduled - b.scheduled || a.title.localeCompare(b.title),
    );

    return {
      blocks,
      scheduling,
      current_week: currentWeekNumber(weeks, from),
    };
  }
}
