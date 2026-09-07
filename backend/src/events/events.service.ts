import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import { newId, nowIso, str } from '../common/util';
import { DatabaseService } from '../database/database.service';

export interface EventListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  cycle_id?: string;
}

export interface EventBody {
  cycle_id?: unknown;
  type?: unknown;
  payload_json?: unknown;
}

export interface AppEvent {
  id: string;
  cycle_id: string | null;
  type: string;
  payload_json: string;
  created_at: string;
}

const COLUMNS = ['id', 'cycle_id', 'type', 'payload_json', 'created_at'].join(
  ', ',
);

function rowToEvent(row: Record<string, unknown>): AppEvent {
  return {
    id: String(row.id),
    cycle_id: (row.cycle_id as string) ?? null,
    type: String(row.type),
    payload_json: (row.payload_json as string) ?? '{}',
    created_at: String(row.created_at),
  };
}

/** Append-only activity log (contract §2): GET + POST, no PUT/DELETE. */
@Injectable()
export class EventsService {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string, query: EventListQuery): {
    events: AppEvent[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'events');
    let sortCol = query.sort ?? 'created_at';
    if (!cols.has(sortCol)) sortCol = 'created_at';
    const sortOrder =
      query.sort === undefined && query.order === undefined ? 'desc' : order;

    const where: string[] = ['e.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('e.type LIKE ?');
      params.push(`%${search}%`);
    }
    const cycleId = str(query.cycle_id);
    if (cycleId) {
      where.push('e.cycle_id = ?');
      params.push(cycleId);
    }
    const flt = buildFilters(cols, query.filters, 'e.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from events e ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from events e ${whereSql} order by e."${sortCol}" ${sortOrder} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return { events: rows.map(rowToEvent), total: totalRow.n, page, limit };
  }

  record(userId: string, body: EventBody): AppEvent {
    const unknown = Object.keys(body ?? {}).filter(
      (k) => !['cycle_id', 'type', 'payload_json'].includes(k),
    );
    if (unknown.length > 0) {
      throw new UnprocessableEntityException({
        error: 'unprocessable',
        unknown_fields: unknown,
        valid_fields: ['cycle_id', 'type', 'payload_json'],
      });
    }
    const type = str(body?.type);
    if (!type)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'type is required',
      });
    const cycleId =
      body?.cycle_id === undefined ||
      body?.cycle_id === null ||
      body?.cycle_id === ''
        ? null
        : str(body.cycle_id);
    if (cycleId) {
      const cycle = this.database.sqlite
        .prepare('select id from cycles where id = ? and user_id = ?')
        .get(cycleId, userId);
      if (!cycle)
        throw new BadRequestException({
          error: 'bad_request',
          message: 'unknown cycle_id',
        });
    }
    let payload = '{}';
    if (body?.payload_json !== undefined && body?.payload_json !== null) {
      payload =
        typeof body.payload_json === 'string'
          ? body.payload_json
          : JSON.stringify(body.payload_json);
      if (payload.length > 50000) {
        throw new BadRequestException({
          error: 'bad_request',
          message: 'payload_json exceeds 50000 characters',
        });
      }
      try {
        JSON.parse(payload);
      } catch {
        throw new BadRequestException({
          error: 'bad_request',
          message: 'payload_json must be valid JSON',
        });
      }
    }
    const now = nowIso();
    const id = newId();
    this.database.sqlite
      .prepare(
        'insert into events (id, user_id, cycle_id, type, payload_json, created_at) values (?, ?, ?, ?, ?, ?)',
      )
      .run(id, userId, cycleId, type, payload, now);
    return {
      id,
      cycle_id: cycleId,
      type,
      payload_json: payload,
      created_at: now,
    };
  }
}
