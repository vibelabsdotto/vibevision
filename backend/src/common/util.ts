import { randomUUID } from 'node:crypto';

/** Current timestamp as ISO-8601 (UTC). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** UUID v4 for primary keys (contract §2). */
export function newId(): string {
  return randomUUID();
}

const AMOUNT_SCALE = 1_000_000;

/** Keep quantities stable across decimal arithmetic (port of core normalizeAmount). */
export function normalizeAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * AMOUNT_SCALE) / AMOUNT_SCALE;
}

/** Trimmed string or ''. */
export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Nullable trimmed string (empty → null). */
export function optStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s;
}

/** SQLite INTEGER 0/1 → boolean. */
export function toBool(v: unknown): boolean {
  return v === 1 || v === true;
}

/** ISO date guard (YYYY-MM-DD, real calendar date). */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Monday (UTC) of the ISO week containing `dateStr`. Port of core startOfIsoWeek. */
export function startOfIsoWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

/** Shift an ISO date by `days`. Port of core addDays. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** URL slug from a title. Port of core slugify. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
