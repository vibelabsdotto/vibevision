import { pb } from "@/app/lib/pb";
import { SETTINGS_KEY_ACTIVE_CYCLE, getSetting, setSetting } from "@/app/core/settings";

export { SETTINGS_KEY_ACTIVE_CYCLE, getSetting, setSetting } from "@/app/core/settings";

export type Cycle = {
  id: string;
  slug: string;
  title: string;
  vision: string | null;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CycleWeek = {
  id: string;
  cycleId: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  label: string;
};

function toCycle(record: Record<string, unknown>): Cycle {
  return {
    id: String(record.id),
    slug: String(record.slug),
    title: String(record.title),
    vision: (record.vision as string) ?? null,
    startDate: String(record.startDate),
    endDate: String(record.endDate),
    status: String(record.status),
    createdAt: String(record.created),
    updatedAt: String(record.updated)
  };
}

export async function createCycle(input: {
  title: string;
  startDate: string;
  vision?: string;
  status?: string;
  slug?: string;
}): Promise<Cycle> {
  const start = startOfIsoWeek(parseDate(input.startDate));
  const end = addDays(start, 83);
  const slugBase = input.slug ?? slugify(input.title);
  let slug = slugBase;
  let index = 1;
  while (await pb.collection("cycles").getFirstListItem(pb.filter("slug = {:s}", { s: slug })).catch(() => null)) {
    index += 1;
    slug = `${slugBase}-${index}`;
  }

  const cycle = await pb.collection("cycles").create({
    slug,
    title: input.title,
    vision: input.vision ?? "",
    startDate: toDateString(start),
    endDate: toDateString(end),
    status: input.status ?? "planned"
  });
  const weeks = Array.from({ length: 12 }).map((_, i) => ({
    cycle: cycle.id,
    weekNumber: i + 1,
    startDate: toDateString(addDays(start, i * 7)),
    endDate: toDateString(addDays(start, i * 7 + 6)),
    label: `Week ${i + 1}`
  }));
  // sequential — the PB SDK auto-cancels parallel identical requests on one client
  for (const week of weeks) {
    await pb.collection("cycle_weeks").create(week);
  }
  if (cycle.status === "active") {
    await activateCycleById(cycle.id);
  }
  return toCycle(cycle);
}

export async function listCycles(): Promise<Cycle[]> {
  const records = await pb.collection("cycles").getFullList({ sort: "-startDate" });
  return records.map(toCycle);
}

export async function getActiveCycle(): Promise<Cycle | null> {
  const activeId = await getSetting(SETTINGS_KEY_ACTIVE_CYCLE);
  if (activeId) {
    const cycle = await pb.collection("cycles").getOne(activeId).catch(rethrowConnectionError);
    if (cycle) return toCycle(cycle);
  }
  const cycle = await pb
    .collection("cycles")
    .getFirstListItem(pb.filter("status = {:status}", { status: "active" }), { sort: "-startDate" })
    .catch(rethrowConnectionError);
  return cycle ? toCycle(cycle) : null;
}

/**
 * Pass-through for collection catches: genuine "not found" (404) stays null,
 * but a dead connection (status 0) is rethrown so callers never mistake an
 * outage for missing data (e.g. "No active cycle").
 */
function rethrowConnectionError(err: unknown): null {
  if ((err as { status?: number })?.status === 0) throw err;
  return null;
}

export async function activateCycleBySlug(slug: string): Promise<Cycle> {
  const cycle = await pb.collection("cycles").getFirstListItem(pb.filter("slug = {:s}", { s: slug }));
  await activateCycleById(cycle.id);
  return toCycle(cycle);
}

export async function activateCycleById(cycleId: string): Promise<void> {
  const active = await pb
    .collection("cycles")
    .getFullList({ filter: pb.filter("status = {:s}", { s: "active" }) });
  for (const record of active) {
    if (record.id !== cycleId) {
      await pb.collection("cycles").update(record.id, { status: "planned" });
    }
  }
  await pb.collection("cycles").update(cycleId, { status: "active" });
  await setSetting(SETTINGS_KEY_ACTIVE_CYCLE, cycleId);
}

export async function getCycleById(cycleId: string): Promise<Cycle | null> {
  const cycle = await pb.collection("cycles").getOne(cycleId).catch(() => null);
  return cycle ? toCycle(cycle) : null;
}

export async function getCycleWeeks(cycleId: string): Promise<CycleWeek[]> {
  const records = await pb.collection("cycle_weeks").getFullList({
    filter: pb.filter("cycle = {:cycle}", { cycle: cycleId }),
    sort: "weekNumber"
  });
  return records.map((record) => ({
    id: String(record.id),
    cycleId: String(record.cycle),
    weekNumber: Number(record.weekNumber),
    startDate: String(record.startDate),
    endDate: String(record.endDate),
    label: String(record.label)
  }));
}

export async function getCurrentWeekNumber(cycleId: string, date: string = todayDateString()): Promise<number | null> {
  const week = await pb
    .collection("cycle_weeks")
    .getFirstListItem(
      pb.filter("cycle = {:cycle} && startDate <= {:d} && endDate >= {:d}", { cycle: cycleId, d: date })
    )
    .catch(() => null);
  return week ? Number(week.weekNumber) : null;
}

export type Goal = {
  id: string;
  cycleId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  status: string;
};

function toGoal(record: Record<string, unknown>): Goal {
  return {
    id: String(record.id),
    cycleId: String(record.cycle),
    title: String(record.title),
    description: (record.description as string) || null,
    sortOrder: Number(record.sortOrder),
    status: String(record.status)
  };
}

export async function addGoal(cycleId: string, title: string, description?: string): Promise<Goal> {
  const existing = await pb.collection("goals").getFullList({
    filter: pb.filter("cycle = {:c}", { c: cycleId })
  });
  if (existing.length >= 3) {
    throw new Error("A cycle may have at most 3 goals");
  }
  const created = await pb.collection("goals").create({
    cycle: cycleId,
    title,
    description: description ?? "",
    sortOrder: existing.length,
    status: "in_progress"
  });
  return toGoal(created);
}

export async function listGoals(cycleId: string): Promise<Goal[]> {
  const records = await pb.collection("goals").getFullList({
    filter: pb.filter("cycle = {:c}", { c: cycleId }),
    sort: "sortOrder,id"
  });
  return records.map(toGoal);
}

export async function updateGoalStatus(goalId: string, status: string): Promise<Goal> {
  const updated = await pb.collection("goals").update(goalId, { status });
  return toGoal(updated);
}

export type LagIndicator = {
  id: string;
  goalId: string;
  title: string;
  type: string;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  achieved: boolean;
  sortOrder: number;
};

function toLag(record: Record<string, unknown>): LagIndicator {
  return {
    id: String(record.id),
    goalId: String(record.goal),
    title: String(record.title),
    type: String(record.type),
    targetValue: record.targetValue === "" || record.targetValue === null ? null : Number(record.targetValue),
    currentValue: record.currentValue === "" || record.currentValue === null ? null : Number(record.currentValue),
    unit: (record.unit as string) || null,
    achieved: Boolean(record.achieved),
    sortOrder: Number(record.sortOrder)
  };
}

export async function addLag(input: {
  goalId: string;
  title: string;
  type: string;
  targetValue?: number;
  unit?: string;
}): Promise<LagIndicator> {
  const existing = await pb.collection("lag_indicators").getFullList({
    filter: pb.filter("goal = {:g}", { g: input.goalId })
  });
  const created = await pb.collection("lag_indicators").create({
    goal: input.goalId,
    title: input.title,
    type: input.type,
    targetValue: input.targetValue ?? "",
    currentValue: "",
    unit: input.unit ?? "",
    achieved: false,
    sortOrder: existing.length
  });
  return toLag(created);
}

export async function listLags(goalId: string): Promise<LagIndicator[]> {
  const records = await pb.collection("lag_indicators").getFullList({
    filter: pb.filter("goal = {:g}", { g: goalId }),
    sort: "sortOrder"
  });
  return records.map(toLag);
}

export async function updateLag(lagId: string, currentValue: number): Promise<LagIndicator> {
  const current = await pb.collection("lag_indicators").getOne(lagId);
  const achieved =
    current.type === "boolean"
      ? currentValue >= 1
      : current.targetValue !== "" && current.targetValue !== null
        ? currentValue >= Number(current.targetValue)
        : false;
  const updated = await pb.collection("lag_indicators").update(lagId, { currentValue, achieved });
  return toLag(updated);
}

export async function markLagDone(lagId: string): Promise<LagIndicator> {
  const updated = await pb.collection("lag_indicators").update(lagId, { achieved: true, currentValue: 1 });
  return toLag(updated);
}

// ---------------------------------------------------------------- utils

export function nowIso() {
  return new Date().toISOString();
}

export function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n));
}

export function startOfIsoWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function statusFromScore(score: number): TrackStatus {
  if (score >= 0.85) return "on_track";
  if (score >= 0.7) return "warning";
  return "off_track";
}

// ---------------------------------------------------------------- tactic types

export type TrackStatus = "on_track" | "warning" | "off_track";

export type TrackingType = "boolean" | "quantity" | "duration";
export type RecurrenceType = "daily" | "weekdays" | "times_per_week" | "once";

export type ExecutionStyle = "toggle" | "occurrence" | "volume";

function isExecutionStyle(value: unknown): value is ExecutionStyle {
  return value === "toggle" || value === "occurrence" || value === "volume";
}

/** Derived style when no (valid) explicit executionStyle is stored — resolved lazily, never backfilled. */
function deriveExecutionStyle(plan: TacticPlan): ExecutionStyle {
  if (plan.trackingType === "boolean") {
    return plan.recurrenceType === "daily" || plan.recurrenceType === "weekdays" ? "toggle" : "occurrence";
  }
  return "volume";
}

function isStyleValidForTracking(style: ExecutionStyle, trackingType: string, plan: TacticPlan): boolean {
  switch (style) {
    case "toggle":
      return trackingType === "boolean";
    case "occurrence":
      // boolean always; quantity only for whole-count ("quantity-integer") targets
      return trackingType === "boolean" || (trackingType === "quantity" && Number.isInteger(plan.targetValue));
    case "volume":
      return trackingType === "quantity" || trackingType === "duration";
  }
}

/**
 * Explicit tactic.executionStyle wins IF valid for the trackingType
 * (toggle⇔boolean, occurrence⇔boolean|quantity-integer, volume⇔quantity|duration).
 * Contradiction → throw with { strict: true } (write paths), ignore + derive otherwise (read paths).
 */
export function resolveExecutionStyle(
  plan: TacticPlan,
  tactic?: { executionStyle?: string | null; trackingType?: string } | null,
  opts?: { strict?: boolean }
): ExecutionStyle {
  const raw = tactic?.executionStyle;
  if (isExecutionStyle(raw)) {
    const trackingType = tactic?.trackingType ?? plan.trackingType;
    if (isStyleValidForTracking(raw, trackingType, plan)) return raw;
    if (opts?.strict) {
      throw new Error(`executionStyle "${raw}" contradicts trackingType "${trackingType}"`);
    }
    return deriveExecutionStyle(plan);
  }
  return deriveExecutionStyle(plan);
}

export type TacticPlan = {
  trackingType: TrackingType;
  recurrenceType: RecurrenceType;
  recurrenceCount: number;
  targetValue: number;
  unit: string;
};

export type TacticEntryValue = {
  tacticId: string;
  date: string | null;
  value: number;
  completed: boolean;
};

export type TacticWeekScore = {
  tacticId: string;
  tacticTitle: string;
  goalId: string;
  goalTitle: string;
  planned: number;
  fullWeekPlanned: number;
  actual: number;
  score: number;
  weight: number;
  status: TrackStatus;
  unit: string;
  trackingType: string;
  recurrenceType: string;
  recurrenceCount: number;
  targetValue: number;
  executionStyle: ExecutionStyle;
};

