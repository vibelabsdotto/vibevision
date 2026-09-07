import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import {
  addDays,
  isIsoDate,
  newId,
  nowIso,
  slugify,
  startOfIsoWeek,
  str,
} from '../common/util';
import { DatabaseService } from '../database/database.service';
import { SettingsService } from '../settings/settings.service';
import type { Cycle, CycleBody, CycleListQuery } from './cycles.dto';

export const ACTIVE_CYCLE_KEY = 'active_cycle_id';

const CYCLE_STATUSES = ['planned', 'active', 'done'] as const;

const CREATE_FIELDS = [
  'title',
  'start_date',
  'vision',
  'status',
  'slug',
] as const;
const UPDATE_FIELDS = ['title', 'vision', 'status', 'captured_at'] as const;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function rowToCycle(row: Record<string, unknown>): Cycle {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    vision: (row.vision as string) ?? '',
    start_date: String(row.start_date),
    end_date: String(row.end_date),
    status: String(row.status),
    captured_at: (row.captured_at as string) ?? null,
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

function assertStatus(v: unknown): string {
  const s = str(v);
  if (!CYCLE_STATUSES.includes(s as (typeof CYCLE_STATUSES)[number])) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `Invalid status "${s}". Valid: ${CYCLE_STATUSES.join(', ')}`,
    });
  }
  return s;
}

@Injectable()
export class CyclesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly settings: SettingsService,
  ) {}

  list(userId: string, query: CycleListQuery): {
    cycles: Cycle[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'cycles');
    let sortCol = query.sort ?? 'start_date';
    if (!cols.has(sortCol)) sortCol = 'start_date';

    const where: string[] = ['c.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('(c.title LIKE ? OR c.slug LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const status = str(query.status);
    if (status) {
      where.push('c.status = ?');
      params.push(status);
    }
    const flt = buildFilters(cols, query.filters, 'c.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from cycles c ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select * from cycles c ${whereSql} order by c."${sortCol}" ${order} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return { cycles: rows.map(rowToCycle), total: totalRow.n, page, limit };
  }

  get(userId: string, id: string): Cycle {
    const row = this.database.sqlite
      .prepare('select * from cycles where id = ? and user_id = ?')
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToCycle(row);
  }

  getActive(userId: string): Cycle | null {
    const activeId = this.settings.get(userId, ACTIVE_CYCLE_KEY).value;
    if (activeId) {
      const row = this.database.sqlite
        .prepare('select * from cycles where id = ? and user_id = ?')
        .get(activeId, userId) as Record<string, unknown> | undefined;
      if (row) return rowToCycle(row);
    }
    const row = this.database.sqlite
      .prepare(
        "select * from cycles where status = 'active' and user_id = ? order by start_date desc limit 1",
      )
      .get(userId) as Record<string, unknown> | undefined;
    return row ? rowToCycle(row) : null;
  }

  create(userId: string, body: CycleBody): Cycle {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, CREATE_FIELDS);
    const title = str(body?.title);
    if (!title)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'title is required',
      });
    const startDate = str(body?.start_date);
    if (!isIsoDate(startDate)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'start_date must be YYYY-MM-DD',
      });
    }
    const status =
      body?.status === undefined ? 'planned' : assertStatus(body.status);
    const slugBase = body?.slug === undefined ? slugify(title) : str(body.slug);
    if (!slugBase || !SLUG_RE.test(slugBase)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'slug must match [a-z0-9]+(-[a-z0-9]+)*',
      });
    }
    const vision = body?.vision === undefined ? '' : str(body.vision);

    const start = startOfIsoWeek(startDate);
    const end = addDays(start, 83);
    const now = nowIso();
    const id = newId();
    let slug = slugBase;
    const slugTaken = (s: string): boolean =>
      this.database.sqlite
        .prepare('select 1 from cycles where slug = ? and user_id = ?')
        .get(s, userId) !== undefined;
    let n = 1;
    while (slugTaken(slug)) {
      n += 1;
      slug = `${slugBase}-${n}`;
    }

    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite
        .prepare(
          'insert into cycles (id, user_id, slug, title, vision, start_date, end_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(id, userId, slug, title, vision, start, end, status, now, now);
      const insertWeek = sqlite.prepare(
        'insert into cycle_weeks (id, user_id, cycle_id, week_number, start_date, end_date, label, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (let i = 0; i < 12; i += 1) {
        insertWeek.run(
          newId(),
          userId,
          id,
          i + 1,
          addDays(start, i * 7),
          addDays(start, i * 7 + 6),
          `Week ${i + 1}`,
          now,
          now,
        );
      }
      if (status === 'active') this.activateInTransaction(userId, id, now);
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
    return this.get(userId, id);
  }

  update(userId: string, id: string, body: CycleBody): Cycle {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, UPDATE_FIELDS);
    const existing = this.database.sqlite
      .prepare('select * from cycles where id = ? and user_id = ?')
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');

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
    if (body?.vision !== undefined) {
      sets.push('vision = ?');
      params.push(str(body.vision));
    }
    if (body?.status !== undefined) {
      const status = assertStatus(body.status);
      if (status === 'active') {
        throw new BadRequestException({
          error: 'bad_request',
          message: 'use POST /v1/cycles/:id/activate',
        });
      }
      sets.push('status = ?');
      params.push(status);
    }
    if (body?.captured_at !== undefined) {
      const v = body.captured_at;
      if (v !== null && !isIsoDate(v) && str(v) !== '') {
        throw new BadRequestException({
          error: 'bad_request',
          message: 'captured_at must be YYYY-MM-DD or null',
        });
      }
      sets.push('captured_at = ?');
      params.push(v === null || str(v) === '' ? null : str(v));
    }
    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id, userId);
    this.database.sqlite
      .prepare(`update cycles set ${sets.join(', ')} where id = ? and user_id = ?`)
      .run(...params);
    return this.get(userId, id);
  }

  remove(userId: string, id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select id from cycles where id = ? and user_id = ?')
      .get(id, userId);
    if (!existing) throw new NotFoundException('not_found');
    this.database.sqlite
      .prepare('delete from cycles where id = ? and user_id = ?')
      .run(id, userId);
    return { ok: true };
  }

  activate(userId: string, id: string): Cycle {
    const existing = this.database.sqlite
      .prepare('select id from cycles where id = ? and user_id = ?')
      .get(id, userId);
    if (!existing) throw new NotFoundException('not_found');
    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      this.activateInTransaction(userId, id, nowIso());
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
    return this.get(userId, id);
  }

  private activateInTransaction(
    userId: string,
    id: string,
    now: string,
  ): void {
    const sqlite = this.database.sqlite;
    sqlite
      .prepare(
        "update cycles set status = 'planned', updated_at = ? where status = 'active' and id != ? and user_id = ?",
      )
      .run(now, id, userId);
    sqlite
      .prepare(
        "update cycles set status = 'active', updated_at = ? where id = ? and user_id = ?",
      )
      .run(now, id, userId);
    this.settings.set(userId, ACTIVE_CYCLE_KEY, id);
  }
}
