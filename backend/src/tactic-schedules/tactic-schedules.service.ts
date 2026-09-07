import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import { newId, normalizeAmount, nowIso, str, toBool } from '../common/util';
import { DatabaseService } from '../database/database.service';
import type {
  TacticSchedule,
  TacticScheduleBody,
  TacticScheduleListQuery,
} from './tactic-schedules.dto';

const FIELDS = [
  'tactic_id',
  'week_number',
  'planned_target',
  'required',
] as const;

const COLUMNS = [
  'id',
  'tactic_id',
  'week_number',
  'planned_target',
  'required',
  'created_at',
  'updated_at',
].join(', ');

function rowToSchedule(row: Record<string, unknown>): TacticSchedule {
  return {
    id: String(row.id),
    tactic_id: String(row.tactic_id),
    week_number: Number(row.week_number),
    planned_target: Number(row.planned_target),
    required: Number(row.required),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function assertNoUnknown(body: Record<string, unknown>): void {
  const unknown = Object.keys(body).filter(
    (k) => !(FIELDS as readonly string[]).includes(k),
  );
  if (unknown.length > 0) {
    throw new UnprocessableEntityException({
      error: 'unprocessable',
      unknown_fields: unknown,
      valid_fields: [...FIELDS],
    });
  }
}

function assertWeek(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'week_number must be an integer 1..12',
    });
  }
  return n;
}

@Injectable()
export class TacticSchedulesService {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string, query: TacticScheduleListQuery): {
    tactic_schedules: TacticSchedule[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'tactic_schedules');
    let sortCol = query.sort ?? 'week_number';
    if (!cols.has(sortCol)) sortCol = 'week_number';

    const where: string[] = ['s.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('s.id LIKE ?');
      params.push(`%${search}%`);
    }
    const tacticId = str(query.tactic_id);
    if (tacticId) {
      where.push('s.tactic_id = ?');
      params.push(tacticId);
    }
    if (query.week_number !== undefined && str(query.week_number) !== '') {
      where.push('s.week_number = ?');
      params.push(assertWeek(query.week_number));
    }
    const flt = buildFilters(cols, query.filters, 's.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from tactic_schedules s ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from tactic_schedules s ${whereSql} order by s."${sortCol}" ${order} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return {
      tactic_schedules: rows.map(rowToSchedule),
      total: totalRow.n,
      page,
      limit,
    };
  }

  get(userId: string, id: string): TacticSchedule {
    const row = this.database.sqlite
      .prepare(`select ${COLUMNS} from tactic_schedules where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToSchedule(row);
  }

  /**
   * POST is an upsert per (tactic_id, week_number): an existing row for the
   * week is updated (200 semantics via `created: false`), otherwise created.
   */
  upsert(userId: string, body: TacticScheduleBody): {
    schedule: TacticSchedule;
    created: boolean;
  } {
    assertNoUnknown((body ?? {}) as Record<string, unknown>);
    const tacticId = str(body?.tactic_id);
    if (!tacticId)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'tactic_id is required',
      });
    const tactic = this.database.sqlite
      .prepare('select id from tactics where id = ? and user_id = ?')
      .get(tacticId, userId);
    if (!tactic)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'unknown tactic_id',
      });
    const weekNumber = assertWeek(body?.week_number);
    const plannedTarget = normalizeAmount(Number(body?.planned_target ?? 0));
    if (!Number.isFinite(plannedTarget) || plannedTarget < 0) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'planned_target must be >= 0',
      });
    }
    const required =
      body?.required === undefined ? 0 : toBool(body.required) ? 1 : 0;

    const now = nowIso();
    const existing = this.database.sqlite
      .prepare(
        'select id from tactic_schedules where tactic_id = ? and week_number = ? and user_id = ?',
      )
      .get(tacticId, weekNumber, userId) as { id: string } | undefined;
    if (existing) {
      this.database.sqlite
        .prepare(
          'update tactic_schedules set planned_target = ?, required = ?, updated_at = ? where id = ? and user_id = ?',
        )
        .run(plannedTarget, required, now, existing.id, userId);
      return { schedule: this.get(userId, existing.id), created: false };
    }
    const id = newId();
    this.database.sqlite
      .prepare(
        'insert into tactic_schedules (id, user_id, tactic_id, week_number, planned_target, required, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, userId, tacticId, weekNumber, plannedTarget, required, now, now);
    return { schedule: this.get(userId, id), created: true };
  }

  update(userId: string, id: string, body: TacticScheduleBody): TacticSchedule {
    assertNoUnknown((body ?? {}) as Record<string, unknown>);
    const existing = this.database.sqlite
      .prepare(`select ${COLUMNS} from tactic_schedules where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body?.planned_target !== undefined) {
      const v = normalizeAmount(Number(body.planned_target));
      if (!Number.isFinite(v) || v < 0) {
        throw new BadRequestException({
          error: 'bad_request',
          message: 'planned_target must be >= 0',
        });
      }
      sets.push('planned_target = ?');
      params.push(v);
    }
    if (body?.required !== undefined) {
      sets.push('required = ?');
      params.push(toBool(body.required) ? 1 : 0);
    }
    if (body?.tactic_id !== undefined || body?.week_number !== undefined) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'tactic_id/week_number are immutable (delete + recreate)',
      });
    }
    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id, userId);
    this.database.sqlite
      .prepare(`update tactic_schedules set ${sets.join(', ')} where id = ? and user_id = ?`)
      .run(...params);
    return this.get(userId, id);
  }

  remove(userId: string, id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select id from tactic_schedules where id = ? and user_id = ?')
      .get(id, userId);
    if (!existing) throw new NotFoundException('not_found');
    this.database.sqlite
      .prepare('delete from tactic_schedules where id = ? and user_id = ?')
      .run(id, userId);
    return { ok: true };
  }
}
