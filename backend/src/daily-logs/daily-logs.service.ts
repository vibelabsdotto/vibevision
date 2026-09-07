import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import { isIsoDate, newId, nowIso, str } from '../common/util';
import { DatabaseService } from '../database/database.service';
import { EntriesService } from '../entries/entries.service';
import type {
  DailyLog,
  DailyLogBody,
  DailyLogListQuery,
} from './daily-logs.dto';

const CREATE_FIELDS = [
  'cycle_id',
  'date',
  'one_thing',
  'morning_done',
  'evening_done',
  'stress_level',
  'agency_score',
  'comfort_zone_done',
  'deep_work_minutes',
  'avoidance_trigger',
  'private_victories',
  'notes',
] as const;
const UPDATE_FIELDS = CREATE_FIELDS;

const MAX_TEXT = 10_000;

function rowToDailyLog(row: Record<string, unknown>): DailyLog {
  return {
    id: String(row.id),
    cycle_id: String(row.cycle_id),
    date: String(row.date),
    one_thing: (row.one_thing as string) ?? '',
    morning_done: Number(row.morning_done ?? 0),
    evening_done: Number(row.evening_done ?? 0),
    stress_level:
      row.stress_level === null || row.stress_level === undefined
        ? null
        : Number(row.stress_level),
    agency_score:
      row.agency_score === null || row.agency_score === undefined
        ? null
        : Number(row.agency_score),
    comfort_zone_done: Number(row.comfort_zone_done ?? 0),
    deep_work_minutes:
      row.deep_work_minutes === null || row.deep_work_minutes === undefined
        ? null
        : Number(row.deep_work_minutes),
    avoidance_trigger: (row.avoidance_trigger as string) ?? '',
    private_victories: (row.private_victories as string) ?? '',
    notes: (row.notes as string) ?? '',
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

function assertDate(v: unknown): string {
  const s = str(v);
  if (!isIsoDate(s)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'date must be YYYY-MM-DD',
    });
  }
  return s;
}

function textValue(v: unknown, field: string, fallback: string): string {
  if (v === undefined) return fallback;
  if (typeof v !== 'string') {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${field} must be a string`,
    });
  }
  if (v.length > MAX_TEXT) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${field} must be at most ${MAX_TEXT} characters`,
    });
  }
  return v;
}

