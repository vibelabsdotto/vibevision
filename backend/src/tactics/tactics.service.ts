import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import {
  newId,
  normalizeAmount,
  nowIso,
  str,
  toBool,
  isIsoDate,
} from '../common/util';
import { getOccurrenceTarget, isWeekdayDate } from '../scoring/today';
import { getTodayProgress } from '../scoring/week';
import { DatabaseService } from '../database/database.service';
import { getWeekExecutionBlocks } from '../calendar/execution-blocks';
import type { Tactic, TacticBody, TacticListQuery } from './tactics.dto';
import {
  EXECUTION_STYLES,
  LEGACY_TACTIC_TYPES,
  RECURRENCE_TYPES,
  TRACKING_TYPES,
  assertValidPlan,
  getPlannedWeeklyTarget,
  isTacticActiveInWeek,
  resolveExecutionStyle,
  resolveTacticPlan,
  type ExecutionStyle,
  type TacticPlan,
} from './plan';

const CREATE_FIELDS = [
  'goal_id',
  'title',
  'type',
  'tracking_type',
  'recurrence_type',
  'execution_style',
  'recurrence_count',
  'target_value',
  'unit',
  'target_per_week',
  'target_per_day',
  'scoring_weight',
  'starts_week',
  'ends_week',
  'active',
  'sort_order',
] as const;

const COLUMNS = [
  'id',
  'goal_id',
  'title',
  'type',
  'tracking_type',
  'recurrence_type',
  'execution_style',
  'recurrence_count',
  'target_value',
  'unit',
  'target_per_week',
  'target_per_day',
  'scoring_weight',
  'starts_week',
  'ends_week',
  'active',
  'sort_order',
  'created_at',
  'updated_at',
].join(', ');

function rowToTactic(row: Record<string, unknown>): Tactic {
  return {
    id: String(row.id),
    goal_id: String(row.goal_id),
    title: String(row.title),
    type: String(row.type),
    tracking_type: String(row.tracking_type),
    recurrence_type: String(row.recurrence_type),
    execution_style: (row.execution_style as string) ?? null,
    recurrence_count: Number(row.recurrence_count),
    target_value: Number(row.target_value),
    unit: String(row.unit),
    target_per_week: Number(row.target_per_week),
    target_per_day: Number(row.target_per_day),
    scoring_weight: Number(row.scoring_weight),
    starts_week: (row.starts_week as number) ?? null,
    ends_week: (row.ends_week as number) ?? null,
    active: Number(row.active),
    sort_order: Number(row.sort_order),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function assertNoUnknown(body: Record<string, unknown>): void {
  const unknown = Object.keys(body).filter(
    (k) => !(CREATE_FIELDS as readonly string[]).includes(k),
  );
  if (unknown.length > 0) {
    throw new UnprocessableEntityException({
      error: 'unprocessable',
      unknown_fields: unknown,
      valid_fields: [...CREATE_FIELDS],
    });
  }
}

function num(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n))
    throw new BadRequestException({
      error: 'bad_request',
      message: 'must be a number',
    });
  return n;
}