type LegacyTacticLike = {
  startsWeek: number | null;
  endsWeek: number | null;
  active: boolean;
  type: string;
  trackingType: string;
  recurrenceType: string;
  recurrenceCount: number;
  targetValue: number;
  targetPerWeek: number | null;
  targetPerDay: number | null;
  unit: string;
  executionStyle?: string | null;
};

export function resolveTacticPlan(tactic: LegacyTacticLike, opts?: { strict?: boolean }): TacticPlan {
  if (tactic.trackingType && tactic.recurrenceType) {
    if (opts?.strict) {
      if (tactic.trackingType !== "boolean" && tactic.trackingType !== "quantity" && tactic.trackingType !== "duration") {
        throw new Error(`Unknown trackingType: ${tactic.trackingType}`);
      }
      if (tactic.recurrenceType !== "daily" && tactic.recurrenceType !== "weekdays" && tactic.recurrenceType !== "times_per_week" && tactic.recurrenceType !== "once") {
        throw new Error(`Unknown recurrenceType: ${tactic.recurrenceType}`);
      }
    }
    return {
      trackingType: tactic.trackingType as TrackingType,
      recurrenceType: tactic.recurrenceType as RecurrenceType,
      recurrenceCount: Math.max(1, Number(tactic.recurrenceCount ?? 1)),
      targetValue: Number(tactic.targetValue ?? 1),
      unit: String(tactic.unit)
    };
  }
  switch (tactic.type) {
    case "weekly_hours":
      return { trackingType: "duration", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: Number(tactic.targetPerWeek ?? 0), unit: tactic.unit };
    case "weekly_count":
      return { trackingType: "quantity", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: Number(tactic.targetPerWeek ?? 0), unit: tactic.unit };
    case "daily_checkbox":
      return { trackingType: "boolean", recurrenceType: "daily", recurrenceCount: 1, targetValue: Number(tactic.targetPerDay ?? 1), unit: tactic.unit };
    case "one_time":
      return { trackingType: "boolean", recurrenceType: "once", recurrenceCount: 1, targetValue: 1, unit: tactic.unit };
    case "habit":
      return Number(tactic.targetPerWeek ?? 0) >= 7
        ? { trackingType: "boolean", recurrenceType: "daily", recurrenceCount: 1, targetValue: 1, unit: tactic.unit }
        : { trackingType: "boolean", recurrenceType: "times_per_week", recurrenceCount: Math.max(1, Number(tactic.targetPerWeek ?? 1)), targetValue: 1, unit: tactic.unit };
    default:
      // Silent default: snapshot reads must stay parseable (v1, no v2 yet).
      // Write paths call resolveTacticPlan(tactic, { strict: true }) and throw here instead.
      if (opts?.strict) throw new Error(`Unknown tactic type: ${tactic.type}`);
      return { trackingType: "boolean", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 1, unit: tactic.unit };
  }
}

export function getOccurrenceTarget(plan: TacticPlan) {
  return Number(plan.targetValue);
}

export function getPlannedWeeklyTarget(plan: TacticPlan) {
  switch (plan.recurrenceType) {
    case "daily":
      return plan.targetValue * 7;
    case "weekdays":
      return plan.targetValue * 5;
    case "times_per_week":
      return plan.targetValue * plan.recurrenceCount;
    case "once":
      return plan.targetValue;
  }
}

export function isTacticActiveInWeek(
  tactic: Pick<LegacyTacticLike, "startsWeek" | "endsWeek" | "active">,
  weekNumber: number,
  schedule?: { required: boolean } | null
) {
  if (schedule) return schedule.required;
  return (
    tactic.active &&
    (tactic.startsWeek === null || tactic.startsWeek <= weekNumber) &&
    (tactic.endsWeek === null || tactic.endsWeek >= weekNumber)
  );
}

