import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import { isIsoDate, newId, normalizeAmount, nowIso, str } from '../common/util';
import { DatabaseService } from '../database/database.service';
import {
  loadTacticWithPlan,
  assertTacticActiveInWeek,
  resolveBucket,
  scheduledSum,
  weeklyTarget,
} from '../tactics/tactic-access';
import type {
  CalendarBlock,
  CalendarBlockBody,
  CalendarBlockListQuery,
} from './calendar-blocks.dto';

const CREATE_FIELDS = [
  'tactic_id',
  'cycle_id',
  'date',
  'start_time',
  'end_time',
  'duration_minutes',
  'planned_value',
  'note',
] as const;

const UPDATE_FIELDS = [
  'date',
  'start_time',
  'end_time',
  'duration_minutes',
  'planned_value',
  'note',
] as const;

const COLUMNS = [
  'id',
  'tactic_id',
  'cycle_id',
  'week_number',
  'date',
  'start_time',
  'end_time',
  'duration_minutes',
  'planned_value',
  'note',
  'created_at',
  'updated_at',
].join(', ');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function rowToBlock(row: Record<string, unknown>): CalendarBlock {
  return {
    id: String(row.id),
    tactic_id: String(row.tactic_id),
    cycle_id: String(row.cycle_id),
    week_number: Number(row.week_number),
    date: String(row.date),
    start_time: (row.start_time as string) ?? null,
    end_time: (row.end_time as string) ?? null,
    duration_minutes: (row.duration_minutes as number) ?? null,
    planned_value: Number(row.planned_value),
    note: (row.note as string) ?? '',
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function assertNoUnknown(
  body: Record<string, unknown>,
  valid: readonly string[],
): void {
  const unknown = Object.keys(body).filter((k) => !valid.includes(k));
  if (unknown.length > 0) {
    throw new UnprocessableEntityException({
      error: 'unprocessable',
      unknown_fields: unknown,
      valid_fields: [...valid],
    });
  }
}

function assertTime(v: unknown, name: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = str(v);
  if (!TIME_RE.test(s)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${name} must be HH:MM`,
    });
  }
  return s;
}

function assertDuration(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'duration_minutes must be a positive integer',
    });
  }
  return n;
}

function timeToMinutes(value: string): number {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Derive missing block times (port of core deriveBlockTimes): start+end →
 * duration, start+duration → end (must stay before 24:00).
 */
export function deriveBlockTimes(input: {
  start_time?: unknown;
  end_time?: unknown;
  duration_minutes?: unknown;
}): {
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
} {
  const startTime = assertTime(input.start_time, 'start_time');
  let endTime = assertTime(input.end_time, 'end_time');
  let durationMinutes = assertDuration(input.duration_minutes);
  if (startTime && endTime) {
    const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (duration <= 0) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'end_time must be after start_time',
      });
    }
    durationMinutes ??= duration;
  } else if (startTime && durationMinutes !== null && endTime === null) {
    const computedEnd = timeToMinutes(startTime) + durationMinutes;
    if (computedEnd >= 24 * 60) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'end_time must be before 24:00',
      });
    }
    endTime = minutesToTime(computedEnd);
  }
  return {
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationMinutes,
  };
}

@Injectable()
export class CalendarBlocksService {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string, query: CalendarBlockListQuery): {
    calendar_blocks: CalendarBlock[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'tactic_calendar_blocks');
    let sortCol = query.sort ?? 'date';
    if (!cols.has(sortCol)) sortCol = 'date';
    const sortOrder =
      query.sort === undefined && query.order === undefined ? 'asc' : order;

    const where: string[] = ['b.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('b.note LIKE ?');
      params.push(`%${search}%`);
    }
    for (const [param, col] of [
      [query.tactic_id, 'tactic_id'],
      [query.cycle_id, 'cycle_id'],
      [query.date, 'date'],
    ] as const) {
      const v = str(param);
      if (v) {
        where.push(`b.${col} = ?`);
        params.push(v);
      }
    }
    if (query.week_number !== undefined && str(query.week_number) !== '') {
      const n = Number(query.week_number);
      if (!Number.isInteger(n))
        throw new BadRequestException({
          error: 'bad_request',
          message: 'week_number must be an integer',
        });
      where.push('b.week_number = ?');
      params.push(n);
    }
    const flt = buildFilters(cols, query.filters, 'b.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from tactic_calendar_blocks b ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from tactic_calendar_blocks b ${whereSql} order by b."${sortCol}" ${sortOrder} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return {
      calendar_blocks: rows.map(rowToBlock),
      total: totalRow.n,
      page,
      limit,
    };
  }

  get(userId: string, id: string): CalendarBlock {
    const row = this.database.sqlite
      .prepare(`select ${COLUMNS} from tactic_calendar_blocks where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToBlock(row);
  }

  create(userId: string, body: CalendarBlockBody): CalendarBlock {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, CREATE_FIELDS);
    const tacticId = str(body?.tactic_id);
    if (!tacticId)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'tactic_id is required',
      });
    const date = str(body?.date);
    if (!isIsoDate(date)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'date must be YYYY-MM-DD',
      });
    }
    const sqlite = this.database.sqlite;
    const { tactic, plan, style } = loadTacticWithPlan(sqlite, tacticId, userId);
    const bucket = resolveBucket(sqlite, tactic, date, userId);
    if (body?.cycle_id !== undefined && str(body.cycle_id) !== bucket.cycleId) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'Calendar block cycle does not match its tactic',
      });
    }
    assertTacticActiveInWeek(sqlite, tactic, bucket.weekNumber, userId);
    const validated = this.validateBlock(body ?? {}, plan, style);

    const scheduled = scheduledSum(
      sqlite,
      tacticId,
      bucket.cycleId,
      bucket.weekNumber,
      userId,
    );
    const target = weeklyTarget(sqlite, tacticId, bucket.weekNumber, plan, userId);
    const remaining = normalizeAmount(Math.max(target - scheduled, 0));
    if (
      validated.planned_value > remaining &&
      Math.abs(validated.planned_value - remaining) >= 1 / 1_000_000
    ) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `Only ${remaining} ${plan.unit || 'units'} remain to schedule this week`,
      });
    }

    const now = nowIso();
    const id = newId();
    sqlite
      .prepare(
        `insert into tactic_calendar_blocks (id, user_id, tactic_id, cycle_id, week_number, date, start_time, end_time,
          duration_minutes, planned_value, note, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        userId,
        tacticId,
        bucket.cycleId,
        bucket.weekNumber,
        date,
        validated.start_time,
        validated.end_time,
        validated.duration_minutes,
        validated.planned_value,
        validated.note,
        now,
        now,
      );
    return this.get(userId, id);
  }

  update(userId: string, id: string, body: CalendarBlockBody): CalendarBlock {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, UPDATE_FIELDS);
    const sqlite = this.database.sqlite;
    const existing = sqlite
      .prepare(`select ${COLUMNS} from tactic_calendar_blocks where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');

    const date =
      body?.date === undefined ? String(existing.date) : str(body.date);
    if (!isIsoDate(date)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'date must be YYYY-MM-DD',
      });
    }
    const tacticId = String(existing.tactic_id);
    const { tactic, plan, style } = loadTacticWithPlan(sqlite, tacticId, userId);
    const bucket = resolveBucket(sqlite, tactic, date, userId);
    assertTacticActiveInWeek(sqlite, tactic, bucket.weekNumber, userId);
    const merged = { ...existing, ...(body as Record<string, unknown>), date };
    const validated = this.validateBlock(merged, plan, style);

    const scheduled = scheduledSum(
      sqlite,
      tacticId,
      bucket.cycleId,
      bucket.weekNumber,
      userId,
      id,
    );
    const target = weeklyTarget(sqlite, tacticId, bucket.weekNumber, plan, userId);
    const remaining = normalizeAmount(Math.max(target - scheduled, 0));
    if (
      validated.planned_value > remaining &&
      Math.abs(validated.planned_value - remaining) >= 1 / 1_000_000
    ) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `Only ${remaining} ${plan.unit || 'units'} remain to schedule this week`,
      });
    }

    sqlite
      .prepare(
        `update tactic_calendar_blocks set date = ?, start_time = ?, end_time = ?, duration_minutes = ?,
          planned_value = ?, note = ?, week_number = ?, updated_at = ? where id = ? and user_id = ?`,
      )
      .run(
        date,
        validated.start_time,
        validated.end_time,
        validated.duration_minutes,
        validated.planned_value,
        validated.note,
        bucket.weekNumber,
        nowIso(),
        id,
        userId,
      );
    return this.get(userId, id);
  }

  remove(userId: string, id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select id from tactic_calendar_blocks where id = ? and user_id = ?')
      .get(id, userId);
    if (!existing) throw new NotFoundException('not_found');
    this.database.sqlite
      .prepare('delete from tactic_calendar_blocks where id = ? and user_id = ?')
      .run(id, userId);
    return { ok: true };
  }

  /**
   * Move a block to another date (port of core moveTacticCalendarBlock):
   * by block id, or by (tactic_id + from_date) when unambiguous.
   * The destination week's budget is re-validated; same-day multi-block
   * layouts are preserved (no destructive merge).
   */
  move(userId: string, body: {
    block_id?: unknown;
    tactic_id?: unknown;
    from_date?: unknown;
    to_date?: unknown;
  }): { action: 'moved'; source_block_id: string; block: CalendarBlock } {
    const sqlite = this.database.sqlite;
    const toDate = str(body?.to_date);
    if (!isIsoDate(toDate)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'to_date must be YYYY-MM-DD',
      });
    }
    let existing: Record<string, unknown> | undefined;
    const blockId = str(body?.block_id);
    if (blockId) {
      existing = sqlite
        .prepare('select * from tactic_calendar_blocks where id = ? and user_id = ?')
        .get(blockId, userId) as Record<string, unknown> | undefined;
      if (!existing) throw new NotFoundException('not_found');
    } else {
      const tacticId = str(body?.tactic_id);
      const fromDate = str(body?.from_date);
      if (!tacticId || !isIsoDate(fromDate)) {
        throw new BadRequestException({
          error: 'bad_request',
          message: 'Provide either block_id or both tactic_id and from_date',
        });
      }
      const matches = sqlite
        .prepare(
          'select * from tactic_calendar_blocks where tactic_id = ? and date = ? and user_id = ? order by id asc',
        )
        .all(tacticId, fromDate, userId) as Array<Record<string, unknown>>;
      if (matches.length === 0) {
        throw new NotFoundException('not_found');
      }
      if (matches.length > 1) {
        throw new BadRequestException({
          error: 'bad_request',
          message: `Multiple tactic blocks found for tactic ${tacticId} on ${fromDate}; provide block_id`,
        });
      }
      existing = matches[0];
    }
    const tacticId = String(existing.tactic_id);
    const cycleId = String(existing.cycle_id);
    const { tactic, plan, style } = loadTacticWithPlan(sqlite, tacticId, userId);
    const bucket = resolveBucket(sqlite, tactic, toDate, userId);
    if (bucket.cycleId !== cycleId) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'Target date is not inside the cycle',
      });
    }
    assertTacticActiveInWeek(sqlite, tactic, bucket.weekNumber, userId);
    // Value rules (size/toggle/occurrence); budget is checked below
    // against the DESTINATION week.
    this.validateBlock(
      { ...(existing as CalendarBlockBody), date: toDate },
      plan,
      style,
    );
    // Re-validate against the DESTINATION week's budget (excl. self).
    const scheduled = scheduledSum(
      sqlite,
      tacticId,
      cycleId,
      bucket.weekNumber,
      userId,
      String(existing.id),
    );
    const target = weeklyTarget(sqlite, tacticId, bucket.weekNumber, plan, userId);
    const remaining = normalizeAmount(Math.max(target - scheduled, 0));
    const value = normalizeAmount(Number(existing.planned_value));
    if (value > remaining && Math.abs(value - remaining) >= 1 / 1_000_000) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `Only ${remaining} ${plan.unit || 'units'} remain to schedule this week`,
      });
    }
    sqlite
      .prepare(
        'update tactic_calendar_blocks set date = ?, week_number = ?, updated_at = ? where id = ? and user_id = ?',
      )
      .run(toDate, bucket.weekNumber, nowIso(), String(existing.id), userId);
    return {
      action: 'moved',
      source_block_id: String(existing.id),
      block: this.get(userId, String(existing.id)),
    };
  }

  /** Port of the hooks' block-value checks (size > 0, toggle/occurrence rules). */
  private validateBlock(
    body: CalendarBlockBody,
    plan: { unit: string; trackingType?: string; targetValue?: number },
    style: string,
  ): {
    planned_value: number;
    start_time: string | null;
    end_time: string | null;
    duration_minutes: number | null;
    note: string;
  } {
    const requested =
      body?.planned_value === undefined ||
      body?.planned_value === null ||
      body?.planned_value === ''
        ? plan.trackingType === 'boolean'
          ? (plan.targetValue ?? 1)
          : undefined
        : body.planned_value;
    if (requested === undefined) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'planned_value is required for quantity and duration blocks',
      });
    }
    const raw = Number(requested);
    const value = normalizeAmount(raw);
    if (!Number.isFinite(raw) || value <= 0) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'Block size must be greater than 0',
      });
    }
    if (style === 'toggle') {
      throw new BadRequestException({
        error: 'bad_request',
        message: "Toggles can't be scheduled",
      });
    }
    if (style === 'occurrence' && !Number.isInteger(value)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'Occurrence block size must be a whole number',
      });
    }
    const times = deriveBlockTimes(body ?? {});
    return {
      planned_value: value,
      start_time: times.start_time,
      end_time: times.end_time,
      duration_minutes: times.duration_minutes,
      note: body?.note === undefined ? '' : str(body.note),
    };
  }
}
