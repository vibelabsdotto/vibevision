import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import { newId, nowIso, str } from '../common/util';
import { DatabaseService } from '../database/database.service';

export interface MonthlyReviewListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  cycle_id?: string;
}

export interface MonthlyReviewBody {
  cycle_id?: unknown;
  month_number?: unknown;
  title?: unknown;
  reflection?: unknown;
  adjustments?: unknown;
}

export interface MonthlyReview {
  id: string;
  cycle_id: string;
  month_number: number;
  title: string;
  reflection: string;
  adjustments: string;
  created_at: string;
  updated_at: string;
}

const FIELDS = [
  'cycle_id',
  'month_number',
  'title',
  'reflection',
  'adjustments',
] as const;

const COLUMNS = [
  'id',
  'cycle_id',
  'month_number',
  'title',
  'reflection',
  'adjustments',
  'created_at',
  'updated_at',
].join(', ');

function rowToReview(row: Record<string, unknown>): MonthlyReview {
  return {
    id: String(row.id),
    cycle_id: String(row.cycle_id),
    month_number: Number(row.month_number),
    title: String(row.title),
    reflection: (row.reflection as string) ?? '',
    adjustments: (row.adjustments as string) ?? '',
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

function assertMonth(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 3) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'month_number must be an integer 1..3',
    });
  }
  return n;
}

function assertText(v: unknown, name: string): string {
  const s = typeof v === 'string' ? v : '';
  if (s.length > 20000) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${name} exceeds 20000 characters`,
    });
  }
  return s;
}

@Injectable()
export class MonthlyReviewsService {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string, query: MonthlyReviewListQuery): {
    monthly_reviews: MonthlyReview[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'monthly_reviews');
    let sortCol = query.sort ?? 'month_number';
    if (!cols.has(sortCol)) sortCol = 'month_number';
    const sortOrder =
      query.sort === undefined && query.order === undefined ? 'asc' : order;

    const where: string[] = ['r.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('r.title LIKE ?');
      params.push(`%${search}%`);
    }
    const cycleId = str(query.cycle_id);
    if (cycleId) {
      where.push('r.cycle_id = ?');
      params.push(cycleId);
    }
    const flt = buildFilters(cols, query.filters, 'r.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from monthly_reviews r ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from monthly_reviews r ${whereSql} order by r."${sortCol}" ${sortOrder} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return {
      monthly_reviews: rows.map(rowToReview),
      total: totalRow.n,
      page,
      limit,
    };
  }

  get(userId: string, id: string): MonthlyReview {
    const row = this.database.sqlite
      .prepare(`select ${COLUMNS} from monthly_reviews where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToReview(row);
  }

  create(userId: string, body: MonthlyReviewBody): MonthlyReview {
    assertNoUnknown((body ?? {}) as Record<string, unknown>);
    const cycleId = str(body?.cycle_id);
    if (!cycleId)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'cycle_id is required',
      });
    const cycle = this.database.sqlite
      .prepare('select id from cycles where id = ? and user_id = ?')
      .get(cycleId, userId);
    if (!cycle)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'unknown cycle_id',
      });
    const monthNumber = assertMonth(body?.month_number);
    const title = str(body?.title);
    if (!title)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'title is required',
      });
    const dupe = this.database.sqlite
      .prepare(
        'select id from monthly_reviews where cycle_id = ? and month_number = ? and user_id = ?',
      )
      .get(cycleId, monthNumber, userId);
    if (dupe)
      throw new ConflictException({
        error: 'conflict',
        message: 'monthly review already exists',
      });
    const now = nowIso();
    const id = newId();
    this.database.sqlite
      .prepare(
        'insert into monthly_reviews (id, user_id, cycle_id, month_number, title, reflection, adjustments, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        userId,
        cycleId,
        monthNumber,
        title,
        assertText(body?.reflection, 'reflection'),
        assertText(body?.adjustments, 'adjustments'),
        now,
        now,
      );
    return this.get(userId, id);
  }

  update(userId: string, id: string, body: MonthlyReviewBody): MonthlyReview {
    assertNoUnknown((body ?? {}) as Record<string, unknown>);
    const existing = this.database.sqlite
      .prepare(`select ${COLUMNS} from monthly_reviews where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');
    if (
      (body?.cycle_id !== undefined &&
        str(body.cycle_id) !== existing.cycle_id) ||
      (body?.month_number !== undefined &&
        Number(body.month_number) !== existing.month_number)
    ) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'cycle_id/month_number are immutable (delete + recreate)',
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
    if (body?.reflection !== undefined) {
      sets.push('reflection = ?');
      params.push(assertText(body.reflection, 'reflection'));
    }
    if (body?.adjustments !== undefined) {
      sets.push('adjustments = ?');
      params.push(assertText(body.adjustments, 'adjustments'));
    }
    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id, userId);
    this.database.sqlite
      .prepare(`update monthly_reviews set ${sets.join(', ')} where id = ? and user_id = ?`)
      .run(...params);
    return this.get(userId, id);
  }

  remove(userId: string, id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select id from monthly_reviews where id = ? and user_id = ?')
      .get(id, userId);
    if (!existing) throw new NotFoundException('not_found');
    this.database.sqlite
      .prepare('delete from monthly_reviews where id = ? and user_id = ?')
      .run(id, userId);
    return { ok: true };
  }
}