export function isWeekdayDate(date: string) {
  const weekday = parseDate(date).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

export function isDueToday(plan: TacticPlan, date: string, weeklyRemaining: number, todayProgress: number, activeInWeek: boolean) {
  if (!activeInWeek) return false;
  switch (plan.recurrenceType) {
    case "daily":
      return todayProgress < plan.targetValue;
    case "weekdays":
      return isWeekdayDate(date) && todayProgress < plan.targetValue;
    case "times_per_week":
      return plan.trackingType === "boolean" ? weeklyRemaining > 0 && todayProgress < plan.targetValue : weeklyRemaining > 0;
    case "once":
      return weeklyRemaining > 0 && todayProgress < plan.targetValue;
  }
}

export function getActualProgress(plan: TacticPlan, entries: TacticEntryValue[]) {
  const style = deriveExecutionStyle(plan);
  if (style === "toggle") {
    // One done-day counts once: a double-complete on the same date no longer inflates.
    const doneDates = new Set<string>();
    let undated = 0;
    for (const entry of entries) {
      if (!(entry.completed || entry.value > 0)) continue;
      if (entry.date) doneDates.add(entry.date);
      else undated += 1;
    }
    return doneDates.size + undated;
  }
  if (style === "occurrence" && plan.trackingType === "boolean") {
    // Whole occurrences; legacy boolean completes (value 0 + completed) still count 1.
    return Math.max(
      0,
      entries.reduce(
        (sum, entry) => sum + (entry.completed || entry.value > 0 ? Math.max(1, Number(entry.value)) : Number(entry.value)),
        0
      )
    );
  }
  return Math.max(0, entries.reduce((sum, entry) => sum + Number(entry.value), 0));
}

export function getTodayProgress(plan: TacticPlan, entries: TacticEntryValue[], date: string) {
  return getActualProgress(plan, entries.filter((entry) => entry.date === date));
}

// ---------------------------------------------------------------- tactics CRUD

export type Tactic = {
  id: string;
  goalId: string;
  title: string;
  type: string;
  trackingType: string;
  recurrenceType: string;
  recurrenceCount: number;
  targetValue: number;
  unit: string;
  executionStyle?: string;
  targetPerWeek: number | null;
  targetPerDay: number | null;
  scoringWeight: number;
  startsWeek: number | null;
  endsWeek: number | null;
  active: boolean;
  sortOrder: number;
};

function toTactic(record: Record<string, unknown>): Tactic {
  return {
    id: String(record.id),
    goalId: String(record.goal),
    title: String(record.title),
    type: String(record.type),
    trackingType: String(record.trackingType),
    recurrenceType: String(record.recurrenceType),
    recurrenceCount: Number(record.recurrenceCount),
    targetValue: Number(record.targetValue),
    unit: String(record.unit),
    // Unvalidated string at the boundary — validated in resolveExecutionStyle.
    executionStyle: (record.executionStyle as string) || undefined,
    targetPerWeek: record.targetPerWeek === "" || record.targetPerWeek === null ? null : Number(record.targetPerWeek),
    targetPerDay: record.targetPerDay === "" || record.targetPerDay === null ? null : Number(record.targetPerDay),
    scoringWeight: Number(record.scoringWeight),
    // PB stores null numbers as 0; week numbers are 1-based so 0 means "unset"
    startsWeek: record.startsWeek === "" || record.startsWeek === null || Number(record.startsWeek) === 0 ? null : Number(record.startsWeek),
    endsWeek: record.endsWeek === "" || record.endsWeek === null || Number(record.endsWeek) === 0 ? null : Number(record.endsWeek),
    active: Boolean(record.active),
    sortOrder: Number(record.sortOrder)
  };
}

export type AddTacticInput = {
  goalId: string;
  title: string;
  type?: string;
  trackingType?: TrackingType;
  recurrenceType?: RecurrenceType;
  recurrenceCount?: number;
  targetValue?: number;
  unit?: string;
  target?: number;
  scoringWeight?: number;
  week?: number | null;
  startsWeek?: number | null;
  endsWeek?: number | null;
};

function buildLegacyType(input: { type?: string; trackingType: TrackingType; recurrenceType: RecurrenceType; recurrenceCount: number; targetValue: number }) {
  if (input.type) return input.type;
  if (input.recurrenceType === "once") return "one_time";
  if (input.recurrenceType === "daily" && input.trackingType === "boolean" && input.targetValue === 1) return "daily_checkbox";
  if (input.recurrenceType === "times_per_week" && input.trackingType === "duration" && input.recurrenceCount === 1) return "weekly_hours";
  if (input.recurrenceType === "times_per_week" && input.trackingType === "quantity" && input.recurrenceCount === 1) return "weekly_count";
  if (input.trackingType === "boolean" && input.targetValue === 1) return "habit";
  return "tracked";
}

function normalizePlan(input: AddTacticInput) {
  if (input.trackingType && input.recurrenceType) {
    return {
      trackingType: input.trackingType,
      recurrenceType: input.recurrenceType,
      recurrenceCount: Math.max(1, input.recurrenceCount ?? 1),
      targetValue: Number(input.targetValue ?? input.target ?? 1)
    };
  }
  switch (input.type) {
    case "weekly_hours":
      return { trackingType: "duration" as const, recurrenceType: "times_per_week" as const, recurrenceCount: 1, targetValue: Number(input.target ?? 0) };
    case "weekly_count":
      return { trackingType: "quantity" as const, recurrenceType: "times_per_week" as const, recurrenceCount: 1, targetValue: Number(input.target ?? 0) };
    case "one_time":
      return { trackingType: "boolean" as const, recurrenceType: "once" as const, recurrenceCount: 1, targetValue: 1 };
    case "daily_checkbox":
      return { trackingType: "boolean" as const, recurrenceType: "daily" as const, recurrenceCount: 1, targetValue: Number(input.target ?? 1) };
    case "habit":
      return Number(input.target ?? 0) >= 7
        ? { trackingType: "boolean" as const, recurrenceType: "daily" as const, recurrenceCount: 1, targetValue: 1 }
        : { trackingType: "boolean" as const, recurrenceType: "times_per_week" as const, recurrenceCount: Math.max(1, Number(input.target ?? 1)), targetValue: 1 };
    default:
      return { trackingType: "boolean" as const, recurrenceType: "times_per_week" as const, recurrenceCount: 1, targetValue: Number(input.target ?? 1) };
  }
}

export async function addTactic(input: AddTacticInput): Promise<Tactic> {
  const goal = await pb.collection("goals").getOne(input.goalId).catch(() => null);
  if (!goal) throw new Error(`Goal not found: ${input.goalId}`);
  const existing = await pb.collection("tactics").getFullList({
    filter: pb.filter("goal = {:g}", { g: input.goalId })
  });
  const week = input.week ?? null;
  const plan = normalizePlan(input);
  const unit =
    input.unit ??
    (plan.trackingType === "duration" ? "hours" : plan.trackingType === "quantity" ? "count" : "done");
  const created = await pb.collection("tactics").create({
    goal: input.goalId,
    title: input.title,
    type: buildLegacyType({ type: input.type, ...plan }),
    trackingType: plan.trackingType,
    recurrenceType: plan.recurrenceType,
    recurrenceCount: plan.recurrenceCount,
    targetValue: plan.targetValue,
    unit,
    targetPerWeek: plan.recurrenceType === "once" ? "" : input.target ?? getPlannedWeeklyTarget({ ...plan, unit }),
    targetPerDay: plan.recurrenceType === "daily" ? plan.targetValue : "",
    scoringWeight: input.scoringWeight ?? 1,
    startsWeek: week ?? input.startsWeek ?? "",
    endsWeek: week ?? input.endsWeek ?? "",
    active: true,
    sortOrder: existing.length
  });
  const tactic = toTactic(created);
  if (plan.recurrenceType === "once" && week) {
    await pb.collection("tactic_schedules").create({
      tactic: tactic.id,
      weekNumber: week,
      plannedTarget: plan.targetValue,
      required: true
    });
  }
  return tactic;
}

export async function listTactics(cycleId?: string): Promise<Array<{ tactic: Tactic; goalTitle: string }>> {
  const filter = cycleId ? pb.filter("goal.cycle = {:c}", { c: cycleId }) : "";
  const records = await pb.collection("tactics").getFullList({
    filter,
    sort: "sortOrder,id",
    expand: "goal"
  });
  // order by goal.sortOrder first (client-side: PB cannot sort by multi-level reliably here)
  return records
    .map((record) => {
      const goal = record.expand?.goal as Record<string, unknown> | undefined;
      return {
        tactic: toTactic(record),
        goalTitle: String(goal?.title ?? "Unknown goal"),
        goalSortOrder: Number(goal?.sortOrder ?? 0)
      };
    })
    .sort((left, right) =>
      left.goalSortOrder - right.goalSortOrder ||
      left.tactic.sortOrder - right.tactic.sortOrder ||
      left.tactic.id.localeCompare(right.tactic.id)
    )
    .map(({ goalSortOrder: _goalSortOrder, ...row }) => row);
}

export async function getTactic(tacticId: string): Promise<Tactic | null> {
  const tactic = await pb.collection("tactics").getOne(tacticId).catch(() => null);
  return tactic ? toTactic(tactic) : null;
}

/** Pure entry-value guard matrix (used by addTacticEntry, unit-tested directly). */
export function resolveTacticEntryValue(plan: TacticPlan, style: ExecutionStyle, value?: number): number {
  if (style === "occurrence") {
    const effective = value ?? 1;
    if (!Number.isInteger(effective) || effective <= 0) {
      throw new Error(`occurrence tactics need a positive whole value (got ${String(value)})`);
    }
    return effective;
  }
  if (plan.trackingType === "quantity") return value ?? 1;
  if (plan.trackingType === "duration") {
    if (value === undefined || value === null) throw new Error("duration tactics need a value (minutes)");
    return value;
  }
  return value ?? 1;
}

export async function addTacticEntry(input: {
  tacticId: string;
  cycleId?: string;
  weekNumber?: number;
  value?: number;
  completed?: boolean;
  date?: string | null;
  note?: string | null;
}) {
  const tactic = await getTactic(input.tacticId);
  if (!tactic) throw new Error(`Tactic not found: ${input.tacticId}`);
  const goal = await pb.collection("goals").getOne(tactic.goalId);
  const cycleId = input.cycleId ?? String(goal.cycle);
  const date = input.date === "today" || !input.date ? todayDateString() : input.date;
  const weekNumber = input.weekNumber ?? (await getCurrentWeekNumber(cycleId, date));
  if (!weekNumber) throw new Error("Date is not inside the cycle");
  const plan = resolveTacticPlan(tactic, { strict: true });
  const style = resolveExecutionStyle(plan, tactic, { strict: true });
  const entryValue = resolveTacticEntryValue(plan, style, input.value);
  const completed = input.completed ?? (plan.trackingType === "boolean" ? entryValue > 0 : false);
  const created = await pb.collection("tactic_entries").create({
    tactic: input.tacticId,
    cycle: cycleId,
    weekNumber,
    date: input.date ? date : "",
    value: entryValue,
    completed,
    note: input.note ?? ""
  });
  return created;
}

export async function completeTactic(tacticId: string, date?: string) {
  return addTacticEntry({ tacticId, completed: true, value: 1, date: date ?? todayDateString() });
}

export async function maybeLogDailyCheckinTactic(
  cycleId: string,
  kind: "morning" | "evening",
  date: string
) {
  const matches = await pb.collection("tactics").getFullList({
    filter: pb.filter("goal.cycle = {:c} && unit = {:u}", { c: cycleId, u: "checkins" })
  });
  const tactic = matches[0];
  if (!tactic) return null;
  return addTacticEntry({
    tacticId: String(tactic.id),
    cycleId,
    date,
    value: 1,
    completed: true,
    note: `${kind} check-in`
  });
}

export async function getTodayTactics() {
  const active = await getActiveCycle();
  if (!active) return [];
  return listTactics(active.id);
}

// ---------------------------------------------------------------- daily logs

export type DailyLog = {
  id: string;
  cycleId: string;
  date: string;
  oneThing: string | null;
  morningDone: boolean;
  eveningDone: boolean;
  stressLevel: number | null;
  agencyScore: number | null;
  comfortZoneDone: boolean;
  deepWorkMinutes: number;
  avoidanceTrigger: string | null;
  privateVictories: string | null;
  notes: string | null;
};

function toDailyLog(record: Record<string, unknown>): DailyLog {
  return {
    id: String(record.id),
    cycleId: String(record.cycle),
    date: String(record.date),
    oneThing: (record.oneThing as string) || null,
    morningDone: Boolean(record.morningDone),
    eveningDone: Boolean(record.eveningDone),
    stressLevel: record.stressLevel === null ? null : Number(record.stressLevel),
    agencyScore: record.agencyScore === null ? null : Number(record.agencyScore),
    comfortZoneDone: Boolean(record.comfortZoneDone),
    deepWorkMinutes: Number(record.deepWorkMinutes ?? 0),
    avoidanceTrigger: (record.avoidanceTrigger as string) || null,
    privateVictories: (record.privateVictories as string) || null,
    notes: (record.notes as string) || null
  };
}

export async function getDailyLog(cycleId: string, date: string): Promise<DailyLog | null> {
  const log = await pb
    .collection("daily_logs")
    .getFirstListItem(pb.filter("cycle = {:c} && date = {:d}", { c: cycleId, d: date }))
    .catch(() => null);
  return log ? toDailyLog(log) : null;
}

async function ensureDailyLog(cycleId: string, date: string): Promise<DailyLog> {
  const existing = await getDailyLog(cycleId, date);
  if (existing) return existing;
  const created = await pb.collection("daily_logs").create({ cycle: cycleId, date });
  return toDailyLog(created);
}

export async function morning(input: { oneThing?: string; stress?: number; date?: string }) {
  const active = await getActiveCycle();
  if (!active) throw new Error("No active cycle");
  const date = input.date ?? todayDateString();
  const existing = await ensureDailyLog(active.id, date);
  const updated = await pb.collection("daily_logs").update(existing.id, {
    oneThing: input.oneThing ?? existing.oneThing ?? "",
    stressLevel: input.stress ?? existing.stressLevel ?? "",
    morningDone: true
  });
  await maybeLogDailyCheckinTactic(active.id, "morning", date);
  return toDailyLog(updated);
}

export async function evening(input: {
  agency?: number;
  stress?: number;
  wins?: string;
  avoidance?: string;
  notes?: string;
  deepWorkMinutes?: number;
  comfortZoneDone?: boolean;
  date?: string;
}) {
  const active = await getActiveCycle();
  if (!active) throw new Error("No active cycle");
  const date = input.date ?? todayDateString();
  const existing = await ensureDailyLog(active.id, date);
  const updated = await pb.collection("daily_logs").update(existing.id, {
    agencyScore: input.agency ?? existing.agencyScore ?? "",
    stressLevel: input.stress ?? existing.stressLevel ?? "",
    privateVictories: input.wins ?? existing.privateVictories ?? "",
    avoidanceTrigger: input.avoidance ?? existing.avoidanceTrigger ?? "",
    notes: input.notes ?? existing.notes ?? "",
    deepWorkMinutes: input.deepWorkMinutes ?? existing.deepWorkMinutes ?? 0,
    comfortZoneDone: input.comfortZoneDone ?? existing.comfortZoneDone,
    eveningDone: true
  });
  await maybeLogDailyCheckinTactic(active.id, "evening", date);
  return toDailyLog(updated);
}

// ---------------------------------------------------------------- scoring (port of src/core/scoring.ts)

export type WeekScore = {
  cycleId: string;
  weekNumber: number;
  weeklyScore: number;
  status: TrackStatus;
  goalScores: Array<{ goalId: string; goalTitle: string; score: number; status: TrackStatus }>;
  tacticScores: TacticWeekScore[];
};

function getElapsedDaysInWeek(weekStartDate: string, asOfDate: string) {
  const start = parseDate(weekStartDate);
  const end = parseDate(asOfDate);
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(0, Math.min(diffDays, 7));
}

function getElapsedWeekdaysInWeek(weekStartDate: string, asOfDate: string) {
  const elapsedDays = getElapsedDaysInWeek(weekStartDate, asOfDate);
  let weekdays = 0;
  for (let offset = 0; offset < elapsedDays; offset += 1) {
    const date = new Date(parseDate(weekStartDate));
    date.setUTCDate(date.getUTCDate() + offset);
    const weekday = date.getUTCDay();
    if (weekday >= 1 && weekday <= 5) weekdays += 1;
  }
  return weekdays;
}

function getPreviousDate(date: string) {
  const previous = parseDate(date);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function getScoringCutoffDate(
  weekStartDate: string | null,
  weekEndDate: string | null,
  asOfDate: string,
  options?: { includeAsOfDate?: boolean }
) {
  if (!weekStartDate || !weekEndDate) return asOfDate;
  if (asOfDate < weekStartDate || asOfDate > weekEndDate) return asOfDate;
  if (options?.includeAsOfDate) return asOfDate;
  return getPreviousDate(asOfDate);
}

export function getPlannedTargetForDate(params: {
  plan: TacticPlan;
  fullWeekPlanned: number;
  blocks: Array<{ date: string; plannedValue: number }>;
  weekStartDate: string | null;
  weekEndDate: string | null;
  scoringCutoffDate: string;
}) {
  const { plan, fullWeekPlanned, blocks, weekStartDate, weekEndDate, scoringCutoffDate } = params;
  if (blocks.length > 0) {
    return blocks
      .filter((block) => !weekStartDate || !weekEndDate || (block.date >= weekStartDate && block.date <= weekEndDate))
      .filter((block) =>
        weekStartDate && weekEndDate && scoringCutoffDate >= weekStartDate && scoringCutoffDate <= weekEndDate
          ? block.date <= scoringCutoffDate
          : true
      )
      .reduce((sum, block) => sum + Number(block.plannedValue), 0);
  }

  if (!weekStartDate || !weekEndDate || scoringCutoffDate < weekStartDate || scoringCutoffDate > weekEndDate) {
    return fullWeekPlanned;
  }

  const elapsedDays = getElapsedDaysInWeek(weekStartDate, scoringCutoffDate);
  const style = deriveExecutionStyle(plan);
  if (style === "toggle") {
    switch (plan.recurrenceType) {
      case "daily":
        return plan.targetValue * elapsedDays;
      case "weekdays":
        return plan.targetValue * getElapsedWeekdaysInWeek(weekStartDate, scoringCutoffDate);
      default:
        return fullWeekPlanned;
    }
  }
  if (style === "occurrence") {
    // Floor pace for flexible weekly pools (no prorata fractions).
    switch (plan.recurrenceType) {
      case "times_per_week":
        return Math.floor(fullWeekPlanned * (elapsedDays / 7));
      case "once":
        return fullWeekPlanned;
      default:
        return fullWeekPlanned;
    }
  }
  // Volume keeps the exact prorata pace.
  switch (plan.recurrenceType) {
    case "daily":
      return plan.targetValue * elapsedDays;
    case "weekdays":
      return plan.targetValue * getElapsedWeekdaysInWeek(weekStartDate, scoringCutoffDate);
    case "times_per_week":
      return fullWeekPlanned * (elapsedDays / 7);
    case "once":
      return fullWeekPlanned;
  }
}

export async function getWeekScore(cycleId: string, weekNumber: number, options?: { asOfDate?: string; includeAsOfDate?: boolean; snapshotRow?: Awaited<ReturnType<typeof getWeekSnapshot>> }) {
  const asOfDate = options?.asOfDate ?? todayDateString();
  const snapshotRow = options?.snapshotRow ?? (await getWeekSnapshot(cycleId, weekNumber));
  const snapshot = snapshotRow?.snapshot;
  const weekRow =
    snapshot?.week ??
    (await pb
      .collection("cycle_weeks")
      .getFirstListItem(pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycleId, w: weekNumber }))
      .catch(() => null));
  const tacticRows = snapshot
    ? snapshot.tactics.map((tactic) => ({
        tactic: { ...tactic, goalId: String(tactic.goalId) } as Tactic,
        goalTitle: snapshot.goals.find((goal) => String(goal.id) === String(tactic.goalId))?.title ?? "Unknown goal"
      }))
    : await listTactics(cycleId);
  const scheduleRows = snapshot?.tacticSchedules ?? (await pb.collection("tactic_schedules").getFullList());
  const calendarBlocks = snapshot?.tacticCalendarBlocks
    ? snapshot.tacticCalendarBlocks.map((block) => ({
        tacticId: String(block.tacticId),
        date: block.date,
        plannedValue: Number(block.plannedValue)
      }))
    : (
        await pb.collection("tactic_calendar_blocks").getFullList({
          filter: pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycleId, w: weekNumber })
        })
      ).map((block) => ({
        tacticId: String(block.tactic),
        date: String(block.date),
        plannedValue: Number(block.plannedValue)
      }));
  const weekStartDate = weekRow?.startDate ?? snapshot?.week?.startDate ?? null;
  const weekEndDate = weekRow?.endDate ?? snapshot?.week?.endDate ?? null;
  const scoringCutoffDate = getScoringCutoffDate(weekStartDate, weekEndDate, asOfDate, { includeAsOfDate: options?.includeAsOfDate });
  const entryRecords = await pb.collection("tactic_entries").getFullList({
    filter: pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycleId, w: weekNumber })
  });
  const entries = entryRecordsToValues(entryRecords);
  const scores = scoreTacticsForWeek({
    weekNumber,
    asOfDate,
    includeAsOfDate: options?.includeAsOfDate,
    tacticRows,
    scheduleRows,
    calendarBlocks,
    entries,
    weekStartDate,
    weekEndDate,
    hasSnapshot: Boolean(snapshot)
  });

  const weeklyScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score.score, 0) / scores.length : 0;
  const goalScores = goalScoresFromTacticScores(scores);

  return {
    cycleId,
    weekNumber,
    weeklyScore,
    status: statusFromScore(weeklyScore),
    goalScores,
    tacticScores: scores
  } satisfies WeekScore;
}

