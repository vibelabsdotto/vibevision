/**
 * Pure client-safe helpers (port of the formatting/date/step subset of the old
 * PocketBase core). No I/O — safe for Client Components. Domain logic
 * (scoring, validation) lives in the API.
 */

const AMOUNT_SCALE = 1_000_000;

/** Keep displayed quantities stable across decimal arithmetic. */
export function normalizeAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * AMOUNT_SCALE) / AMOUNT_SCALE;
}

export function amountsEqual(left: number, right: number): boolean {
  return Math.abs(normalizeAmount(left) - normalizeAmount(right)) < 1 / AMOUNT_SCALE;
}

export function formatAmount(n: number): string {
  return String(normalizeAmount(n));
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function getTacticStepDelta(input: {
  direction: "increase" | "decrease";
  todayActual: number;
  todayTarget: number;
}): number {
  const actual = Math.max(normalizeAmount(input.todayActual), 0);
  const target = Math.max(normalizeAmount(input.todayTarget), 0);
  if (input.direction === "increase") {
    const remaining = normalizeAmount(target - actual);
    return remaining > 0 ? Math.min(1, remaining) : 0;
  }
  return actual > 0 ? -Math.min(1, actual) : 0;
}

export function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function startOfIsoWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
