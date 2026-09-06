import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import { newId, nowIso, str } from '../common/util';
import { DatabaseService } from '../database/database.service';
import type {
  Snapshot,
  SnapshotBody,
  SnapshotListQuery,
} from './snapshots.dto';

const CREATE_FIELDS = [
  'cycle_id',
  'week_number',
  'snapshot_json',
  'captured_at',
] as const;
const UPDATE_FIELDS = CREATE_FIELDS;

const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

function rowToSnapshot(row: Record<string, unknown>): Snapshot {
  return {
    id: String(row.id),
    cycle_id: String(row.cycle_id),
    week_number: Number(row.week_number),
    snapshot_json: String(row.snapshot_json),
    captured_at: String(row.captured_at),
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

function assertWeekNumber(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'week_number must be a positive integer',
    });
  }
  return v;
}

function assertSnapshotJson(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'snapshot_json is required',
    });
  }
  if (Buffer.byteLength(v, 'utf8') > MAX_SNAPSHOT_BYTES) {
    throw new PayloadTooLargeException('payload_too_large');
  }
  return v;
}

function capturedAtOrNow(v: unknown): string {
  if (v === undefined || v === null || str(v) === '') return nowIso();
  const s = str(v);
  if (Number.isNaN(Date.parse(s))) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'captured_at must be an ISO timestamp or null',
    });
  }
  return s;
}

@Injectable()
export class SnapshotsService {
  constructor(private readonly database: DatabaseService) {}

  list(query: SnapshotListQuery): {
    snapshots: Snapshot[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'week_snapshots');
    let sortCol = query.sort ?? 'created_at';
    if (!cols.has(sortCol)) sortCol = 'created_at';

    const where: string[] = [];
    const params: unknown[] = [];
    const cycleId = str(query.cycle_id);
    if (cycleId) {
      where.push('s.cycle_id = ?');
      params.push(cycleId);
    }
    const weekNumber = str(query.week_number);
    if (weekNumber) {
      where.push('s.week_number = ?');
      params.push(Number(weekNumber));
    }
    const flt = buildFilters(cols, query.filters, 's.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from week_snapshots s ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select * from week_snapshots s ${whereSql} order by s."${sortCol}" ${order} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return {
      snapshots: rows.map(rowToSnapshot),
      total: totalRow.n,
      page,
      limit,
    };
  }

  get(id: string): Snapshot {
    const row = this.database.sqlite
      .prepare('select * from week_snapshots where id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToSnapshot(row);
  }

  create(body: SnapshotBody): Snapshot {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, CREATE_FIELDS);
    const cycleId = this.requireCycle(body?.cycle_id);
    const weekNumber = assertWeekNumber(body?.week_number);
    const snapshotJson = assertSnapshotJson(body?.snapshot_json);
    const capturedAt = capturedAtOrNow(body?.captured_at);

    const now = nowIso();
    const id = newId();
    this.database.sqlite
      .prepare(
        'insert into week_snapshots (id, cycle_id, week_number, snapshot_json, captured_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, cycleId, weekNumber, snapshotJson, capturedAt, now, now);
    return this.get(id);
  }

  update(id: string, body: SnapshotBody): Snapshot {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, UPDATE_FIELDS);
    const existing = this.database.sqlite
      .prepare('select * from week_snapshots where id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body?.cycle_id !== undefined) {
      sets.push('cycle_id = ?');
      params.push(this.requireCycle(body.cycle_id));
    }
    if (body?.week_number !== undefined) {
      sets.push('week_number = ?');
      params.push(assertWeekNumber(body.week_number));
    }
    if (body?.snapshot_json !== undefined) {
      sets.push('snapshot_json = ?');
      params.push(assertSnapshotJson(body.snapshot_json));
    }
    if (body?.captured_at !== undefined) {
      sets.push('captured_at = ?');
      params.push(capturedAtOrNow(body.captured_at));
    }
    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id);
    this.database.sqlite
      .prepare(`update week_snapshots set ${sets.join(', ')} where id = ?`)
      .run(...params);
    return this.get(id);
  }

  remove(id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select id from week_snapshots where id = ?')
      .get(id);
    if (!existing) throw new NotFoundException('not_found');
    this.database.sqlite
      .prepare('delete from week_snapshots where id = ?')
      .run(id);
    return { ok: true };
  }

  private requireCycle(cycleId: unknown): string {
    const id = str(cycleId);
    if (!id)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'cycle_id is required',
      });
    const row = this.database.sqlite
      .prepare('select id from cycles where id = ?')
      .get(id);
    if (!row)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'cycle not found',
      });
    return id;
  }
}