/** Pace status for occurrence pools: actual vs floor(N * elapsed/7). Nothing due yet → on_track. */
function occurrencePaceStatus(weekTarget: number, actual: number, weekStartDate: string | null, scoringCutoffDate: string): TrackStatus {
  if (!weekStartDate) return statusFromScore(weekTarget > 0 ? Math.min(actual / weekTarget, 1) : actual > 0 ? 1 : 0);
  const paceFloor = Math.floor(weekTarget * (getElapsedDaysInWeek(weekStartDate, scoringCutoffDate) / 7));
  if (paceFloor <= 0) return "on_track";
  return statusFromScore(Math.min(actual / paceFloor, 1));
}

/** Pure reimplementation of getWeekScore's per-tactic reduce over pre-fetched rows. */
function scoreTacticsForWeek(input: {
  weekNumber: number;
  asOfDate: string;
  includeAsOfDate?: boolean;
  tacticRows: Array<{ tactic: Tactic; goalTitle: string }>;
  scheduleRows: Array<{ tacticId?: unknown; weekNumber?: unknown; plannedTarget?: unknown; required?: unknown }>;
  calendarBlocks: Array<{ tacticId: string; date: string; plannedValue: number }>;
  entries: TacticEntryValue[];
  weekStartDate: string | null;
  weekEndDate: string | null;
  hasSnapshot: boolean;
}): TacticWeekScore[] {
  const { weekNumber, asOfDate, includeAsOfDate, tacticRows, scheduleRows, calendarBlocks, entries, weekStartDate, weekEndDate, hasSnapshot } = input;
  const scoringCutoffDate = getScoringCutoffDate(weekStartDate, weekEndDate, asOfDate, { includeAsOfDate });
  return tacticRows.reduce<TacticWeekScore[]>((acc, { tactic, goalTitle }) => {
    const schedule = scheduleRows.find(
      (row) => {
        const tacticIdValue = (row as unknown as { tactic?: unknown }).tactic ?? row.tacticId;
        return String(tacticIdValue ?? "") === tactic.id && Number(row.weekNumber) === weekNumber;
      }
    );
    const activeInWeek = hasSnapshot
      ? true
      : isTacticActiveInWeek(tactic, weekNumber, schedule ? { required: Boolean(schedule.required) } : null);
    if (!activeInWeek) return acc;
    // Read path (live rows AND v1 snapshots): silent default, contradictions derive.
    const plan = resolveTacticPlan(tactic);
    const style = resolveExecutionStyle(plan, tactic);
    const fullWeekPlanned = Number(
      schedule?.plannedTarget ??
        (plan.recurrenceType === "once"
          ? tactic.startsWeek === weekNumber || tactic.endsWeek === weekNumber
            ? plan.targetValue
            : 0
          : getPlannedWeeklyTarget(plan))
    );
    const planned = Number(
      getPlannedTargetForDate({
        plan,
        fullWeekPlanned,
        blocks: calendarBlocks.filter((block) => block.tacticId === tactic.id),
        weekStartDate,
        weekEndDate,
        scoringCutoffDate
      })
    );
    if (planned <= 0 && entries.every((entry) => entry.tacticId !== tactic.id)) {
      return acc;
    }
    const tacticEntriesForWeek = entries.filter((entry) => entry.tacticId === tactic.id);
    const actual = getActualProgress(plan, tacticEntriesForWeek);
    // Toggle: min(doneDueDays/dueDaysElapsed, 1) — actual is already clamped per date.
    // Occurrence: min(actual/N, 1) with pace status vs floor(N*elapsed/7). Volume: unchanged.
    const score =
      style === "occurrence"
        ? fullWeekPlanned > 0
          ? Math.min(actual / fullWeekPlanned, 1)
          : actual > 0
            ? 1
            : 0
        : style === "toggle"
          ? planned > 0
            ? Math.min(actual / planned, 1)
            : actual > 0
              ? 1
              : 0
          : getTacticExecutionScore(plan, planned, actual);
    const tacticStatus =
      style === "occurrence"
        ? occurrencePaceStatus(fullWeekPlanned, actual, weekStartDate, scoringCutoffDate)
        : statusFromScore(score);
    acc.push({
      tacticId: tactic.id,
      tacticTitle: tactic.title,
      goalId: tactic.goalId,
      goalTitle,
      planned,
      fullWeekPlanned,
      actual,
      score,
      weight: Number(tactic.scoringWeight),
      status: tacticStatus,
      unit: tactic.unit,
      trackingType: plan.trackingType,
      recurrenceType: plan.recurrenceType,
      recurrenceCount: plan.recurrenceCount,
      targetValue: plan.targetValue,
      executionStyle: style
    });
    return acc;
  }, []);
}

function goalScoresFromTacticScores(scores: TacticWeekScore[]) {
  return Object.values(
    scores.reduce<Record<string, { goalId: string; goalTitle: string; total: number; count: number }>>((acc, score) => {
      acc[score.goalId] ??= { goalId: score.goalId, goalTitle: score.goalTitle, total: 0, count: 0 };
      acc[score.goalId].total += score.score;
      acc[score.goalId].count += 1;
      return acc;
    }, {})
  ).map((row) => ({
    goalId: row.goalId,
    goalTitle: row.goalTitle,
    score: row.count > 0 ? row.total / row.count : 0,
    status: statusFromScore(row.count > 0 ? row.total / row.count : 0)
  }));
}

export function getTacticExecutionScore(plan: TacticPlan, planned: number, actual: number) {
  const safeActual = Math.max(0, actual);
  if (planned <= 0) return safeActual > 0 ? 1 : 0;
  if (plan.recurrenceType === "once") return safeActual >= planned ? 1 : 0;
  if (planned > 1) return Math.min(safeActual / planned, 1);
  return safeActual >= planned ? 1 : 0;
}

/**
 * Overall execution score across all weeks of a cycle that have started
 * (past + current). Future weeks are excluded — they have no data yet.
 *
 * Batch variant: scores every started week from four shared fetches
 * (cycle_weeks, tactics, tactic_schedules, tactic_entries) instead of six
 * requests per week — the dashboard went from ~48 sequential round-trips
 * to four.
 */
export async function getOverallScore(cycleId: string, currentWeek: number): Promise<{ score: number; status: TrackStatus; weeksScored: number }> {
  const weeks = await getCycleWeeks(cycleId);
  const started = weeks.filter((week) => week.weekNumber <= currentWeek);
  if (!started.length) return { score: 0, status: "off_track", weeksScored: 0 };

  const asOfDate = todayDateString();
  const [tacticRows, scheduleRecords, entryRecords] = (await Promise.all([
    listTactics(cycleId),
    pb.collection("tactic_schedules").getFullList(),
    pb.collection("tactic_entries").getFullList({ filter: pb.filter("cycle = {:c}", { c: cycleId }) })
  ])) as unknown as [Tactic[], Array<Record<string, unknown>>, Array<Record<string, unknown>>];
  // regroup entries per weekNumber via the raw records (they carry weekNumber)
  const entriesPerWeek = new Map<number, TacticEntryValue[]>();
  for (const record of entryRecords) {
    const weekNumber = Number(record.weekNumber);
    if (!Number.isFinite(weekNumber)) continue;
    const list = entriesPerWeek.get(weekNumber) ?? [];
    list.push({ tacticId: String(record.tactic), date: record.date ? String(record.date) : null, value: Number(record.value), completed: Boolean(record.completed) });
    entriesPerWeek.set(weekNumber, list);
  }

  let total = 0;
  for (const week of started) {
    const weekEntries = entriesPerWeek.get(week.weekNumber) ?? [];
    const scores = scoreTacticsForWeek({
      weekNumber: week.weekNumber,
      asOfDate,
      tacticRows: tacticRows.map((tactic) => ({ tactic, goalTitle: "Overall" })),
      scheduleRows: scheduleRecords,
      calendarBlocks: [],
      entries: weekEntries,
      weekStartDate: week.startDate,
      weekEndDate: week.endDate,
      hasSnapshot: false
    });
    total += scores.length > 0 ? scores.reduce((sum, score) => sum + score.score, 0) / scores.length : 0;
  }
  const score = total / started.length;
  return { score, status: statusFromScore(score), weeksScored: started.length };
}

/**
 * Score every started week of a cycle in one batch: four fetches total
 * (cycle_weeks via getCycleWeeks caller-side, tactics+expand, tactic_schedules,
 * tactic_entries) instead of six requests per week. Returns WeekScore objects
 * identical to getWeekScore's output (minus calendar-block precision — weeks
 * are scored against the full weekly plan, which is the /weeks overview use case).
 */
export async function getWeekScoresBatch(cycleId: string, weekNumbers: number[]): Promise<Map<number, WeekScore>> {
  const result = new Map<number, WeekScore>();
  if (!weekNumbers.length) return result;

  const asOfDate = todayDateString();
  const [tacticRows, scheduleRecords, entryRecords] = (await Promise.all([
    listTactics(cycleId),
    pb.collection("tactic_schedules").getFullList(),
    pb.collection("tactic_entries").getFullList({ filter: pb.filter("cycle = {:c}", { c: cycleId }) })
  ])) as unknown as [Array<{ tactic: Tactic; goalTitle: string }>, Array<Record<string, unknown>>, Array<Record<string, unknown>>];

  const entriesPerWeek = new Map<number, TacticEntryValue[]>();
  for (const record of entryRecords) {
    const weekNumber = Number(record.weekNumber);
    if (!Number.isFinite(weekNumber)) continue;
    const list = entriesPerWeek.get(weekNumber) ?? [];
    list.push({ tacticId: String(record.tactic), date: record.date ? String(record.date) : null, value: Number(record.value), completed: Boolean(record.completed) });
    entriesPerWeek.set(weekNumber, list);
  }

  for (const weekNumber of weekNumbers) {
    const scores = scoreTacticsForWeek({
      weekNumber,
      asOfDate,
      tacticRows,
      scheduleRows: scheduleRecords,
      calendarBlocks: [],
      entries: entriesPerWeek.get(weekNumber) ?? [],
      weekStartDate: null,
      weekEndDate: null,
      hasSnapshot: false
    });
    const weeklyScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score.score, 0) / scores.length : 0;
    result.set(weekNumber, {
      cycleId,
      weekNumber,
      weeklyScore,
      status: statusFromScore(weeklyScore),
      goalScores: goalScoresFromTacticScores(scores),
      tacticScores: scores
    });
  }
  return result;
}