function optWeek(v: unknown, name: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${name} must be an integer 1..12`,
    });
  }
  return n;
}

@Injectable()
export class TacticsService {
  constructor(private readonly database: DatabaseService) {}

  list(
    userId: string,
    query: TacticListQuery,
  ): {
    tactics: Tactic[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'tactics');
    let sortCol = query.sort ?? 'sort_order';
    if (!cols.has(sortCol)) sortCol = 'sort_order';
    const sortOrder =
      query.sort === undefined && query.order === undefined ? 'asc' : order;

    const where: string[] = ['t.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('t.title LIKE ?');
      params.push(`%${search}%`);
    }
    const goalId = str(query.goal_id);
    if (goalId) {
      where.push('t.goal_id = ?');
      params.push(goalId);
    }
    const flt = buildFilters(cols, query.filters, 't.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from tactics t ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from tactics t ${whereSql} order by t."${sortCol}" ${sortOrder} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return { tactics: rows.map(rowToTactic), total: totalRow.n, page, limit };
  }

  get(userId: string, id: string): Tactic {
    const row = this.database.sqlite
      .prepare(`select ${COLUMNS} from tactics where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToTactic(row);
  }

  create(userId: string, body: TacticBody): Tactic {
    assertNoUnknown((body ?? {}) as Record<string, unknown>);
    const goalId = str(body?.goal_id);
    if (!goalId)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'goal_id is required',
      });
    const goal = this.database.sqlite
      .prepare('select id from goals where id = ? and user_id = ?')
      .get(goalId, userId);
    if (!goal)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'unknown goal_id',
      });
    const title = str(body?.title);
    if (!title)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'title is required',
      });
    const unit = str(body?.unit);
    if (!unit)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'unit is required',
      });

    const validated = this.validatePlanFields(body ?? {});
    const now = nowIso();
    const id = newId();
    this.database.sqlite
      .prepare(
        `insert into tactics (id, user_id, goal_id, title, type, tracking_type, recurrence_type, execution_style,
          recurrence_count, target_value, unit, target_per_week, target_per_day, scoring_weight,
          starts_week, ends_week, active, sort_order, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        userId,
        goalId,
        title,
        validated.type,
        validated.tracking_type,
        validated.recurrence_type,
        validated.execution_style,
        validated.recurrence_count,
        validated.target_value,
        unit,
        validated.target_per_week,
        validated.target_per_day,
        validated.scoring_weight,
        validated.starts_week,
        validated.ends_week,
        validated.active,
        validated.sort_order,
        now,
        now,
      );
    return this.get(userId, id);
  }

  update(userId: string, id: string, body: TacticBody): Tactic {
    assertNoUnknown((body ?? {}) as Record<string, unknown>);
    const existing = this.database.sqlite
      .prepare(`select ${COLUMNS} from tactics where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');

    const merged: Record<string, unknown> = { ...existing };
    if (body?.title !== undefined) {
      const title = str(body.title);
      if (!title)
        throw new BadRequestException({
          error: 'bad_request',
          message: 'title is required',
        });
      merged.title = title;
    }
    if (body?.unit !== undefined) {
      const unit = str(body.unit);
      if (!unit)
        throw new BadRequestException({
          error: 'bad_request',
          message: 'unit is required',
        });
      merged.unit = unit;
    }
    for (const key of [
      'type',
      'tracking_type',
      'recurrence_type',
      'execution_style',
      'recurrence_count',
      'target_value',
      'target_per_week',
      'target_per_day',
      'scoring_weight',
      'starts_week',
      'ends_week',
      'active',
      'sort_order',
    ] as const) {
      if (body?.[key] !== undefined) merged[key] = body[key];
    }
    const validated = this.validatePlanFields(merged);

    this.database.sqlite
      .prepare(
        `update tactics set title = ?, type = ?, tracking_type = ?, recurrence_type = ?, execution_style = ?,
          recurrence_count = ?, target_value = ?, unit = ?, target_per_week = ?, target_per_day = ?,
          scoring_weight = ?, starts_week = ?, ends_week = ?, active = ?, sort_order = ?, updated_at = ? where id = ? and user_id = ?`,
      )
      .run(
        String(merged.title),
        validated.type,
        validated.tracking_type,
        validated.recurrence_type,
        validated.execution_style,
        validated.recurrence_count,
        validated.target_value,
        String(merged.unit),
        validated.target_per_week,
        validated.target_per_day,
        validated.scoring_weight,
        validated.starts_week,
        validated.ends_week,
        validated.active,
        validated.sort_order,
        nowIso(),
        id,
        userId,
      );
    return this.get(userId, id);
  }

  remove(userId: string, id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select id from tactics where id = ? and user_id = ?')
      .get(id, userId);
    if (!existing) throw new NotFoundException('not_found');
    this.database.sqlite
      .prepare('delete from tactics where id = ? and user_id = ?')
      .run(id, userId);
    return { ok: true };
  }

  /**
   * Minimal stepper state for one tactic+date (port of core getTacticTodayState):
   * avoids the dashboard fan-out; the entries API remains the write boundary.
   */
  todayState(
    userId: string,
    id: string,
    dateParam?: string,
  ): {
    tactic: Tactic;
    execution_style: string;
    today_actual: number;
    today_target: number | null;
  } {
    const sqlite = this.database.sqlite;
    const date =
      dateParam === undefined || dateParam === '' || dateParam === null
        ? new Date().toISOString().slice(0, 10)
        : str(dateParam);
    if (!isIsoDate(date)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'date must be YYYY-MM-DD',
      });
    }
    const tactic = this.get(userId, id);
    const setting = sqlite
      .prepare(
        "select value from settings where key = 'active_cycle_id' and user_id = ?",
      )
      .get(userId) as { value: string } | undefined;
    let cycleId: string | null = null;
    if (setting?.value) {
      const goal = sqlite
        .prepare(
          `select g.cycle_id from goals g join tactics t on t.goal_id = g.id where t.id = ? and t.user_id = ? and g.user_id = ?`,
        )
        .get(id, userId, userId) as { cycle_id: string } | undefined;
      if (goal?.cycle_id === setting.value) cycleId = goal.cycle_id;
    }
    if (!cycleId) {
      const active = sqlite
        .prepare(
          `select g.cycle_id from goals g join tactics t on t.goal_id = g.id
           join cycles c on c.id = g.cycle_id
           where t.id = ? and t.user_id = ? and g.user_id = ? and c.user_id = ? and c.status = 'active' order by c.start_date desc limit 1`,
        )
        .get(id, userId, userId, userId) as { cycle_id: string } | undefined;
      if (!active) throw new NotFoundException('not_found');
      cycleId = active.cycle_id;
    }
    const weeks = sqlite
      .prepare(
        'select week_number, start_date, end_date from cycle_weeks where cycle_id = ? and user_id = ?',
      )
      .all(cycleId, userId) as Array<{
      week_number: number;
      start_date: string;
      end_date: string;
    }>;
    const week = weeks.find((w) => w.start_date <= date && w.end_date >= date);
    if (!week) throw new NotFoundException('not_found');

    const { plan, style } = this.planOf(tactic);
    const schedule = sqlite
      .prepare(
        'select planned_target, required from tactic_schedules where tactic_id = ? and week_number = ? and user_id = ?',
      )
      .get(id, week.week_number, userId) as
      { planned_target: number | null; required: number } | undefined;
    const blockRows = getWeekExecutionBlocks(
      sqlite,
      userId,
      cycleId,
      week.week_number,
      date,
    ).filter((block) => block.tactic_id === id && block.date === date);
    const scheduledTarget = normalizeAmount(
      blockRows.reduce((sum, block) => sum + block.scheduled_value, 0),
    );
    const entryRows = sqlite
      .prepare(
        `select value, completed from tactic_entries
         where cycle_id = ? and week_number = ? and tactic_id = ? and date = ? and user_id = ?`,
      )
      .all(cycleId, week.week_number, id, date, userId) as Array<{
      value: number;
      completed: number;
    }>;
    const todayActual = getTodayProgress(
      plan,
      entryRows.map((row) => ({
        tactic_id: id,
        date,
        value: Number(row.value),
        completed: toBool(row.completed),
      })),
      date,
      style,
    );
    const weekTarget = normalizeAmount(
      schedule?.planned_target ?? getPlannedWeeklyTarget(plan),
    );
    const activeInWeek = schedule
      ? toBool(schedule.required)
      : isTacticActiveInWeek(
          {
            starts_week: tactic.starts_week,
            ends_week: tactic.ends_week,
            active: tactic.active === 1,
          },
          week.week_number,
          null,
        );
    // A scheduled block with no remaining work still overrides recurrence.
    const hasScheduledToday = blockRows.length > 0;
    const recurringToday =
      !hasScheduledToday &&
      weekTarget > 0 &&
      activeInWeek &&
      (plan.recurrenceType === 'daily' ||
        (plan.recurrenceType === 'weekdays' && isWeekdayDate(date)));
    const todayTarget = hasScheduledToday
      ? scheduledTarget
      : recurringToday
        ? style === 'toggle'
          ? 1
          : getOccurrenceTarget(plan)
        : null;
    return {
      tactic,
      execution_style: style,
      today_actual: todayActual,
      today_target: todayTarget,
    };
  }

  private planOf(tactic: Tactic): {
    plan: TacticPlan;
    style: ExecutionStyle;
  } {
    let plan: TacticPlan;
    try {
      plan = resolveTacticPlan(
        {
          type: tactic.type,
          tracking_type: tactic.tracking_type,
          recurrence_type: tactic.recurrence_type,
          recurrence_count: tactic.recurrence_count,
          target_value: tactic.target_value,
          target_per_week: tactic.target_per_week,
          target_per_day: tactic.target_per_day,
          unit: tactic.unit,
        },
        { strict: true },
      );
    } catch (error) {
      throw new BadRequestException({
        error: 'bad_request',
        message: error instanceof Error ? error.message : 'Invalid tactic plan',
      });
    }
    let style: ExecutionStyle;
    try {
      style = resolveExecutionStyle(
        plan,
        {
          execution_style: tactic.execution_style,
          tracking_type: tactic.tracking_type,
        },
        { strict: true },
      );
    } catch (error) {
      throw new BadRequestException({
        error: 'bad_request',
        message:
          error instanceof Error ? error.message : 'Invalid execution style',
      });
    }
    return { plan, style };
  }

  /**
   * Validates + normalizes all plan fields (create or merged update).
   * Throws 400 with a descriptive message on any contradiction.
   */
  private validatePlanFields(body: TacticBody): {
    type: string;
    tracking_type: string;
    recurrence_type: string;
    execution_style: string | null;
    recurrence_count: number;
    target_value: number;
    target_per_week: number;
    target_per_day: number;
    scoring_weight: number;
    starts_week: number | null;
    ends_week: number | null;
    active: number;
    sort_order: number;
  } {
    const type = body.type === undefined ? 'habit' : str(body.type);
    if (!(LEGACY_TACTIC_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `Invalid type "${type}". Valid: ${LEGACY_TACTIC_TYPES.join(', ')}`,
      });
    }
    const trackingType = str(body.tracking_type);
    if (!(TRACKING_TYPES as readonly string[]).includes(trackingType)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `Invalid tracking_type "${trackingType}". Valid: ${TRACKING_TYPES.join(', ')}`,
      });
    }
    const recurrenceType = str(body.recurrence_type);
    if (!(RECURRENCE_TYPES as readonly string[]).includes(recurrenceType)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `Invalid recurrence_type "${recurrenceType}". Valid: ${RECURRENCE_TYPES.join(', ')}`,
      });
    }
    const rawStyle =
      body.execution_style === null ||
      body.execution_style === undefined ||
      body.execution_style === ''
        ? null
        : str(body.execution_style);
    if (
      rawStyle !== null &&
      !(EXECUTION_STYLES as readonly string[]).includes(rawStyle)
    ) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `Invalid execution_style "${rawStyle}". Valid: ${EXECUTION_STYLES.join(', ')}`,
      });
    }
    const targetValue = normalizeAmount(num(body.target_value, 0));
    const recurrenceCount = num(body.recurrence_count, 1);
    const plan = resolveTacticPlan(
      {
        tracking_type: trackingType,
        recurrence_type: recurrenceType,
        recurrence_count: recurrenceCount,
        target_value: targetValue,
        unit: str(body.unit) || 'units',
      },
      { strict: true },
    );
    try {
      assertValidPlan(plan);
      resolveExecutionStyle(
        plan,
        { execution_style: rawStyle, tracking_type: trackingType },
        { strict: true },
      );
    } catch (error) {
      throw new BadRequestException({
        error: 'bad_request',
        message: error instanceof Error ? error.message : 'Invalid tactic plan',
      });
    }
    const startsWeek = optWeek(body.starts_week, 'starts_week');
    const endsWeek = optWeek(body.ends_week, 'ends_week');
    if (startsWeek !== null && endsWeek !== null && startsWeek > endsWeek) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'starts_week must not exceed ends_week',
      });
    }
    const weight = num(body.scoring_weight, 1);
    if (weight < 0) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'scoring_weight must be >= 0',
      });
    }
    return {
      type,
      tracking_type: trackingType,
      recurrence_type: recurrenceType,
      execution_style: rawStyle,
      recurrence_count: recurrenceCount,
      target_value: targetValue,
      target_per_week: normalizeAmount(num(body.target_per_week, 0)),
      target_per_day: normalizeAmount(num(body.target_per_day, 0)),
      scoring_weight: weight,
      starts_week: startsWeek,
      ends_week: endsWeek,
      active: body.active === undefined ? 1 : toBool(body.active) ? 1 : 0,
      sort_order: num(body.sort_order, 0),
    };
  }
}
