import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import { nowIso, str } from '../common/util';
import { DatabaseService } from '../database/database.service';

export interface CycleWeekListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  cycle_id?: string;
}

export interface CycleWeek {
  id: string;
  cycle_id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  label: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = [
  'id',
  'cycle_id',
  'week_number',
  'start_date',
  'end_date',
  'label',
  'created_at',
  'updated_at',
].join(', ');

function rowToWeek(row: Record<string, unknown>): CycleWeek {
  return {
    id: String(row.id),
    cycle_id: String(row.cycle_id),
    week_number: Number(row.week_number),
    start_date: String(row.start_date),
    end_date: String(row.end_date),
    label: String(row.label),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

@Injectable()
export class CycleWeeksService {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string, query: CycleWeekListQuery): {
    cycle_weeks: CycleWeek[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'cycle_weeks');
    let sortCol = query.sort ?? 'week_number';
    if (!cols.has(sortCol)) sortCol = 'week_number';
    const sortOrder =
      query.sort === undefined && query.order === undefined ? 'asc' : order;

    const where: string[] = ['w.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('w.label LIKE ?');
      params.push(`%${search}%`);
    }
    const cycleId = str(query.cycle_id);
    if (cycleId) {
      where.push('w.cycle_id = ?');
      params.push(cycleId);
    }
    const flt = buildFilters(cols, query.filters, 'w.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from cycle_weeks w ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from cycle_weeks w ${whereSql} order by w."${sortCol}" ${sortOrder} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return {
      cycle_weeks: rows.map(rowToWeek),
      total: totalRow.n,
      page,
      limit,
    };
  }

  get(userId: string, id: string): CycleWeek {
    const row = this.database.sqlite
      .prepare(`select ${COLUMNS} from cycle_weeks where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToWeek(row);
  }

  /** Weeks are created by POST /v1/cycles — only the label is editable. */
  update(userId: string, id: string, body: { label?: unknown }): CycleWeek {
    const unknown = Object.keys(body ?? {}).filter((k) => k !== 'label');
    if (unknown.length > 0) {
      throw new UnprocessableEntityException({
        error: 'unprocessable',
        unknown_fields: unknown,
        valid_fields: ['label'],
      });
    }
    const existing = this.database.sqlite
      .prepare(`select ${COLUMNS} from cycle_weeks where id = ? and user_id = ?`)
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');
    if (body?.label !== undefined) {
      const label = str(body.label);
      if (!label)
        throw new BadRequestException({
          error: 'bad_request',
          message: 'label is required',
        });
      this.database.sqlite
        .prepare(
          'update cycle_weeks set label = ?, updated_at = ? where id = ? and user_id = ?',
        )
        .run(label, nowIso(), id, userId);
    }
    return this.get(userId, id);
  }
}