function entryRecordsToValues(records: Array<Record<string, unknown>>): TacticEntryValue[] {
  return records.map((record) => ({
    tacticId: String(record.tactic),
    date: record.date ? String(record.date) : null,
    value: Number(record.value),
    completed: Boolean(record.completed)
  }));
}

// ---------------------------------------------------------------- snapshots

export type WeekSnapshotTactic = {
  id: string;
  goalId: string;
  title: string;
  type: string;
  trackingType: string;
  recurrenceType: string;
  recurrenceCount: number;
  targetValue: number;
  unit: string;
  executionStyle?: string | null;
  targetPerWeek: number | null;
  targetPerDay: number | null;
  scoringWeight: number;
  startsWeek: number | null;
  endsWeek: number | null;
  active: boolean;
  sortOrder: number;
};

export type WeekSnapshotData = {
  version: 1;
  cycleId: string;
  weekNumber: number;
  week: { startDate: string; endDate: string; label: string } | null;
  capturedAt: string;
  goals: Array<{ id: string; title: string; description: string | null; sortOrder: number; status: string }>;
  lagIndicators: LagIndicator[];
  tactics: WeekSnapshotTactic[];
  tacticSchedules: Array<{ tacticId: string; weekNumber: number; plannedTarget: number | null; required: boolean }>;
  tacticCalendarBlocks: Array<{
    id: string;
    tacticId: string;
    weekNumber: number;
    date: string;
    startTime: string | null;
    endTime: string | null;
    durationMinutes: number | null;
    plannedValue: number;
    note: string | null;
  }>;
};

export async function getWeekSnapshot(cycleId: string, weekNumber: number) {
  const rows = await pb.collection("week_snapshots").getFullList({
    filter: pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycleId, w: weekNumber }),
    sort: "-id",
    perPage: 1
  });
  if (!rows[0]) return null;
  return { ...rows[0], snapshot: JSON.parse(String(rows[0].snapshotJson)) as WeekSnapshotData };
}

export async function captureWeekSnapshot(cycleId: string, weekNumber: number) {
  const week = await pb
    .collection("cycle_weeks")
    .getFirstListItem(pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycleId, w: weekNumber }))
    .catch(() => null);
  const goalRows = await listGoals(cycleId);
  const lagRows = (await pb.collection("lag_indicators").getFullList({
    filter: pb.filter("goal.cycle = {:c}", { c: cycleId })
  })).map(toLag);
  const tacticRows = await listTactics(cycleId);
  const scheduleRecords = await pb.collection("tactic_schedules").getFullList({
    filter: pb.filter("weekNumber = {:w}", { w: weekNumber })
  });
  const blockRecords = await pb.collection("tactic_calendar_blocks").getFullList({
    filter: pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycleId, w: weekNumber })
  });

  const scheduleRows = scheduleRecords.map((schedule) => ({
    tacticId: String(schedule.tactic),
    weekNumber: Number(schedule.weekNumber),
    plannedTarget: schedule.plannedTarget === "" || schedule.plannedTarget === null ? null : Number(schedule.plannedTarget),
    required: Boolean(schedule.required)
  }));
  const activeTactics = tacticRows
    .map((row) => row.tactic)
    .filter((tactic) => isTacticActiveInWeek(tactic, weekNumber, scheduleRows.find((schedule) => schedule.tacticId === tactic.id)));
  const activeTacticIds = new Set(activeTactics.map((tactic) => tactic.id));
  const activeGoalIds = new Set(activeTactics.map((tactic) => tactic.goalId));
  for (const lag of lagRows) activeGoalIds.add(lag.goalId);

  const capturedAt = nowIso();
  const snapshot: WeekSnapshotData = {
    version: 1,
    cycleId,
    weekNumber,
    week: week
      ? { startDate: String(week.startDate), endDate: String(week.endDate), label: String(week.label) }
      : null,
    capturedAt,
    goals: goalRows
      .filter((goal) => activeGoalIds.has(goal.id))
      .map((goal) => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        sortOrder: goal.sortOrder,
        status: goal.status
      })),
    lagIndicators: lagRows
      .filter((lag) => activeGoalIds.has(lag.goalId))
      .map((lag) => ({
        id: lag.id,
        goalId: lag.goalId,
        title: lag.title,
        type: lag.type,
        targetValue: lag.targetValue,
        currentValue: lag.currentValue,
        unit: lag.unit,
        achieved: lag.achieved,
        sortOrder: lag.sortOrder
      })),
    tactics: activeTactics.map((tactic) => ({
      id: tactic.id,
      goalId: tactic.goalId,
      title: tactic.title,
      type: tactic.type,
      trackingType: tactic.trackingType,
      recurrenceType: tactic.recurrenceType,
      recurrenceCount: tactic.recurrenceCount,
      targetValue: tactic.targetValue,
      unit: tactic.unit,
      executionStyle: tactic.executionStyle ?? null,
      targetPerWeek: tactic.targetPerWeek,
      targetPerDay: tactic.targetPerDay,
      scoringWeight: tactic.scoringWeight,
      startsWeek: tactic.startsWeek,
      endsWeek: tactic.endsWeek,
      active: tactic.active,
      sortOrder: tactic.sortOrder
    })),
    tacticSchedules: scheduleRows.filter((schedule) => activeTacticIds.has(schedule.tacticId)),
    tacticCalendarBlocks: blockRecords
      .filter((block) => activeTacticIds.has(String(block.tactic)))
      .map((block) => ({
        id: String(block.id),
        tacticId: String(block.tactic),
        weekNumber: Number(block.weekNumber),
        date: String(block.date),
        startTime: (block.startTime as string) || null,
        endTime: (block.endTime as string) || null,
        durationMinutes: block.durationMinutes === "" || block.durationMinutes === null ? null : Number(block.durationMinutes),
        plannedValue: Number(block.plannedValue),
        note: (block.note as string) || null
      }))
  };

  const created = await pb.collection("week_snapshots").create({
    cycle: cycleId,
    weekNumber,
    snapshotJson: JSON.stringify(snapshot),
    capturedAt
  });
  return { ...created, snapshot };
}

// ---------------------------------------------------------------- calendar blocks

export type CalendarBlock = {
  id: string;
  tacticId: string;
  cycleId: string;
  weekNumber: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  plannedValue: number;
  note: string | null;
};

function toBlock(record: Record<string, unknown>): CalendarBlock {
  return {
    id: String(record.id),
    tacticId: String(record.tactic),
    cycleId: String(record.cycle),
    weekNumber: Number(record.weekNumber),
    date: String(record.date),
    startTime: (record.startTime as string) || null,
    endTime: (record.endTime as string) || null,
    durationMinutes: record.durationMinutes === "" || record.durationMinutes === null ? null : Number(record.durationMinutes),
    plannedValue: Number(record.plannedValue),
    note: (record.note as string) || null
  };
}

function validateDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("date must use YYYY-MM-DD");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("date must be a valid calendar date");
  }
}

function validateTime(value: string | null | undefined, field: string) {
  if (!value) return;
  if (!/^\d{2}:\d{2}$/.test(value)) throw new Error(`${field} must use HH:MM`);
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) throw new Error(`${field} must be a valid time`);
}

function validateDuration(value: number | null | undefined) {
  if (value === undefined || value === null) return;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error("durationMinutes must be a positive whole number");
  }
}