function intOrNull(v: unknown, field: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${field} must be an integer or null`,
    });
  }
  return v;
}

function boolInt(v: unknown, field: string, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === 0 || v === 1) return v;
  throw new BadRequestException({
    error: 'bad_request',
    message: `${field} must be a boolean`,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
  );
}

@Injectable()
export class DailyLogsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly entries: EntriesService,
  ) {}

  list(userId: string, query: DailyLogListQuery): {
    daily_logs: DailyLog[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'daily_logs');
    let sortCol = query.sort ?? 'date';
    if (!cols.has(sortCol)) sortCol = 'date';

    const where: string[] = ['d.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('(d.one_thing LIKE ? OR d.notes LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const cycleId = str(query.cycle_id);
    if (cycleId) {
      where.push('d.cycle_id = ?');
      params.push(cycleId);
    }
    const date = str(query.date);
    if (date) {
      where.push('d.date = ?');
      params.push(date);
    }
    const flt = buildFilters(cols, query.filters, 'd.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from daily_logs d ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select * from daily_logs d ${whereSql} order by d."${sortCol}" ${order} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return {
      daily_logs: rows.map(rowToDailyLog),
      total: totalRow.n,
      page,
      limit,
    };
  }

  get(userId: string, id: string): DailyLog {
    const row = this.database.sqlite
      .prepare('select * from daily_logs where id = ? and user_id = ?')
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToDailyLog(row);
  }

  getByCycleAndDate(
    userId: string,
    cycleId: unknown,
    date: unknown,
  ): DailyLog | null {
    const d = assertDate(date);
    const id = str(cycleId);
    if (!id) this.requireCycle(userId, cycleId);
    const cycle = this.database.sqlite
      .prepare('select id from cycles where id = ? and user_id = ?')
      .get(id, userId);
    // Another user's (or unknown) cycle reads as empty — never confirm it.
    if (!cycle) return null;
    const row = this.database.sqlite
      .prepare(
        'select * from daily_logs where cycle_id = ? and date = ? and user_id = ?',
      )
      .get(id, d, userId) as Record<string, unknown> | undefined;
    return row ? rowToDailyLog(row) : null;
  }

  create(userId: string, body: DailyLogBody): DailyLog {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, CREATE_FIELDS);
    const cycleId = this.requireCycle(userId, body?.cycle_id);
    const date = assertDate(body?.date);
    const dup = this.database.sqlite
      .prepare(
        'select id from daily_logs where cycle_id = ? and date = ? and user_id = ?',
      )
      .get(cycleId, date, userId);
    if (dup)
      throw new ConflictException({ error: 'conflict', message: 'conflict' });

    const now = nowIso();
    const id = newId();
    try {
      this.database.sqlite
        .prepare(
          'insert into daily_logs (id, user_id, cycle_id, date, one_thing, morning_done, evening_done, stress_level, agency_score, comfort_zone_done, deep_work_minutes, avoidance_trigger, private_victories, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          userId,
          cycleId,
          date,
          textValue(body?.one_thing, 'one_thing', ''),
          boolInt(body?.morning_done, 'morning_done', 0),
          boolInt(body?.evening_done, 'evening_done', 0),
          intOrNull(body?.stress_level, 'stress_level'),
          intOrNull(body?.agency_score, 'agency_score'),
          boolInt(body?.comfort_zone_done, 'comfort_zone_done', 0),
          intOrNull(body?.deep_work_minutes, 'deep_work_minutes'),
          textValue(body?.avoidance_trigger, 'avoidance_trigger', ''),
          textValue(body?.private_victories, 'private_victories', ''),
          textValue(body?.notes, 'notes', ''),
          now,
          now,
        );
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException({ error: 'conflict', message: 'conflict' });
      throw error;
    }
    return this.get(userId, id);
  }

  upsert(userId: string, body: DailyLogBody): DailyLog {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, CREATE_FIELDS);
    const cycleId = this.requireCycle(userId, body?.cycle_id);
    const date = assertDate(body?.date);
    const existing = this.database.sqlite
      .prepare(
        'select id from daily_logs where cycle_id = ? and date = ? and user_id = ?',
      )
      .get(cycleId, date, userId) as { id: string } | undefined;
    if (existing) return this.update(userId, existing.id, body);
    try {
      return this.create(userId, body);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const retry = this.database.sqlite
          .prepare(
            'select id from daily_logs where cycle_id = ? and date = ? and user_id = ?',
          )
          .get(cycleId, date, userId) as { id: string } | undefined;
        if (retry) return this.update(userId, retry.id, body);
        throw new ConflictException({ error: 'conflict', message: 'conflict' });
      }
      throw error;
    }
  }

  update(userId: string, id: string, body: DailyLogBody): DailyLog {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, UPDATE_FIELDS);
    const existing = this.database.sqlite
      .prepare('select * from daily_logs where id = ? and user_id = ?')
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');

    let cycleId = String(existing.cycle_id);
    let date = String(existing.date);
    if (body?.cycle_id !== undefined)
      cycleId = this.requireCycle(userId, body.cycle_id);
    if (body?.date !== undefined) date = assertDate(body.date);
    if (cycleId !== existing.cycle_id || date !== existing.date) {
      const clash = this.database.sqlite
        .prepare(
          'select id from daily_logs where cycle_id = ? and date = ? and id != ? and user_id = ?',
        )
        .get(cycleId, date, id, userId);
      if (clash)
        throw new ConflictException({ error: 'conflict', message: 'conflict' });
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body?.cycle_id !== undefined) {
      sets.push('cycle_id = ?');
      params.push(cycleId);
    }
    if (body?.date !== undefined) {
      sets.push('date = ?');
      params.push(date);
    }
    if (body?.one_thing !== undefined) {
      sets.push('one_thing = ?');
      params.push(textValue(body.one_thing, 'one_thing', ''));
    }
    if (body?.morning_done !== undefined) {
      sets.push('morning_done = ?');
      params.push(boolInt(body.morning_done, 'morning_done', 0));
    }
    if (body?.evening_done !== undefined) {
      sets.push('evening_done = ?');
      params.push(boolInt(body.evening_done, 'evening_done', 0));
    }
    if (body?.stress_level !== undefined) {
      sets.push('stress_level = ?');
      params.push(intOrNull(body.stress_level, 'stress_level'));
    }
    if (body?.agency_score !== undefined) {
      sets.push('agency_score = ?');
      params.push(intOrNull(body.agency_score, 'agency_score'));
    }
    if (body?.comfort_zone_done !== undefined) {
      sets.push('comfort_zone_done = ?');
      params.push(boolInt(body.comfort_zone_done, 'comfort_zone_done', 0));
    }
    if (body?.deep_work_minutes !== undefined) {
      sets.push('deep_work_minutes = ?');
      params.push(intOrNull(body.deep_work_minutes, 'deep_work_minutes'));
    }
    if (body?.avoidance_trigger !== undefined) {
      sets.push('avoidance_trigger = ?');
      params.push(textValue(body.avoidance_trigger, 'avoidance_trigger', ''));
    }
    if (body?.private_victories !== undefined) {
      sets.push('private_victories = ?');
      params.push(textValue(body.private_victories, 'private_victories', ''));
    }
    if (body?.notes !== undefined) {
      sets.push('notes = ?');
      params.push(textValue(body.notes, 'notes', ''));
    }
    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id, userId);
    try {
      this.database.sqlite
        .prepare(`update daily_logs set ${sets.join(', ')} where id = ? and user_id = ?`)
        .run(...params);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException({ error: 'conflict', message: 'conflict' });
      throw error;
    }
    return this.get(userId, id);
  }

  remove(userId: string, id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select id from daily_logs where id = ? and user_id = ?')
      .get(id, userId);
    if (!existing) throw new NotFoundException('not_found');
    this.database.sqlite
      .prepare('delete from daily_logs where id = ? and user_id = ?')
      .run(id, userId);
    return { ok: true };
  }

  /**
   * Morning/evening check-in (port of core morning()/evening()):
   * ensure the day row, merge fields, set the done flag, and log the
   * check-ins tactic (unit = 'checkins') when one exists.
   */
  checkin(
    userId: string,
    body: {
      cycle_id?: unknown;
      date?: unknown;
      kind?: unknown;
      one_thing?: unknown;
      stress_level?: unknown;
      agency_score?: unknown;
      private_victories?: unknown;
      avoidance_trigger?: unknown;
      notes?: unknown;
      deep_work_minutes?: unknown;
      comfort_zone_done?: unknown;
    },
  ): DailyLog {
    const kind = str(body?.kind);
    if (kind !== 'morning' && kind !== 'evening') {
      throw new BadRequestException({
        error: 'bad_request',
        message: "kind must be 'morning' or 'evening'",
      });
    }
    const cycleId =
      str(body?.cycle_id) !== ''
        ? str(body?.cycle_id)
        : this.activeCycleId(userId);
    if (!cycleId) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'no active cycle',
      });
    }
    this.requireCycle(userId, cycleId);
    const date =
      body?.date === undefined || body?.date === null || body?.date === ''
        ? new Date().toISOString().slice(0, 10)
        : assertDate(body.date);

    const patch: Record<string, unknown> = {};
    if (kind === 'morning') {
      if (body?.one_thing !== undefined) {
        patch.one_thing = textValue(body.one_thing, 'one_thing', '');
      }
      if (body?.stress_level !== undefined) {
        patch.stress_level = intOrNull(body.stress_level, 'stress_level');
      }
      patch.morning_done = true;
    } else {
      if (body?.agency_score !== undefined) {
        patch.agency_score = intOrNull(body.agency_score, 'agency_score');
      }
      if (body?.stress_level !== undefined) {
        patch.stress_level = intOrNull(body.stress_level, 'stress_level');
      }
      if (body?.private_victories !== undefined) {
        patch.private_victories = textValue(
          body.private_victories,
          'private_victories',
          '',
        );
      }
      if (body?.avoidance_trigger !== undefined) {
        patch.avoidance_trigger = textValue(
          body.avoidance_trigger,
          'avoidance_trigger',
          '',
        );
      }
      if (body?.notes !== undefined) {
        patch.notes = textValue(body.notes, 'notes', '');
      }
      if (body?.deep_work_minutes !== undefined) {
        patch.deep_work_minutes = intOrNull(
          body.deep_work_minutes,
          'deep_work_minutes',
        );
      }
      if (body?.comfort_zone_done !== undefined) {
        patch.comfort_zone_done = boolInt(
          body.comfort_zone_done,
          'comfort_zone_done',
          0,
        );
      }
      patch.evening_done = true;
    }
    const log = this.upsert(userId, { cycle_id: cycleId, date, ...patch });
    this.maybeLogCheckinTactic(userId, cycleId, kind, date);
    return log;
  }

  private activeCycleId(userId: string): string | null {
    const setting = this.database.sqlite
      .prepare(
        "select value from settings where key = 'active_cycle_id' and user_id = ?",
      )
      .get(userId) as { value: string } | undefined;
    if (setting?.value) {
      const row = this.database.sqlite
        .prepare('select id from cycles where id = ? and user_id = ?')
        .get(setting.value, userId);
      if (row) return setting.value;
    }
    const active = this.database.sqlite
      .prepare(
        "select id from cycles where status = 'active' and user_id = ? order by start_date desc limit 1",
      )
      .get(userId) as { id: string } | undefined;
    return active?.id ?? null;
  }

  private maybeLogCheckinTactic(
    userId: string,
    cycleId: string,
    kind: string,
    date: string,
  ): void {
    const tactic = this.database.sqlite
      .prepare(
        `select t.id from tactics t join goals g on g.id = t.goal_id
         where g.cycle_id = ? and g.user_id = ? and t.user_id = ? and t.unit = 'checkins' limit 1`,
      )
      .get(cycleId, userId, userId) as { id: string } | undefined;
    if (!tactic) return;
    this.entries.create(userId, {
      tactic_id: tactic.id,
      cycle_id: cycleId,
      date,
      value: 1,
      completed: true,
      note: `${kind} check-in`,
    });
  }

  private requireCycle(userId: string, cycleId: unknown): string {
    const id = str(cycleId);
    if (!id)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'cycle_id is required',
      });
    const row = this.database.sqlite
      .prepare('select id from cycles where id = ? and user_id = ?')
      .get(id, userId);
    if (!row)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'cycle not found',
      });
    return id;
  }
}
