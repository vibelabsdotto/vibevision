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
  LagIndicator,
  LagIndicatorBody,
  LagIndicatorListQuery,
} from './lag-indicators.dto';

const LAG_TYPES = [
  'number',
  'boolean',
  'milestone',
  'text',
  'quantity',
] as const;
const FIELDS = [
  'goal_id',
  'title',
  'type',
  'target_value',
  'current_value',
  'unit',
  'achieved',
  'sort_order',
] as const;

const COLUMNS = [
  'id',
  'goal_id',
  'title',
  'type',
  'target_value',
  'current_value',
  'unit',
  'achieved',
  'sort_order',
  'created_at',
  'updated_at',
].join(', ');

function rowToLag(row: Record<string, unknown>): LagIndicator {
  return {
    id: String(row.id),
    goal_id: String(row.goal_id),
    title: String(row.title),
    type: (row.type as string) ?? '',
    target_value: Number(row.target_value),
    current_value: Number(row.current_value),
    unit: (row.unit as string) ?? '',
    achieved: Number(row.achieved),
    sort_order: Number(row.sort_order),
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

function assertType(v: unknown): string {
  const s = str(v);
  if (s !== '' && !(LAG_TYPES as readonly string[]).includes(s)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `Invalid type "${s}". Valid: ${LAG_TYPES.join(', ')}`,
    });
  }
  return s;
}

function assertAmount(v: unknown, name: string, fallback: number): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = normalizeAmount(Number(v));
  if (!Number.isFinite(n))
    throw new BadRequestException({
      error: 'bad_request',
      message: `${name} must be a number`,
    });
  return n;
}

@Injectable()
export class LagIndicatorsService {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string, query: LagIndicatorListQuery): {
    lag_indicators: LagIndicator[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'lag_indicators');
    let sortCol = query.sort ?? 'sort_order';
    if (!cols.has(sortCol)) sortCol = 'sort_order';
    const sortOrder =
      query.sort === undefined && query.order === undefined ? 'asc' : order;

    const where: string[] = ['l.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('l.title LIKE ?');
      params.push(`%${search}%`);
    }
    const goalId = str(query.goal_id);
    if (goalId) {
      where.push('l.goal_id = ?');
      params.push(goalId);
    }
    const flt = buildFilters(cols, query.filters, 'l.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from lag_indicators l ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from lag_indicators l ${whereSql} order by l."${sortCol}" ${sortOrder} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return {
      lag_indicators: rows.map(rowToLag),
      total: totalRow.n,
      page,
      limit,
    };
  }

  get(userId: string, id: string): LagIndicator {
    const row = this.database.sqlite
      .prepare(`select ${COLUMNS} from lag_indicators where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToLag(row);
  }

  create(userId: string, body: LagIndicatorBody): LagIndicator {
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
    const now = nowIso();
    const id = newId();
    this.database.sqlite
      .prepare(
        `insert into lag_indicators (id, user_id, goal_id, title, type, target_value, current_value, unit, achieved, sort_order, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        userId,
        goalId,
        title,
        body?.type === undefined ? '' : assertType(body.type),
        assertAmount(body?.target_value, 'target_value', 0),
        assertAmount(body?.current_value, 'current_value', 0),
        body?.unit === undefined ? '' : str(body.unit),
        body?.achieved === undefined ? 0 : toBool(body.achieved) ? 1 : 0,
        Number(body?.sort_order ?? 0),
        now,
        now,
      );
    return this.get(userId, id);
  }

  update(userId: string, id: string, body: LagIndicatorBody): LagIndicator {
    assertNoUnknown((body ?? {}) as Record<string, unknown>);
    const existing = this.database.sqlite
      .prepare(`select ${COLUMNS} from lag_indicators where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');
    if (body?.goal_id !== undefined && str(body.goal_id) !== existing.goal_id) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'goal_id is immutable (delete + recreate)',
      });
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body?.title !== undefined) {
      const title = str(body.title);
      if (!title)
        throw new BadRequestException({
          error: 'bad_request',
          message: 'title is required',
        });
      sets.push('title = ?');
      params.push(title);
    }
    if (body?.type !== undefined) {
      sets.push('type = ?');
      params.push(assertType(body.type));
    }
    if (body?.target_value !== undefined) {
      sets.push('target_value = ?');
      params.push(assertAmount(body.target_value, 'target_value', 0));
    }
    if (body?.current_value !== undefined) {
      sets.push('current_value = ?');
      params.push(assertAmount(body.current_value, 'current_value', 0));
    }
    if (body?.unit !== undefined) {
      sets.push('unit = ?');
      params.push(str(body.unit));
    }
    if (body?.achieved !== undefined) {
      sets.push('achieved = ?');
      params.push(toBool(body.achieved) ? 1 : 0);
    }
    if (body?.sort_order !== undefined) {
      sets.push('sort_order = ?');
      params.push(Number(body.sort_order));
    }
    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id, userId);
    this.database.sqlite
      .prepare(`update lag_indicators set ${sets.join(', ')} where id = ? and user_id = ?`)
      .run(...params);
    return this.get(userId, id);
  }

  /** Mark achieved: achieved=1 and current_value=target_value. */
  achieve(userId: string, id: string): LagIndicator {
    const existing = this.get(userId, id);
    this.database.sqlite
      .prepare(
        'update lag_indicators set achieved = 1, current_value = target_value, updated_at = ? where id = ? and user_id = ?',
      )
      .run(nowIso(), id, userId);
    return this.get(userId, existing.id);
  }

  remove(userId: string, id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select id from lag_indicators where id = ? and user_id = ?')
      .get(id, userId);
    if (!existing) throw new NotFoundException('not_found');
    this.database.sqlite
      .prepare('delete from lag_indicators where id = ? and user_id = ?')
      .run(id, userId);
    return { ok: true };
  }
}