function validatePlannedValue(value: number | null | undefined) {
  if (value === undefined || value === null) return;
  if (!Number.isFinite(value) || value <= 0) throw new Error("plannedValue must be greater than 0");
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function deriveBlockTimes(input: { startTime?: string | null; endTime?: string | null; durationMinutes?: number | null }) {
  let { startTime, endTime, durationMinutes } = input;
  validateTime(startTime, "startTime");
  validateTime(endTime, "endTime");
  validateDuration(durationMinutes);

  if (startTime && endTime) {
    const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (duration <= 0) throw new Error("endTime must be after startTime");
    durationMinutes ??= duration;
  } else if (startTime && durationMinutes !== undefined && durationMinutes !== null && endTime == null) {
    const computedEnd = timeToMinutes(startTime) + durationMinutes;
    if (computedEnd >= 24 * 60) throw new Error("endTime must be before 24:00");
    endTime = minutesToTime(computedEnd);
  }

  return { startTime, endTime, durationMinutes };
}

export async function addTacticCalendarBlock(input: {
  tacticId: string;
  cycleId?: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  plannedValue?: number | null;
  note?: string | null;
}) {
  const tactic = await getTactic(input.tacticId);
  if (!tactic) throw new Error(`Tactic not found: ${input.tacticId}`);
  const goal = await pb.collection("goals").getOne(tactic.goalId);
  const cycleId = input.cycleId ?? String(goal.cycle);
  if (cycleId !== String(goal.cycle)) throw new Error(`Tactic ${input.tacticId} does not belong to cycle ${cycleId}`);
  validateDate(input.date);
  const weekNumber = await getCurrentWeekNumber(cycleId, input.date);
  if (!weekNumber) throw new Error("Block date is not inside the cycle");

  const { startTime, endTime, durationMinutes } = deriveBlockTimes(input);
  const plan = resolveTacticPlan(tactic);
  const plannedValue = input.plannedValue ?? (plan.trackingType === "boolean" ? getOccurrenceTarget(plan) : null);
  validatePlannedValue(plannedValue);
  if (plannedValue === null) throw new Error("plannedValue is required for quantity and duration blocks");

  const created = await pb.collection("tactic_calendar_blocks").create({
    tactic: input.tacticId,
    cycle: cycleId,
    weekNumber,
    date: input.date,
    startTime: startTime ?? "",
    endTime: endTime ?? "",
    durationMinutes: durationMinutes ?? "",
    plannedValue: Number(plannedValue),
    note: input.note ?? ""
  });
  return toBlock(created);
}

export async function updateTacticCalendarBlock(blockId: string, input: {
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  plannedValue?: number;
  note?: string | null;
}) {
  const existingRecord = await pb.collection("tactic_calendar_blocks").getOne(blockId);
  const existing = toBlock(existingRecord);

  const date = input.date ?? existing.date;
  validateDate(date);
  const weekNumber = input.date ? await getCurrentWeekNumber(existing.cycleId, date) : existing.weekNumber;
  if (!weekNumber) throw new Error("Block date is not inside the cycle");

  const updateStartTime = input.startTime !== undefined;
  const updateEndTime = input.endTime !== undefined;
  const updateDuration = input.durationMinutes !== undefined;
  const shouldRecomputeDuration = updateStartTime && updateEndTime && !updateDuration;
  const shouldRecomputeEndTime = updateStartTime && updateDuration && !updateEndTime;
  const { startTime, endTime, durationMinutes } = deriveBlockTimes({
    startTime: updateStartTime ? input.startTime : existing.startTime,
    endTime: shouldRecomputeEndTime ? undefined : updateEndTime ? input.endTime : existing.endTime,
    durationMinutes: shouldRecomputeDuration ? undefined : updateDuration ? input.durationMinutes : existing.durationMinutes
  });
  validatePlannedValue(input.plannedValue);

  const updated = await pb.collection("tactic_calendar_blocks").update(blockId, {
    weekNumber,
    date,
    startTime: startTime ?? "",
    endTime: endTime ?? "",
    durationMinutes: durationMinutes ?? "",
    plannedValue: input.plannedValue === undefined ? existing.plannedValue : Number(input.plannedValue),
    note: input.note === undefined ? existing.note ?? "" : input.note
  });
  return toBlock(updated);
}

export async function deleteTacticCalendarBlock(blockId: string) {
  const existing = await pb.collection("tactic_calendar_blocks").getOne(blockId);
  await pb.collection("tactic_calendar_blocks").delete(blockId);
  return toBlock(existing);
}

export async function listTacticCalendarBlocks(input: { cycleId?: string; tacticId?: string; weekNumber?: number; date?: string } = {}) {
  const filters: string[] = [];
  if (input.cycleId !== undefined) filters.push(pb.filter("cycle = {:c}", { c: input.cycleId }));
  if (input.tacticId !== undefined) filters.push(pb.filter("tactic = {:t}", { t: input.tacticId }));
  if (input.weekNumber !== undefined) filters.push(pb.filter("weekNumber = {:w}", { w: input.weekNumber }));
  if (input.date !== undefined) filters.push(pb.filter("date = {:d}", { d: input.date }));
  const records = await pb.collection("tactic_calendar_blocks").getFullList({
    filter: filters.join(" && "),
    sort: "date,startTime,id"
  });
  return records.map((record) => {
    const block = toBlock(record);
    return { block, tacticTitle: "", goalTitle: "" };
  });
}

export async function listCalendarBlocksWithTitles(input: { cycleId: string; weekNumber?: number; date?: string }) {
  const filters: string[] = [pb.filter("cycle = {:c}", { c: input.cycleId })];
  if (input.weekNumber !== undefined) filters.push(pb.filter("weekNumber = {:w}", { w: input.weekNumber }));
  if (input.date !== undefined) filters.push(pb.filter("date = {:d}", { d: input.date }));
  const records = await pb.collection("tactic_calendar_blocks").getFullList({
    filter: filters.join(" && "),
    sort: "date,startTime,id",
    expand: "tactic,tactic.goal"
  });
  return records.map((record) => {
    const tactic = record.expand?.tactic as Record<string, unknown> | undefined;
    const goal = record.expand?.["tactic.goal"] as Record<string, unknown> | undefined;
    return {
      ...toBlock(record),
      tacticTitle: String(tactic?.title ?? "Unknown"),
      goalTitle: String(goal?.title ?? "Unknown")
    };
  });
}

export async function moveTacticCalendarBlock(input: {
  blockId?: string;
  tacticId?: string;
  fromDate?: string;
  toDate: string;
}) {
  const sourceBlock = input.blockId
    ? await pb.collection("tactic_calendar_blocks").getOne(input.blockId).catch(() => null)
    : null;
  let block = sourceBlock ? toBlock(sourceBlock) : null;

  if (!block) {
    if (input.tacticId === undefined || !input.fromDate) throw new Error("Provide either blockId or both tacticId and fromDate");
    const matches = (await pb.collection("tactic_calendar_blocks").getFullList({
      filter: pb.filter("tactic = {:t} && date = {:d}", { t: input.tacticId, d: input.fromDate }),
      sort: "id"
    })).map(toBlock);
    if (matches.length === 0) throw new Error(`No tactic block found for tactic ${input.tacticId} on ${input.fromDate}`);
    if (matches.length > 1) throw new Error(`Multiple tactic blocks found for tactic ${input.tacticId} on ${input.fromDate}; provide blockId`);
    block = matches[0];
  }

  const targetWeekNumber = await getCurrentWeekNumber(block.cycleId, input.toDate);
  if (!targetWeekNumber) throw new Error("Target date is not inside the cycle");
  const targetMatches = (await pb.collection("tactic_calendar_blocks").getFullList({
    filter: pb.filter("tactic = {:t} && date = {:d}", { t: block.tacticId, d: input.toDate }),
    sort: "id"
  })).map(toBlock);
  const otherTargetMatches = targetMatches.filter((target) => target.id !== block!.id);

  if (otherTargetMatches.length > 1) {
    throw new Error(`Multiple tactic blocks already exist for tactic ${block.tacticId} on ${input.toDate}; provide blockId and clean up manually`);
  }

  if (otherTargetMatches.length === 1) {
    const target = otherTargetMatches[0];
    const mergedNote = block.note && target.note && block.note !== target.note ? `${target.note}\n${block.note}` : (block.note ?? target.note);
    const updatedTarget = await pb.collection("tactic_calendar_blocks").update(target.id, {
      weekNumber: targetWeekNumber,
      startTime: block.startTime ?? target.startTime ?? "",
      endTime: block.endTime ?? target.endTime ?? "",
      durationMinutes: block.durationMinutes ?? target.durationMinutes ?? "",
      plannedValue: block.plannedValue,
      note: mergedNote ?? ""
    });
    await pb.collection("tactic_calendar_blocks").delete(block.id);
    return { action: "merged" as const, sourceBlockId: block.id, block: toBlock(updatedTarget) };
  }

  const updated = await pb.collection("tactic_calendar_blocks").update(block.id, {
    weekNumber: targetWeekNumber,
    date: input.toDate
  });
  return { action: "moved" as const, sourceBlockId: block.id, block: toBlock(updated) };
}

// ---------------------------------------------------------------- week report

export type WeeklyReview = {
  id: string;
  cycleId: string;
  weekNumber: number;
  executionScore: number | null;
  weeklyGoals: string | null;
  wins: string | null;
  misses: string | null;
  avoidancePatterns: string | null;
  lessons: string | null;
  nextWeekAdjustments: string | null;
  completedAt: string | null;
};

function toWeeklyReview(record: Record<string, unknown>): WeeklyReview {
  return {
    id: String(record.id),
    cycleId: String(record.cycle),
    weekNumber: Number(record.weekNumber),
    executionScore: record.executionScore === "" || record.executionScore === null ? null : Number(record.executionScore),
    weeklyGoals: (record.weeklyGoals as string) || null,
    wins: (record.wins as string) || null,
    misses: (record.misses as string) || null,
    avoidancePatterns: (record.avoidancePatterns as string) || null,
    lessons: (record.lessons as string) || null,
    nextWeekAdjustments: (record.nextWeekAdjustments as string) || null,
    completedAt: (record.completedAt as string) || null
  };
}

export async function upsertWeeklyReview(input: {
  cycleId?: string;
  weekNumber: number;
  executionScore?: number | null;
  weeklyGoals?: string | null;
  wins?: string | null;
  misses?: string | null;
  avoidancePatterns?: string | null;
  lessons?: string | null;
  nextWeekAdjustments?: string | null;
  completedAt?: string | null;
}) {
  const cycleId = input.cycleId ?? (await getActiveCycle())?.id;
  if (!cycleId) throw new Error("No active cycle");
  const existingRecord = await pb
    .collection("weekly_reviews")
    .getFirstListItem(pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycleId, w: input.weekNumber }))
    .catch(() => null);
  const values = {
    executionScore: input.executionScore ?? (existingRecord ? (existingRecord.executionScore as string | number) ?? null : null),
    weeklyGoals: input.weeklyGoals ?? (existingRecord?.weeklyGoals as string) ?? null,
    wins: input.wins ?? (existingRecord?.wins as string) ?? null,
    misses: input.misses ?? (existingRecord?.misses as string) ?? null,
    avoidancePatterns: input.avoidancePatterns ?? (existingRecord?.avoidancePatterns as string) ?? null,
    lessons: input.lessons ?? (existingRecord?.lessons as string) ?? null,
    nextWeekAdjustments: input.nextWeekAdjustments ?? (existingRecord?.nextWeekAdjustments as string) ?? null,
    completedAt: input.completedAt ?? (existingRecord?.completedAt as string) ?? null
  };
  if (existingRecord) {
    const updated = await pb.collection("weekly_reviews").update(existingRecord.id, values);
    return toWeeklyReview(updated);
  }
  const created = await pb.collection("weekly_reviews").create({ cycle: cycleId, weekNumber: input.weekNumber, ...values });
  return toWeeklyReview(created);
}

export async function getWeeklyReview(cycleId: string, weekNumber: number) {
  const record = await pb
    .collection("weekly_reviews")
    .getFirstListItem(pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycleId, w: weekNumber }))
    .catch(() => null);
  return record ? toWeeklyReview(record) : null;
}

export type WeeklyReportBlock = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  plannedValue: number;
  note: string | null;
  tacticTitle: string;
  goalTitle: string;
};

export type WeeklyReportEntry = {
  id: string;
  date: string | null;
  tacticTitle: string;
  goalTitle: string;
  value: number;
  completed: boolean;
  note: string | null;
};

export async function getWeekReport(cycleId: string, weekNumber: number) {
  const cycle = await getCycleById(cycleId);
  if (!cycle) throw new Error(`Cycle not found: ${cycleId}`);
  const week = await pb
    .collection("cycle_weeks")
    .getFirstListItem(pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycleId, w: weekNumber }))
    .catch(() => null);
  if (!week) throw new Error(`Week ${weekNumber} not found for cycle ${cycleId}`);

  // Weekly reports are final reflections, not a live "through yesterday" dashboard view.
  // Include the week end date so Sunday/last-day tactics count against the full-week plan.
  const score = await getWeekScore(cycleId, weekNumber, { asOfDate: String(week.endDate), includeAsOfDate: true });

  const blocks = await listCalendarBlocksWithTitles({ cycleId, weekNumber });

  const logs = (await pb.collection("daily_logs").getFullList({
    filter: pb.filter("cycle = {:c} && date >= {:s} && date <= {:e}", { c: cycleId, s: String(week.startDate), e: String(week.endDate) }),
    sort: "date"
  })).map(toDailyLog);

  const entryRecords = await pb.collection("tactic_entries").getFullList({
    filter: pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycleId, w: weekNumber }),
    sort: "date,id",
    expand: "tactic,tactic.goal"
  });
  const entries: WeeklyReportEntry[] = entryRecords.map((record) => {
    const tactic = record.expand?.tactic as Record<string, unknown> | undefined;
    const goal = record.expand?.["tactic.goal"] as Record<string, unknown> | undefined;
    return {
      id: String(record.id),
      date: record.date ? String(record.date) : null,
      tacticTitle: String(tactic?.title ?? "Unknown"),
      goalTitle: String(goal?.title ?? "Unknown"),
      value: Number(record.value),
      completed: Boolean(record.completed),
      note: (record.note as string) || null
    };
  });

  const review = await getWeeklyReview(cycleId, weekNumber);

  const offTrackTactics = score.tacticScores.filter((tacticScore) => tacticScore.status !== "on_track");
  const carryOverTactics = offTrackTactics.filter((tacticScore) => tacticScore.recurrenceType === "once");
  const recurringGaps = offTrackTactics.filter((tacticScore) => tacticScore.recurrenceType !== "once");
  const completedTactics = score.tacticScores.filter((tacticScore) => tacticScore.score >= 1);

  return {
    cycle,
    week: {
      weekNumber,
      startDate: String(week.startDate),
      endDate: String(week.endDate)
    },
    score,
    blocks,
    dailyLogs: logs,
    entries,
    review,
    highlights: {
      completedTactics,
      offTrackTactics,
      carryOverTactics,
      recurringGaps,
      bestGoal: [...score.goalScores].sort((a, b) => b.score - a.score)[0] ?? null,
      weakestGoal: [...score.goalScores].sort((a, b) => a.score - b.score)[0] ?? null
    }
  };
}

