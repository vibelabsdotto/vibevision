import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import { newId, nowIso, str } from '../common/util';
import { DatabaseService } from '../database/database.service';
import type { Goal, GoalBody, GoalListQuery } from './goals.dto';

const GOAL_STATUSES = ['in_progress', 'achieved', 'dropped'] as const;
const FIELDS = [
  'cycle_id',
  'title',
  'description',
  'sort_order',
  'status',
] as const;

const COLUMNS = [
  'id',
  'cycle_id',
  'title',
  'description',
  'sort_order',
  'status',
  'created_at',
  'updated_at',
].join(', ');

function rowToGoal(row: Record<string, unknown>): Goal {
  return {
    id: String(row.id),
    cycle_id: String(row.cycle_id),
    title: String(row.title),
    description: (row.description as string) ?? '',
    sort_order: Number(row.sort_order),
    status: String(row.status),
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

function assertStatus(v: unknown): string {
  const s = str(v);
  if (!(GOAL_STATUSES as readonly string[]).includes(s)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `Invalid status "${s}". Valid: ${GOAL_STATUSES.join(', ')}`,
    });
  }
  return s;
}

@Injectable()
export class GoalsService {
  constructor(private readonly database: DatabaseService) {}

  list(query: GoalListQuery): {
    goals: Goal[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'goals');
    let sortCol = query.sort ?? 'sort_order';
    if (!cols.has(sortCol)) sortCol = 'sort_order';
    const sortOrder =
      query.sort === undefined && query.order === undefined ? 'asc' : order;

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      where.push('g.title LIKE ?');
      params.push(`%${search}%`);
    }
    const cycleId = str(query.cycle_id);
    if (cycleId) {
      where.push('g.cycle_id = ?');
      params.push(cycleId);
    }
    const status = str(query.status);
    if (status) {
      where.push('g.status = ?');
      params.push(status);
    }
    const flt = buildFilters(cols, query.filters, 'g.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from goals g ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from goals g ${whereSql} order by g."${sortCol}" ${sortOrder} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return { goals: rows.map(rowToGoal), total: totalRow.n, page, limit };
  }

  get(id: string): Goal {
    const row = this.database.sqlite
      .prepare(`select ${COLUMNS} from goals where id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToGoal(row);
  }

  create(body: GoalBody): Goal {
    assertNoUnknown((body ?? {}) as Record<string, unknown>);
    const cycleId = str(body?.cycle_id);
    if (!cycleId)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'cycle_id is required',
      });
    const cycle = this.database.sqlite
      .prepare('select id from cycles where id = ?')
      .get(cycleId);
    if (!cycle)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'unknown cycle_id',
      });
    const title = str(body?.title);
    if (!title)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'title is required',
      });
    const status =
      body?.status === undefined ? 'in_progress' : assertStatus(body.status);
    const now = nowIso();
    const id = newId();
    this.database.sqlite
      .prepare(
        'insert into goals (id, cycle_id, title, description, sort_order, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        cycleId,
        title,
        body?.description === undefined ? '' : str(body.description),
        Number(body?.sort_order ?? 0),
        status,
        now,
        now,
      );
    return this.get(id);
  }

  update(id: string, body: GoalBody): Goal {
    assertNoUnknown((body ?? {}) as Record<string, unknown>);
    const existing = this.database.sqlite
      .prepare(`select ${COLUMNS} from goals where id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');
    if (
      body?.cycle_id !== undefined &&
      str(body.cycle_id) !== existing.cycle_id
    ) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'cycle_id is immutable (delete + recreate)',
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
    if (body?.description !== undefined) {
      sets.push('description = ?');
      params.push(str(body.description));
    }
    if (body?.sort_order !== undefined) {
      const n = Number(body.sort_order);
      if (!Number.isFinite(n))
        throw new BadRequestException({
          error: 'bad_request',
          message: 'sort_order must be a number',
        });
      sets.push('sort_order = ?');
      params.push(n);
    }
    if (body?.status !== undefined) {
      sets.push('status = ?');
      params.push(assertStatus(body.status));
    }
    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id);
    this.database.sqlite
      .prepare(`update goals set ${sets.join(', ')} where id = ?`)
      .run(...params);
    return this.get(id);
  }

  remove(id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select id from goals where id = ?')
      .get(id);
    if (!existing) throw new NotFoundException('not_found');
    this.database.sqlite.prepare('delete from goals where id = ?').run(id);
    return { ok: true };
  }
}
