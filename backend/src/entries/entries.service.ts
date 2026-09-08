import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type Database from 'better-sqlite3';
import { buildFilters, parseList, tableColumns } from '../common/list-query';
import {
  isIsoDate,
  newId,
  normalizeAmount,
  nowIso,
  str,
  toBool,
} from '../common/util';
import { DatabaseService } from '../database/database.service';
import { getWeekExecutionBlocks } from '../calendar/execution-blocks';
import {
  loadTacticWithPlan,
  resolveBucket,
  type TacticBucket,
} from '../tactics/tactic-access';
import { resolveTacticEntryValue } from './entry-value';
import type {
  TacticEntry,
  TacticEntryBody,
  TacticEntryListQuery,
} from './entries.dto';

const CREATE_FIELDS = [
  'tactic_id',
  'cycle_id',
  'week_number',
  'date',
  'value',
  'completed',
  'note',
] as const;

const UPDATE_FIELDS = ['value', 'completed', 'note', 'date'] as const;

const COLUMNS = [
  'id',
  'tactic_id',
  'cycle_id',
  'week_number',
  'date',
  'value',
  'completed',
  'note',
  'created_at',
  'updated_at',
].join(', ');

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function rowToEntry(row: Record<string, unknown>): TacticEntry {
  return {
    id: String(row.id),
    tactic_id: String(row.tactic_id),
    cycle_id: String(row.cycle_id),
    week_number: Number(row.week_number),
    date: String(row.date),
    value: Number(row.value),
    completed: Number(row.completed),
    note: (row.note as string) ?? '',
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

/**
 * Daily target for a bucket — port of the hooks' getDailyTarget: scheduled
 * blocks for the date win, else the recurring daily/weekday target.
 */
export function dailyTarget(
  sqlite: Database.Database,
  bucket: TacticBucket,
  date: string,
  userId: string,
  excludeEntryId?: string | null,
): number {
  const rows = getWeekExecutionBlocks(
    sqlite,
    userId,
    bucket.cycleId,
    bucket.weekNumber,
    date,
    excludeEntryId,
  ).filter(
    (block) => block.tactic_id === bucket.tactic.id && block.date === date,
  );
  const scheduled = normalizeAmount(
    rows.reduce((sum, row) => sum + row.scheduled_value, 0),
  );
  if (rows.length > 0) return scheduled;
  if (bucket.plan.recurrenceType === 'daily') return bucket.plan.targetValue;
  if (bucket.plan.recurrenceType === 'weekdays') {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return bucket.plan.targetValue;
  }
  return 0;
}

/** Sum of entry values for a tactic/date (optionally excl. one id). */
export function actualForDate(
  sqlite: Database.Database,
  tacticId: string,
  date: string,
  userId: string,
  excludeId?: string,
): number {
  const rows = sqlite
    .prepare(
      `select value, completed from tactic_entries where tactic_id = ? and date = ? and user_id = ?${excludeId ? ' and id != ?' : ''}`,
    )
    .all(
      ...(excludeId
        ? [tacticId, date, userId, excludeId]
        : [tacticId, date, userId]),
    ) as Array<{ value: number; completed: number }>;
  return normalizeAmount(
    rows.reduce((sum, row) => sum + entryCountValue(row, null), 0),
  );
}

/**
 * Countable value of a stored row for daily-cap purposes. Toggle rows count
 * 1 when done; occurrence-boolean legacy completes (value 0 + completed)
 * count 1; everything else counts its stored value.
 */
function entryCountValue(
  row: { value: number; completed: number },
  style: string | null,
): number {
  const value = normalizeAmount(Number(row.value));
  const completed = Number(row.completed) === 1;
  if (style === 'toggle') return completed || value > 0 ? 1 : 0;
  if (completed && value === 0) return 1;
  return value;
}

@Injectable()
export class EntriesService {
  constructor(private readonly database: DatabaseService) {}

  list(
    userId: string,
    query: TacticEntryListQuery,
  ): {
    tactic_entries: TacticEntry[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const cols = tableColumns(this.database.sqlite, 'tactic_entries');
    let sortCol = query.sort ?? 'date';
    if (!cols.has(sortCol)) sortCol = 'date';
    const sortOrder =
      query.sort === undefined && query.order === undefined ? 'desc' : order;

    const where: string[] = ['e.user_id = ?'];
    const params: unknown[] = [userId];
    if (search) {
      where.push('e.note LIKE ?');
      params.push(`%${search}%`);
    }
    for (const [param, col] of [
      [query.tactic_id, 'tactic_id'],
      [query.cycle_id, 'cycle_id'],
      [query.date, 'date'],
    ] as const) {
      const v = str(param);
      if (v) {
        where.push(`e.${col} = ?`);
        params.push(v);
      }
    }
    if (query.week_number !== undefined && str(query.week_number) !== '') {
      const n = Number(query.week_number);
      if (!Number.isInteger(n))
        throw new BadRequestException({
          error: 'bad_request',
          message: 'week_number must be an integer',
        });
      where.push('e.week_number = ?');
      params.push(n);
    }
    for (const [param, op] of [
      [query.from, '>='],
      [query.to, '<='],
    ] as const) {
      const v = str(param);
      if (v) {
        if (!isIsoDate(v))
          throw new BadRequestException({
            error: 'bad_request',
            message: 'from/to must be YYYY-MM-DD',
          });
        where.push(`e.date ${op} ?`);
        params.push(v);
      }
    }
    const flt = buildFilters(cols, query.filters, 'e.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const totalRow = this.database.sqlite
      .prepare(`select count(*) as n from tactic_entries e ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from tactic_entries e ${whereSql} order by e."${sortCol}" ${sortOrder}, e.created_at ${sortOrder} limit ? offset ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
    return {
      tactic_entries: rows.map(rowToEntry),
      total: totalRow.n,
      page,
      limit,
    };
  }

  get(userId: string, id: string): TacticEntry {
    const row = this.database.sqlite
      .prepare(
        `select ${COLUMNS} from tactic_entries where id = ? and user_id = ?`,
      )
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('not_found');
    return rowToEntry(row);
  }

  create(userId: string, body: TacticEntryBody): TacticEntry {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, CREATE_FIELDS);
    const sqlite = this.database.sqlite;
    const ctx = this.resolveWriteContext(sqlite, userId, body ?? {}, null);
    const now = nowIso();
    const id = newId();
    sqlite
      .prepare(
        `insert into tactic_entries (id, user_id, tactic_id, cycle_id, week_number, date, value, completed, note, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        userId,
        ctx.tacticId,
        ctx.cycleId,
        ctx.weekNumber,
        ctx.date,
        ctx.value,
        ctx.completed,
        ctx.note,
        now,
        now,
      );
    return this.get(userId, id);
  }

  update(userId: string, id: string, body: TacticEntryBody): TacticEntry {
    assertNoUnknown((body ?? {}) as Record<string, unknown>, UPDATE_FIELDS);
    const sqlite = this.database.sqlite;
    const existing = sqlite
      .prepare(
        `select ${COLUMNS} from tactic_entries where id = ? and user_id = ?`,
      )
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundException('not_found');
    const merged = { ...(body as Record<string, unknown>) };
    if (merged.date === undefined) merged.date = String(existing.date);
    if (merged.value === undefined) merged.value = Number(existing.value);
    if (merged.completed === undefined) {
      merged.completed = Number(existing.completed) === 1;
    }
    if (merged.tactic_id === undefined) {
      merged.tactic_id = String(existing.tactic_id);
    } else if (str(merged.tactic_id) !== String(existing.tactic_id)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'tactic_id is immutable (delete + recreate)',
      });
    }
    const ctx = this.resolveWriteContext(sqlite, userId, merged, id);
    sqlite
      .prepare(
        'update tactic_entries set date = ?, value = ?, completed = ?, note = ?, week_number = ?, updated_at = ? where id = ? and user_id = ?',
      )
      .run(
        ctx.date,
        ctx.value,
        ctx.completed,
        ctx.note,
        ctx.weekNumber,
        nowIso(),
        id,
        userId,
      );
    return this.get(userId, id);
  }

  remove(userId: string, id: string): { ok: boolean } {
    const existing = this.database.sqlite
      .prepare('select value from tactic_entries where id = ? and user_id = ?')
      .get(id, userId) as { value: number } | undefined;
    if (!existing) throw new NotFoundException('not_found');
    // Port of entryDeleteExecute: negative rows adjust other rows, never delete.
    if (normalizeAmount(Number(existing.value)) < 0) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'Negative tactic entries cannot be deleted directly',
      });
    }
    this.database.sqlite
      .prepare('delete from tactic_entries where id = ? and user_id = ?')
      .run(id, userId);
    return { ok: true };
  }

  /**
   * Undo the latest entry for a tactic+date (port of core undoLatestTacticEntry):
   * value > 1 → decrement, == 1 → delete, otherwise nothing to undo.
   */
  undo(
    userId: string,
    tacticId: string,
    date: string,
  ): { undone: string | null } {
    if (!str(tacticId)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'tactic_id is required',
      });
    }
    if (!isIsoDate(str(date))) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'date must be YYYY-MM-DD',
      });
    }
    const latest = this.database.sqlite
      .prepare(
        'select * from tactic_entries where tactic_id = ? and date = ? and user_id = ? order by created_at desc, id desc limit 1',
      )
      .get(str(tacticId), str(date), userId) as
      Record<string, unknown> | undefined;
    if (!latest) return { undone: null };
    const latestValue = normalizeAmount(Number(latest.value));
    if (latestValue > 1) {
      this.update(userId, String(latest.id), {
        value: normalizeAmount(latestValue - 1),
      });
    } else if (Math.abs(latestValue - 1) < 1 / 1_000_000) {
      this.remove(userId, String(latest.id));
    } else {
      return { undone: null };
    }
    return { undone: String(latest.id) };
  }

  /**
   * Shared write validation — port of entryCreateOrUpdateExecute:
   * bucket match, style value rules, daily-target cap.
   */
  private resolveWriteContext(
    sqlite: Database.Database,
    userId: string,
    body: TacticEntryBody,
    excludeId: string | null,
  ): {
    tacticId: string;
    cycleId: string;
    weekNumber: number;
    date: string;
    value: number;
    completed: number;
    note: string;
  } {
    const tacticId = str(body.tactic_id);
    if (!tacticId)
      throw new BadRequestException({
        error: 'bad_request',
        message: 'tactic_id is required',
      });
    const date =
      body.date === undefined || body.date === null || body.date === ''
        ? todayDateString()
        : str(body.date);
    if (!isIsoDate(date)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'date must be YYYY-MM-DD',
      });
    }
    const { tactic, plan, style } = loadTacticWithPlan(
      sqlite,
      tacticId,
      userId,
    );
    const bucket = resolveBucket(sqlite, tactic, date, userId);
    if (body.cycle_id !== undefined && str(body.cycle_id) !== bucket.cycleId) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'Tactic entry cycle does not match its tactic',
      });
    }
    if (
      body.week_number !== undefined &&
      body.week_number !== null &&
      body.week_number !== '' &&
      Number(body.week_number) !== bucket.weekNumber
    ) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'Tactic entry week does not match its date',
      });
    }

    const completedRaw =
      body.completed === undefined ? undefined : toBool(body.completed);
    let value: number;
    try {
      value = resolveTacticEntryValue(
        plan,
        style,
        coerceValue(body.value),
        completedRaw ?? false,
      );
    } catch (error) {
      throw new BadRequestException({
        error: 'bad_request',
        message:
          error instanceof Error ? error.message : 'Invalid tactic entry value',
      });
    }
    const completedDefault = plan.trackingType === 'boolean' && value > 0;
    const completed = (completedRaw ?? completedDefault) ? 1 : 0;
    if (style === 'toggle' && !(completed === 1 || value > 0)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'Invalid tactic entry value',
      });
    }
    const storedValue =
      style === 'toggle' ? normalizeAmount(Number(body.value ?? 0)) : value;

    const before = normalizeAmount(
      entryRows(sqlite, tacticId, date, userId, excludeId, style).reduce(
        (sum, row) => sum + row,
        0,
      ),
    );
    const counted =
      style === 'toggle'
        ? completed === 1 || storedValue > 0
          ? 1
          : 0
        : completed === 1 && storedValue === 0
          ? 1
          : storedValue;
    const projected = normalizeAmount(before + counted);
    const target = normalizeAmount(
      dailyTarget(
        sqlite,
        { tactic, plan, style, ...bucket },
        date,
        userId,
        excludeId,
      ),
    );
    if (projected < 0) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'Tactic progress cannot be negative for this date',
      });
    }
    if (projected > target) {
      const remaining = normalizeAmount(Math.max(target - before, 0));
      throw new BadRequestException({
        error: 'bad_request',
        message: `Only ${remaining} ${plan.unit || 'units'} remain for this date`,
      });
    }
    return {
      tacticId,
      cycleId: bucket.cycleId,
      weekNumber: bucket.weekNumber,
      date,
      value: storedValue,
      completed,
      note: body.note === undefined || body.note === null ? '' : str(body.note),
    };
  }
}

function coerceValue(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n))
    throw new BadRequestException({
      error: 'bad_request',
      message: 'value must be a number',
    });
  return n;
}

function entryRows(
  sqlite: Database.Database,
  tacticId: string,
  date: string,
  userId: string,
  excludeId: string | null,
  style: string,
): number[] {
  const rows = (
    excludeId
      ? sqlite
          .prepare(
            'select value, completed from tactic_entries where tactic_id = ? and date = ? and user_id = ? and id != ?',
          )
          .all(tacticId, date, userId, excludeId)
      : sqlite
          .prepare(
            'select value, completed from tactic_entries where tactic_id = ? and date = ? and user_id = ?',
          )
          .all(tacticId, date, userId)
  ) as Array<{ value: number; completed: number }>;
  return rows.map((row) => entryCountValue(row, style));
}