export function renderWeekReportMarkdown(report: Awaited<ReturnType<typeof getWeekReport>>) {
  const lines = [
    `# ${report.cycle.title} — Week ${report.week.weekNumber} Report`,
    "",
    `**Date range:** ${report.week.startDate} → ${report.week.endDate}`,
    `**Execution Score:** ${formatPercent(report.score.weeklyScore)} (${report.score.status})`,
    "",
    "## Wochen-Ziele / Outcomes",
    "",
    report.review?.weeklyGoals ?? "_Noch keine Wochen-Outcomes festgelegt._",
    "",
    "## Cycle Goal Scores",
    "",
    "| Goal | Score | Status |",
    "|---|---:|---|",
    ...report.score.goalScores.map((goal) => `| ${goal.goalTitle} | ${formatPercent(goal.score)} | ${goal.status} |`),
    "",
    "## Tactic Execution",
    "",
    "| Tactic | Goal | Planned | Actual | Score | Status |",
    "|---|---|---:|---:|---:|---|",
    ...report.score.tacticScores.map(
      (tactic) => `| ${tactic.tacticTitle} | ${tactic.goalTitle} | ${formatValue(tactic.planned, tactic.unit)} | ${formatValue(tactic.actual, tactic.unit)} | ${formatPercent(tactic.score)} | ${tactic.status} |`
    ),
    "",
    "## Scheduled Blocks",
    "",
    ...report.blocks.map((block) => {
      const time = block.startTime && block.endTime ? ` ${block.startTime}–${block.endTime}` : "";
      return `- ${block.date}${time}: ${block.tacticTitle} (${formatValue(block.plannedValue, "planned")})${block.note ? ` — ${block.note}` : ""}`;
    }),
    report.blocks.length ? "" : "No scheduled blocks.",
    "",
    "## Größte Wins der Woche",
    "",
    (report.review?.wins ?? report.dailyLogs.flatMap((log) => log.privateVictories?.split("\n") ?? []).filter(Boolean).join("\n")) ||
    "_No wins captured yet._",
    "",
    "## Reflection",
    "",
    [report.review?.lessons, report.review?.nextWeekAdjustments, report.review?.misses, report.review?.avoidancePatterns].filter(Boolean).join("\n") || "_Reflection wird am Ende der Woche gemeinsam ergänzt._",
    "",
    "## Nicht vollständig erfüllt diese Woche",
    "",
    ...(report.highlights.recurringGaps.length
      ? report.highlights.recurringGaps.map((tactic) => `- ${tactic.tacticTitle}: ${formatValue(tactic.actual, tactic.unit)} / ${formatValue(tactic.planned, tactic.unit)} (${formatPercent(tactic.score)})`)
      : ["No recurring tactic gaps."]),
    "",
    "## Carry-over in nächste Woche",
    "",
    ...(report.highlights.carryOverTactics.length
      ? report.highlights.carryOverTactics.map((tactic) => `- ${tactic.tacticTitle}: ${formatValue(tactic.actual, tactic.unit)} / ${formatValue(tactic.planned, tactic.unit)} (${formatPercent(tactic.score)})`)
      : ["No one-time carry-over."])
  ];
  return lines.join("\n");
}

function formatValue(value: number, unit: string) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}

// ---------------------------------------------------------------- dashboard (port of src/core/dashboard.ts)

export type TodayTacticProgress = TacticWeekScore & {
  remaining: number;
  isComplete: boolean;
  todayActual: number;
  // null for pool rows (occurrence): the actionable number is weekRemaining. --json BREAKING vs earlier builds.
  todayTarget: number | null;
  todayRemaining: number;
  isTodayComplete: boolean;
  dueToday: boolean;
  todayKind: "scheduled" | "recurring" | "unscheduled" | "pool";
  todayLabel: string;
  weekRemaining: number;
  weekTarget: number;
  scheduledBlocks: Array<{
    id: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    durationMinutes: number | null;
    plannedValue: number;
    note: string | null;
  }>;
};

export type TodaySummary = {
  relevantCount: number;
  completedCount: number;
  remainingCount: number;
  totalRemaining: number;
};

export type TodayScheduledBlock = {
  id: string;
  tacticId: string;
  tacticTitle: string;
  goalTitle: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  plannedValue: number;
  note: string | null;
  unit: string;
};

type CalendarBlockRow = {
  id: string;
  tacticId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  plannedValue: number;
  note: string | null;
};

type DashboardTacticRow = {
  tactic: Pick<
    WeekSnapshotTactic,
    "id" | "title" | "goalId" | "trackingType" | "recurrenceType" | "recurrenceCount" | "targetValue" | "scoringWeight" | "unit" | "executionStyle"
  >;
  goalTitle: string;
};

function groupBlocksByTactic(blocks: CalendarBlockRow[]) {
  return blocks.reduce<Record<string, CalendarBlockRow[]>>((acc, block) => {
    acc[block.tacticId] ??= [];
    acc[block.tacticId].push(block);
    return acc;
  }, {});
}

function mergeTodayScoreRows(params: {
  scoreRows: TacticWeekScore[];
  tacticRows: DashboardTacticRow[];
  entries: TacticEntryValue[];
  todayBlocks: CalendarBlockRow[];
  weekBlocks: CalendarBlockRow[];
}) {
  const mergedRows = [...params.scoreRows];
  const scoreIds = new Set(params.scoreRows.map((row) => row.tacticId));

  // Explicit calendar blocks for the week override schedule required:false:
  // a block is newer, specific intent, so the tactic becomes visible this week
  // even when the schedule row says it is not required.
  const blockedTacticIds = new Set([
    ...params.todayBlocks.map((block) => block.tacticId),
    ...params.weekBlocks.map((block) => block.tacticId)
  ]);
  for (const tacticId of blockedTacticIds) {
    if (scoreIds.has(tacticId)) continue;
    const tacticRow = params.tacticRows.find((row) => row.tactic.id === tacticId);
    if (!tacticRow) continue;
    const plan = {
      trackingType: tacticRow.tactic.trackingType as TrackingType,
      recurrenceType: tacticRow.tactic.recurrenceType as RecurrenceType,
      recurrenceCount: Math.max(1, Number(tacticRow.tactic.recurrenceCount ?? 1)),
      targetValue: Number(tacticRow.tactic.targetValue ?? 1),
      unit: tacticRow.tactic.unit
    };
    const style = resolveExecutionStyle(plan, tacticRow.tactic);
    const tacticEntries = params.entries.filter((entry) => entry.tacticId === tacticId);
    const fullWeekPlanned = params.weekBlocks
      .filter((block) => block.tacticId === tacticId)
      .reduce((sum, block) => sum + Number(block.plannedValue), 0);

    mergedRows.push({
      tacticId,
      tacticTitle: tacticRow.tactic.title,
      goalId: String(tacticRow.tactic.goalId),
      goalTitle: tacticRow.goalTitle,
      planned: 0,
      fullWeekPlanned,
      actual: getActualProgress(plan, tacticEntries),
      score: 0,
      weight: Number(tacticRow.tactic.scoringWeight),
      status: "off_track",
      unit: tacticRow.tactic.unit,
      trackingType: plan.trackingType,
      recurrenceType: plan.recurrenceType,
      recurrenceCount: plan.recurrenceCount,
      targetValue: plan.targetValue,
      executionStyle: style
    });
  }

  return mergedRows;
}

export function buildTodayTactics(
  scores: TacticWeekScore[],
  entries: TacticEntryValue[],
  date: string,
  todayBlocks: CalendarBlockRow[],
  weekBlocks: CalendarBlockRow[]
): TodayTacticProgress[] {
  const blocksTodayByTactic = groupBlocksByTactic(todayBlocks);
  const blocksWeekByTactic = groupBlocksByTactic(weekBlocks);

  return scores
    .map((score) => {
      const plan = {
        trackingType: score.trackingType as TrackingType,
        recurrenceType: score.recurrenceType as RecurrenceType,
        recurrenceCount: score.recurrenceCount,
        targetValue: score.targetValue,
        unit: score.unit
      };
      const tacticEntriesForWeek = entries.filter((entry) => entry.tacticId === score.tacticId);
      const scheduledBlocks = (blocksTodayByTactic[score.tacticId] ?? []).map((block) => ({
        id: block.id,
        date: block.date,
        startTime: block.startTime,
        endTime: block.endTime,
        durationMinutes: block.durationMinutes,
        plannedValue: Number(block.plannedValue),
        note: block.note
      }));
      const scheduledWeekBlocks = blocksWeekByTactic[score.tacticId] ?? [];
      const style: ExecutionStyle = isExecutionStyle(score.executionStyle)
        ? score.executionStyle
        : deriveExecutionStyle(plan);
      const weekTarget = score.fullWeekPlanned;
      const remaining = Math.max(weekTarget - score.actual, 0);
      const weekRemaining = remaining;
      const isComplete = remaining === 0;

      if (style === "toggle") {
        const todayActual = getTodayProgress(plan, tacticEntriesForWeek, date);
        const isDueDay =
          plan.recurrenceType === "daily" ? true : plan.recurrenceType === "weekdays" ? isWeekdayDate(date) : remaining > 0;
        const active = weekTarget > 0 || score.actual > 0;
        return {
          ...score,
          planned: weekTarget,
          remaining,
          isComplete,
          todayActual,
          todayTarget: 1,
          todayRemaining: Math.max(1 - todayActual, 0),
          isTodayComplete: todayActual >= 1,
          dueToday: active && isDueDay && todayActual < 1,
          todayKind: "recurring",
          todayLabel: "Recurring today",
          weekRemaining,
          weekTarget,
          scheduledBlocks
        } satisfies TodayTacticProgress;
      }

      if (style === "occurrence") {
        // Pool: no daily target (todayTarget null) — the week remainder is actionable.
        // todayActual carries the week actual so mid-week progress stays visible.
        const dueToday = (weekTarget > 0 || score.actual > 0) && weekRemaining > 0;
        return {
          ...score,
          planned: weekTarget,
          remaining,
          isComplete,
          todayActual: score.actual,
          todayTarget: null,
          todayRemaining: weekRemaining,
          isTodayComplete: weekTarget > 0 ? score.actual >= weekTarget : score.actual > 0,
          dueToday,
          todayKind: "pool",
          todayLabel: `${formatAmount(weekRemaining)} von ${formatAmount(weekTarget)} offen`,
          weekRemaining,
          weekTarget,
          scheduledBlocks
        } satisfies TodayTacticProgress;
      }

      // Volume: current behavior (scheduled blocks or unscheduled pool).
      const todayActual = getTodayProgress(plan, tacticEntriesForWeek, date);
      const futureScheduledTotal = scheduledWeekBlocks
        .filter((block) => block.date > date)
        .reduce((sum, block) => sum + Number(block.plannedValue), 0);
      const scheduledTodayTarget = scheduledBlocks.reduce((sum, block) => sum + Number(block.plannedValue), 0);
      const unscheduledOutstanding = Math.max(score.fullWeekPlanned - score.actual - futureScheduledTotal, 0);
      const recurringTarget = getOccurrenceTarget(plan);
      const recurringDue = isDueToday(plan, date, remaining, todayActual, score.fullWeekPlanned > 0 || score.actual > 0);
      const hasScheduledToday = scheduledTodayTarget > 0;
      const isRecurringDueToday = !hasScheduledToday && recurringDue && (plan.recurrenceType === "daily" || plan.recurrenceType === "weekdays");
      const hasFutureScheduledBlocks = futureScheduledTotal > 0;
      const isUnscheduledDueToday =
        !hasScheduledToday &&
        !hasFutureScheduledBlocks &&
        !isRecurringDueToday &&
        unscheduledOutstanding > 0 &&
        (plan.recurrenceType === "times_per_week" || plan.recurrenceType === "once");
      const todayTarget = hasScheduledToday
        ? scheduledTodayTarget
        : isRecurringDueToday
          ? recurringTarget
          : isUnscheduledDueToday
            ? unscheduledOutstanding
            : recurringTarget;
      const todayRemaining = Math.max(todayTarget - todayActual, 0);
      const isTodayComplete = todayRemaining === 0 || (!hasScheduledToday && remaining === 0);
      const dueToday = hasScheduledToday || isRecurringDueToday || isUnscheduledDueToday;
      const todayKind = hasScheduledToday ? "scheduled" : isRecurringDueToday ? "recurring" : "unscheduled";
      const todayLabel =
        todayKind === "scheduled" ? "Scheduled block" : isRecurringDueToday ? "Recurring today" : "Unscheduled this week";

      return {
        ...score,
        planned: score.fullWeekPlanned,
        remaining,
        isComplete: remaining === 0,
        todayActual,
        todayTarget,
        todayRemaining,
        isTodayComplete,
        dueToday,
        todayKind,
        todayLabel,
        weekRemaining,
        weekTarget,
        scheduledBlocks
      } satisfies TodayTacticProgress;
    })
    .filter((score) => score.dueToday || score.todayActual > 0)
    .sort((left, right) => {
      const leftPriority = left.todayKind === "scheduled" ? 0 : left.todayKind === "recurring" ? 1 : 2;
      const rightPriority = right.todayKind === "scheduled" ? 0 : right.todayKind === "recurring" ? 1 : 2;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      const leftStart = left.scheduledBlocks[0]?.startTime ?? "99:99";
      const rightStart = right.scheduledBlocks[0]?.startTime ?? "99:99";
      if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);
      if (left.isTodayComplete !== right.isTodayComplete) return Number(left.isTodayComplete) - Number(right.isTodayComplete);
      if (left.todayRemaining !== right.todayRemaining) return right.todayRemaining - left.todayRemaining;
      if (left.remaining !== right.remaining) return right.remaining - left.remaining;
      return left.tacticTitle.localeCompare(right.tacticTitle);
    });
}

