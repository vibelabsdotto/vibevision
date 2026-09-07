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

export interface WeeklyReviewListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  cycle_id?: string;
}

export interface WeeklyReviewBody {
  cycle_id?: unknown;
  week_number?: unknown;
  execution_score?: unknown;
  weekly_goals?: unknown;
  wins?: unknown;
  misses?: unknown;
  avoidance_patterns?: unknown;
  lessons?: unknown;
  next_week_adjustments?: unknown;
  completed_at?: unknown;
}

export interface WeeklyReview {
  id: string;
  cycle_id: string;
  week_number: number;
  execution_score: number | null;
  weekly_goals: string;
  wins: string;
  misses: string;
  avoidance_patterns: string;
  lessons: string;
  next_week_adjustments: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const FIELDS = [
  'cycle_id',
  'week_number',
  'execution_score',
  'weekly_goals',
  'wins',
  'misses',
  'avoidance_patterns',
  'lessons',
  'next_week_adjustments',
  'completed_at',
] as const;

const TEXT_FIELDS = [
  'weekly_goals',
  'wins',
  'misses',
  'avoidance_patterns',
  'lessons',
  'next_week_adjustments',
] as const;

const COLUMNS = [
  'id',
  'cycle_id',
  'week_number',
  'execution_score',
  'weekly_goals',
  'wins',
  'misses',
  'avoidance_patterns',
  'lessons',
  'next_week_adjustments',
  'completed_at',
  'created_at',
  'updated_at',
].join(', ');

function rowToReview(row: Record<string, unknown>): WeeklyReview {
  return {
    id: String(row.id),
    cycle_id: String(row.cycle_id),
    week_number: Number(row.week_number),
    execution_score: (row.execution_score as number) ?? null,
    weekly_goals: (row.weekly_goals as string) ?? '',
    wins: (row.wins as string) ?? '',
    misses: (row.misses as string) ?? '',
    avoidance_patterns: (row.avoidance_patterns as string) ?? '',
    lessons: (row.lessons as string) ?? '',
    next_week_adjustments: (row.next_week_adjustments as string) ?? '',
    completed_at: (row.completed_at as string) ?? null,
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

function assertText(v: unknown, name: string, max: number): string {
  const s = typeof v === 'string' ? v : '';
  if (s.length > max) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${name} exceeds ${max} characters`,
    });
  }
  return s;
}

@Injectable()
export class WeeklyReviewsService {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string, query: WeeklyReviewListQuery): {
    weekly_reviews: WeeklyReview[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'weekly_reviews');
    let sortCol = query.sort ?? 'week_number';
    if (!cols.has(sortCol)) sortCol = 'week_number';
    const sortOrder =
      query.sort === undefined && query.order === undefined ? 'asc' : order;

    const where: string[] = ['r.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('r.wins LIKE ?');
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
      .prepare(`select count(*) as n from weekly_reviews r ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from weekly_reviews r ${whereSql} order by r."${sortCol}" ${sortOrder} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return {
      weekly_reviews: rows.map(rowToReview),
      total: totalRow.n,
      page,
      limit,
    };
  }

  get(userId: string, id: string): WeeklyReview {
    const row = this.database.sqlite
      .prepare(`select ${COLUMNS} from weekly_reviews where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToReview(row);
  }

  create(userId: string, body: WeeklyReviewBody): WeeklyReview {
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
    const weekNumber = assertWeek(body?.week_number);
    const dupe = this.database.sqlite
      .prepare(
        'select id from weekly_reviews where cycle_id = ? and week_number = ? and user_id = ?',
      )
      .get(cycleId, weekNumber, userId);
    if (dupe)
      throw new ConflictException({
        error: 'conflict',
        message: 'weekly review already exists',
      });
    const now = nowIso();
    const id = newId();
    this.database.sqlite
      .prepare(
        `insert into weekly_reviews (id, user_id, cycle_id, week_number, execution_score, weekly_goals, wins, misses,
          avoidance_patterns, lessons, next_week_adjustments, completed_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        userId,
        cycleId,
        weekNumber,
        body?.execution_score === undefined || body.execution_score === null
          ? null
          : Number(body.execution_score),
        ...TEXT_FIELDS.map((f) =>
          assertText(
            (body as Record<string, unknown> | undefined)?.[f],
            f,
            10000,
          ),
        ),
        body?.completed_at === undefined || body.completed_at === null
          ? null
          : str(body.completed_at),
        now,
        now,
      );
    return this.get(userId, id);
  }

  update(userId: string, id: string, body: WeeklyReviewBody): WeeklyReview {
    assertNoUnknown((body ?? {}) as Record<string, unknown>);
    const existing = this.database.sqlite
      .prepare(`select ${COLUMNS} from weekly_reviews where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');
    if (
      (body?.cycle_id !== undefined &&
        str(body.cycle_id) !== existing.cycle_id) ||
      (body?.week_number !== undefined &&
        Number(body.week_number) !== existing.week_number)
    ) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'cycle_id/week_number are immutable (delete + recreate)',
      });
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body?.execution_score !== undefined) {
      sets.push('execution_score = ?');
      params.push(
        body.execution_score === null ? null : Number(body.execution_score),
      );
    }
    for (const f of TEXT_FIELDS) {
      const v = (body as Record<string, unknown> | undefined)?.[f];
      if (v !== undefined) {
        sets.push(`${f} = ?`);
        params.push(assertText(v, f, 10000));
      }
    }
    if (body?.completed_at !== undefined) {
      const v = body.completed_at;
      if (v !== null && !isIsoDate(v) && str(v) !== '') {
        throw new BadRequestException({
          error: 'bad_request',
          message: 'completed_at must be YYYY-MM-DD or null',
        });
      }
      sets.push('completed_at = ?');
      params.push(v === null || str(v) === '' ? null : str(v));
    }
    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id, userId);
    this.database.sqlite
      .prepare(`update weekly_reviews set ${sets.join(', ')} where id = ? and user_id = ?`)
      .run(...params);
    return this.get(userId, id);
  }

  remove(userId: string, id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select id from weekly_reviews where id = ? and user_id = ?')
      .get(id, userId);
    if (!existing) throw new NotFoundException('not_found');
    this.database.sqlite
      .prepare('delete from weekly_reviews where id = ? and user_id = ?')
      .run(id, userId);
    return { ok: true };
  }
}