export async function getDashboardData(cycleId?: string, weekNumber?: number, asOfDate?: string) {
  const asOf = asOfDate ?? todayDateString();
  const cycle = cycleId ? await getCycleById(cycleId) : await getActiveCycle();
  if (!cycle) return null;
  const currentWeek = weekNumber ?? (await getCurrentWeekNumber(cycle.id, asOf)) ?? 1;
  const weeks = await getCycleWeeks(cycle.id);
  const snapshotRow = await getWeekSnapshot(cycle.id, currentWeek);
  const snapshot = snapshotRow?.snapshot;
  const goals = snapshot?.goals.map((goal) => ({ ...goal, cycleId: cycle.id })) ?? (await listGoals(cycle.id));
  const lags = snapshot
    ? snapshot.lagIndicators
    : (await pb.collection("lag_indicators").getFullList({ filter: pb.filter("goal.cycle = {:c}", { c: cycle.id }) })).map(toLag);
  const score = await getWeekScore(cycle.id, currentWeek, { asOfDate, snapshotRow });
  const tactics: DashboardTacticRow[] = snapshot
    ? snapshot.tactics.map((tactic) => ({
        tactic: { ...tactic, goalId: String(tactic.goalId) } as DashboardTacticRow["tactic"],
        goalTitle: snapshot.goals.find((goal) => String(goal.id) === String(tactic.goalId))?.title ?? "Unknown goal"
      }))
    : await listTactics(cycle.id);
  const entryRecords = await pb.collection("tactic_entries").getFullList({
    filter: pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycle.id, w: currentWeek })
  });
  const weekEntries = entryRecordsToValues(entryRecords);
  const weekBlockRecords = await pb.collection("tactic_calendar_blocks").getFullList({
    filter: pb.filter("cycle = {:c} && weekNumber = {:w}", { c: cycle.id, w: currentWeek }),
    sort: "date,startTime,id"
  });
  const calendarBlocksForWeek: CalendarBlockRow[] = weekBlockRecords.map((record) => ({
    id: String(record.id),
    tacticId: String(record.tactic),
    date: String(record.date),
    startTime: (record.startTime as string) || null,
    endTime: (record.endTime as string) || null,
    durationMinutes: record.durationMinutes === "" || record.durationMinutes === null ? null : Number(record.durationMinutes),
    plannedValue: Number(record.plannedValue),
    note: (record.note as string) || null
  }));
  const today = asOfDate ?? todayDateString();
  const normalizedTodayBlocks = calendarBlocksForWeek.filter((block) => block.date === today);
  const todayScoreRows = mergeTodayScoreRows({
    scoreRows: score.tacticScores,
    tacticRows: tactics,
    entries: weekEntries,
    todayBlocks: normalizedTodayBlocks,
    weekBlocks: calendarBlocksForWeek
  });
  const todayTactics = buildTodayTactics(
    todayScoreRows,
    weekEntries,
    today,
    normalizedTodayBlocks,
    calendarBlocksForWeek
  );
  const tacticMeta = new Map(
    todayScoreRows.map((item) => [item.tacticId, { tacticTitle: item.tacticTitle, goalTitle: item.goalTitle, unit: item.unit }])
  );
  const todayScheduledBlocks = normalizedTodayBlocks
    .map((block) => {
      const meta = tacticMeta.get(block.tacticId);
      if (!meta) return null;
      return {
        id: block.id,
        tacticId: block.tacticId,
        tacticTitle: meta.tacticTitle,
        goalTitle: meta.goalTitle,
        date: block.date,
        startTime: block.startTime,
        endTime: block.endTime,
        durationMinutes: block.durationMinutes,
        plannedValue: block.plannedValue,
        note: block.note,
        unit: meta.unit
      } satisfies TodayScheduledBlock;
    })
    .filter((block): block is TodayScheduledBlock => block !== null);
  const todaySummary: TodaySummary = {
    relevantCount: todayTactics.length,
    completedCount: todayTactics.filter((tactic) => tactic.isTodayComplete).length,
    remainingCount: todayTactics.filter((tactic) => !tactic.isTodayComplete).length,
    totalRemaining: todayTactics.reduce((sum, tactic) => sum + tactic.todayRemaining, 0)
  };
  const endDate = new Date(`${cycle.endDate}T00:00:00.000Z`);
  const now = new Date(`${todayDateString()}T00:00:00.000Z`);
  const daysLeft = Math.max(0, Math.floor((endDate.getTime() - now.getTime()) / 86400000) + 1);

  const reviews = (await pb.collection("weekly_reviews").getFullList({
    filter: pb.filter("cycle = {:c}", { c: cycle.id }),
    sort: "weekNumber"
  })).map(toWeeklyReview);

  const recentEventRecords = await pb.collection("events").getFullList({
    filter: pb.filter("cycle = {:c}", { c: cycle.id }),
    sort: "-id",
    perPage: 10
  });
  const recentEvents = recentEventRecords.map((record) => ({
    id: String(record.id),
    type: String(record.type),
    createdAt: String(record.created)
  }));

  return {
    cycle,
    currentWeek,
    weeks,
    goals: goals.map((goal) => ({
      ...goal,
      lagIndicators: lags.filter((lag) => lag.goalId === goal.id)
    })),
    score,
    tactics,
    daysLeft,
    todaySummary,
    todayTactics,
    todayScheduledBlocks,
    recentEvents,
    reviews
  };
}

// ---------------------------------------------------------------- events

export async function recordEvent(type: string, payload: unknown, cycleId?: string | null) {
  await pb.collection("events").create({
    cycle: cycleId ?? "",
    type,
    payloadJson: payload ? JSON.stringify(payload) : ""
  });
}

// ---------------------------------------------------------------- cycle update + daily-log range query (appended)

export async function updateCycle(input: { id: string; title?: string; vision?: string | null; startDate?: string }): Promise<Cycle> {
  const existing = await pb.collection("cycles").getOne(input.id).catch(() => null);
  if (!existing) throw new Error(`Cycle not found: ${input.id}`);
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    if (input.title.trim() === "") throw new Error("title must be non-empty");
    patch.title = input.title;
    const slugBase = slugify(input.title);
    let slug = slugBase;
    let index = 1;
    for (;;) {
      const clash = await pb
        .collection("cycles")
        .getFirstListItem(pb.filter("slug = {:s}", { s: slug }))
        .catch(() => null);
      if (!clash || String(clash.id) === input.id) break;
      index += 1;
      slug = `${slugBase}-${index}`;
    }
    patch.slug = slug;
  }
  if (input.vision !== undefined) patch.vision = input.vision;
  let newStart: Date | null = null;
  if (input.startDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || isNaN(parseDate(input.startDate).getTime())) {
      throw new Error(`Invalid startDate: ${input.startDate}`);
    }
    const entryPage = await pb
      .collection("tactic_entries")
      .getList(1, 1, { filter: pb.filter("cycle = {:c}", { c: input.id }) });
    if (entryPage.items.length > 0) {
      throw new Error("cycle has entries — --start refused, create a new cycle instead");
    }
    const start = startOfIsoWeek(parseDate(input.startDate));
    const end = addDays(start, 83);
    patch.startDate = toDateString(start);
    patch.endDate = toDateString(end);
    newStart = start;
  }
  if (Object.keys(patch).length === 0) return toCycle(existing);
  const updated = await pb.collection("cycles").update(input.id, patch);
  if (newStart) {
    const start: Date = newStart;
    const oldWeeks = await pb.collection("cycle_weeks").getFullList({
      filter: pb.filter("cycle = {:c}", { c: input.id })
    });
    for (const week of oldWeeks) {
      await pb.collection("cycle_weeks").delete(week.id);
    }
    const weeks = Array.from({ length: 12 }).map((_, i) => ({
      cycle: input.id,
      weekNumber: i + 1,
      startDate: toDateString(addDays(start, i * 7)),
      endDate: toDateString(addDays(start, i * 7 + 6)),
      label: `Week ${i + 1}`
    }));
    // sequential — the PB SDK auto-cancels parallel identical requests on one client
    for (const week of weeks) {
      await pb.collection("cycle_weeks").create(week);
    }
  }
  return toCycle(updated);
}

export async function listDailyLogs(cycleId: string, from: string, to: string): Promise<DailyLog[]> {
  const records = await pb.collection("daily_logs").getFullList({
    filter: pb.filter("cycle = {:c} && date >= {:f} && date <= {:t}", { c: cycleId, f: from, t: to }),
    sort: "date"
  });
  return records.map(toDailyLog);
}

// ---------------------------------------------------------------- calendar range query + backlog (appended)

export async function listCalendarBlocksForRange(cycleId: string, from: string, to: string) {
  validateDate(from);
  validateDate(to);
  const records = await pb.collection("tactic_calendar_blocks").getFullList({
    filter: pb.filter("cycle = {:c} && date >= {:f} && date <= {:t}", { c: cycleId, f: from, t: to }),
    sort: "date,startTime,id",
    expand: "tactic,tactic.goal"
  });
  return records.map((record) => {
    const tactic = record.expand?.tactic as Record<string, unknown> | undefined;
    const goal = record.expand?.["tactic.goal"] as Record<string, unknown> | undefined;
    return {
      ...toBlock(record),
      tacticTitle: String(tactic?.title ?? "Unknown"),
      goalTitle: String(goal?.title ?? "Unknown")
    };
  });
}

export async function listBacklogTactics(cycleId: string, from: string, to: string) {
  const rows = await listTactics(cycleId);
  const blocks = await listCalendarBlocksForRange(cycleId, from, to);
  const blockedTacticIds = new Set(blocks.map((block) => block.tacticId));
  return rows
    .filter(({ tactic }) => !blockedTacticIds.has(tactic.id))
    .map(({ tactic, goalTitle }) => ({
      id: tactic.id,
      title: tactic.title,
      goalTitle,
      trackingType: tactic.trackingType,
      unit: tactic.unit
    }));
}

export async function getCalendarBlock(blockId: string) {
  const record = await pb.collection("tactic_calendar_blocks").getOne(blockId).catch(() => null);
  return record ? toBlock(record) : null;
}

export async function undoLatestTacticEntry(tacticId: string, date: string) {
  const entries = await pb.collection("tactic_entries").getFullList({
    filter: pb.filter("tactic = {:t} && date = {:d}", { t: tacticId, d: date }),
    sort: "-created"
  });
  const latest = entries[0];
  if (!latest) return null;
  await pb.collection("tactic_entries").delete(latest.id);
  return latest.id as string;
}
