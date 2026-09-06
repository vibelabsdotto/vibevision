/**
 * vibevision commands — thin adapters over the VibeVision API
 * (contract docs/CONTRACT.md §4). No business logic here: scoring,
 * validation and progress live server-side; the CLI maps snake_case
 * rows to the human-readable tables below.
 */
import type {
  Cycle,
  DashboardData,
  Goal,
  LagIndicator,
  Tactic
} from "@/app/core/shapes";
import {
  mapCycle,
  mapDashboard,
  mapGoal,
  mapLag,
  mapScore,
  mapTactic,
  type ApiRow
} from "@/app/core/shapes";
import { apiFetch } from "./api";
import { assertInstance, connect, health } from "./client";

export type Ctx = { instance: string; json: boolean };
/** Parsed flag bag — `instance` and `json` are reserved, everything else is a command flag. */
export type Args = { instance?: string; json?: boolean } & Record<string, any>;

const TRACKING_TYPES = ["boolean", "quantity", "duration"] as const;
const RECURRENCE_TYPES = ["daily", "weekdays", "times_per_week", "once"] as const;
type TrackingType = (typeof TRACKING_TYPES)[number];
type RecurrenceType = (typeof RECURRENCE_TYPES)[number];

const EXECUTION_STYLES = ["toggle", "occurrence", "volume"] as const;
type ExecutionStyle = (typeof EXECUTION_STYLES)[number];

/**
 * Execution style derivation (same rule as the API: missing `executionStyle`
 * is derived lazily, never backfilled).
 */
function deriveExecutionStyle(trackingType: string, recurrenceType: string): ExecutionStyle {
  if (trackingType === "boolean" && (recurrenceType === "daily" || recurrenceType === "weekdays")) return "toggle";
  if (trackingType === "boolean") return "occurrence";
  return "volume";
}

/** Stored value wins; otherwise derive from tracking×recurrence (lazy, no backfill). */
function getExecutionStyle(tactic: { executionStyle?: unknown; trackingType?: unknown; recurrenceType?: unknown }): ExecutionStyle {
  const raw = (tactic as { executionStyle?: unknown }).executionStyle;
  if (raw === "toggle" || raw === "occurrence" || raw === "volume") return raw;
  return deriveExecutionStyle(String(tactic.trackingType ?? ""), String(tactic.recurrenceType ?? ""));
}

function assertStyleMatches(style: ExecutionStyle, trackingType: string, recurrenceType: string): void {
  const expected = deriveExecutionStyle(trackingType, recurrenceType);
  if (style !== expected) {
    throw new Error(
      `--style ${style} contradicts --tracking ${trackingType} + --recurrence ${recurrenceType} (expected ${expected}): ` +
        `toggle = boolean×daily|weekdays, occurrence = boolean×times_per_week|once, volume = quantity|duration`
    );
  }
}

/**
 * parseFlags keeps kebab-case as-is (`--starts-week` → flags["starts-week"]),
 * so command code must read both spellings. This helper does that.
 */
function flag(args: Args, ...names: string[]): string | undefined {
  for (const name of names) {
    const v = args[name];
    if (typeof v === "string") return v;
  }
  return undefined;
}

const indent = "  ";
function pad(value: string, width: number): string {
  return value.length > width ? value.slice(0, width - 1) + "…" : value + " ".repeat(width - value.length);
}
function table(rows: Array<Record<string, string | number>>, headers: string[]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[headers[i]] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i])).join("  ");
  const out = [line(headers), line(widths.map((w) => "─".repeat(w)))];
  for (const row of rows) out.push(line(headers.map((h) => String(row[h] ?? ""))));
  return out.join("\n");
}
function indentBlock(block: string, prefix: string): string {
  return block
    .split("\n")
    .map((l) => (l ? prefix + l : l))
    .join("\n");
}

export function emit(ctx: Ctx, text: string, data: unknown): void {
  if (ctx.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    process.stdout.write(text + "\n");
  }
}

function cycleLabel(cycle: { id: string; title: string; status: string }): string {
  return `${cycle.title} (${cycle.id.slice(0, 13)}${cycle.status === "active" ? ", active" : ""})`;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------- auth

export async function cmdHealth(args: Args, ctx: Ctx): Promise<void> {
  // health is the one command that works without a token — it hits the public /health
  const instance = assertInstance(args.instance);
  const result = await health(instance);
  if (ctx.json) {
    emit(ctx, "", { instance, ok: result.ok, status: result.status, body: result.body });
  } else if (result.ok) {
    console.log(`✓ ${instance} — API healthy`);
  } else {
    console.error(`✗ ${instance} — unreachable (status ${result.status}): ${String(result.body)}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------- helpers (API reads)

async function listCycles(): Promise<Cycle[]> {
  const data = await apiFetch<{ cycles: ApiRow[] }>("GET", "/v1/cycles?limit=100");
  return data.cycles.map(mapCycle);
}

async function getActiveCycle(): Promise<Cycle | null> {
  const data = await apiFetch<{ cycle: ApiRow | null }>("GET", "/v1/cycles/active");
  return data.cycle ? mapCycle(data.cycle) : null;
}

async function getCycleById(id: string): Promise<Cycle | null> {
  try {
    const data = await apiFetch<{ cycle: ApiRow }>("GET", `/v1/cycles/${id}`);
    return mapCycle(data.cycle);
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

async function currentWeek(cycleId: string, date = todayDateString()): Promise<number> {
  const data = await apiFetch<{ cycle_weeks: ApiRow[] }>(
    "GET",
    `/v1/cycle-weeks?cycle_id=${encodeURIComponent(cycleId)}&limit=100`
  );
  const week = data.cycle_weeks.find((w) => String(w.start_date) <= date && String(w.end_date) >= date);
  return week ? Number(week.week_number) : 1;
}

async function listGoals(cycleId: string): Promise<Goal[]> {
  const data = await apiFetch<{ goals: ApiRow[] }>(
    "GET",
    `/v1/goals?cycle_id=${encodeURIComponent(cycleId)}&limit=100`
  );
  return data.goals.map(mapGoal);
}

async function listLags(goalId: string): Promise<LagIndicator[]> {
  const data = await apiFetch<{ lag_indicators: ApiRow[] }>(
    "GET",
    `/v1/lag-indicators?goal_id=${encodeURIComponent(goalId)}&limit=100`
  );
  return data.lag_indicators.map(mapLag);
}

async function getTactic(tacticId: string): Promise<Tactic | null> {
  try {
    const data = await apiFetch<{ tactic: ApiRow }>("GET", `/v1/tactics/${tacticId}`);
    return mapTactic(data.tactic);
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------- cycles

export async function cmdCycles(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycles = await listCycles();
  if (ctx.json) return emit(ctx, "", { instance, cycles });
  if (cycles.length === 0) return console.log("No cycles yet. Create one with: vibevision cycle create --title \"…\" --start 2026-09-07");
  const active = await getActiveCycle();
  for (const c of cycles) {
    const marker = c.id === active?.id ? "* " : "  ";
    console.log(`${marker} ${pad(c.title, 34)} ${c.status.padEnd(9)} ${c.startDate} → ${c.endDate}`);
    if (c.vision) console.log(indentBlock(c.vision.replace(/\n+/g, "\n" + indent), indent + indent));
  }
  console.log(`\n${cycles.length} cycle(s) on ${instance}`);
}

export async function cmdCycleCreate(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  if (!args.title || !args.start) throw new Error("vibevision cycle create needs --title and --start (ISO date, e.g. 2026-09-07)");
  const data = await apiFetch<{ cycle: ApiRow }>("POST", "/v1/cycles", {
    title: args.title,
    start_date: args.start,
    vision: args.vision,
    status: args.activate ? "active" : "planned"
  });
  const cycle = mapCycle(data.cycle);
  emit(ctx, `Created cycle "${cycle.title}" ${cycle.id} (${cycle.startDate} → ${cycle.endDate})${args.activate ? " and activated it" : ""}`, { instance, cycle });
}

export async function cmdCycleActivate(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  if (!args.slug && !args.id) throw new Error("vibevision cycle activate needs --slug <slug> or --id <cycleId> (see: vibevision cycles)");
  let cycle: Cycle | null = null;
  if (args.slug) {
    const cycles = await listCycles();
    cycle = cycles.find((c) => c.slug === args.slug) ?? null;
    if (!cycle) throw new Error(`Cycle not found: ${args.slug}`);
  } else {
    cycle = await getCycleById(args.id);
    if (!cycle) throw new Error(`Cycle not found: ${args.id}`);
  }
  const data = await apiFetch<{ cycle: ApiRow }>("POST", `/v1/cycles/${cycle.id}/activate`, {});
  const activated = mapCycle(data.cycle);
  emit(ctx, `Activated "${activated.title}" (${activated.id})`, { instance, cycle: activated });
}

export async function cmdCycleUpdate(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const id = args.id ?? args.cycle;
  if (!id) throw new Error("vibevision cycle update needs --id <cycleId> (see: vibevision cycles)");
  if (args.title === undefined && args.vision === undefined && args.start === undefined)
    throw new Error("vibevision cycle update needs at least one of --title, --vision, --start");
  const data = await apiFetch<{ cycle: ApiRow }>("PUT", `/v1/cycles/${id}`, {
    title: args.title,
    vision: args.vision,
    start_date: args.start
  });
  const cycle = mapCycle(data.cycle);
  const changed = [
    args.title !== undefined ? `title="${cycle.title}"` : null,
    args.vision !== undefined ? "vision updated" : null,
    args.start !== undefined ? `dates ${cycle.startDate} → ${cycle.endDate}` : null
  ].filter(Boolean);
  emit(ctx, `✓ Updated cycle ${cycle.id} — ${cycle.title}${changed.length ? ` (${changed.join(", ")})` : ""}`, {
    instance,
    cycle
  });
}

// ---------------------------------------------------------------------- goals

export async function cmdGoals(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycle = args.id ? await getCycleById(args.id) : await getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id> or vibevision cycle activate …");
  const rows = [];
  for (const goal of await listGoals(cycle.id)) {
    const lags = await listLags(goal.id);
    const done = lags.filter((l) => l.achieved).length;
    rows.push({
      id: goal.id,
      goal: goal.title,
      status: goal.status,
      lags: lags.length ? `${done}/${lags.length} achieved` : "—"
    });
    for (const lag of lags) {
      rows.push({
        id: "",
        goal: `└ ${lag.title}${lag.targetValue != null ? ` — ${lag.currentValue ?? 0}/${lag.targetValue} ${lag.unit ?? ""}` : lag.achieved ? " — done" : " — in progress"}`,
        status: lag.achieved ? "done" : "",
        lags: ""
      });
    }
  }
  if (ctx.json) return emit(ctx, "", { instance, cycle: cycle.id, goals: rows });
  console.log(`Goals — ${cycleLabel(cycle)}`);
  console.log(table(rows, ["id", "goal", "status", "lags"]));
}

export async function cmdGoalAdd(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycle = args.cycle ? await getCycleById(args.cycle) : await getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const data = await apiFetch<{ goal: ApiRow }>("POST", "/v1/goals", {
    cycle_id: cycle.id,
    title: args.title,
    description: args.description
  });
  const goal = mapGoal(data.goal);
  emit(ctx, `Added goal "${goal.title}" ${goal.id} to "${cycle.title}"`, { instance, goal });
}

// ---------------------------------------------------------------------- tactics

export async function cmdTactics(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycle = args.cycle ? await getCycleById(args.cycle) : await getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const goals = await listGoals(cycle.id);
  const goalTitles = new Map(goals.map((g) => [g.id, g.title]));
  const rows = [];
  for (const goal of goals) {
    const data = await apiFetch<{ tactics: ApiRow[] }>(
      "GET",
      `/v1/tactics?goal_id=${encodeURIComponent(goal.id)}&limit=100`
    );
    for (const row of data.tactics) {
      const tactic = mapTactic(row);
      const plan = tactic.recurrenceType === "once" ? `once` : `${tactic.targetValue}${tactic.unit ? " " + tactic.unit : ""} ${tactic.recurrenceType}`;
      rows.push({
        id: tactic.id,
        tactic: tactic.title,
        plan,
        goal: goalTitles.get(goal.id) ?? "",
        weeks: tactic.startsWeek || tactic.endsWeek ? `W${tactic.startsWeek ?? "?"}–${tactic.endsWeek ?? "?"}` : "all",
        on: tactic.active ? "yes" : "no",
        executionStyle: getExecutionStyle({
          executionStyle: tactic.executionStyle,
          trackingType: tactic.trackingType,
          recurrenceType: tactic.recurrenceType
        })
      });
    }
  }
  if (ctx.json) return emit(ctx, "", { instance, tactics: rows });
  console.log(table(rows, ["id", "tactic", "plan", "goal", "weeks", "on"]));
  console.log(`\n${rows.length} tactic(s)`);
}

const TACTIC_ADD_HELP = `vibevision tactic add — create a tactic on a goal

Usage: vibevision tactic add --goal <id> --title "…" [flags]

Flags:
  --tracking quantity|boolean|duration            (default quantity)
  --recurrence daily|weekdays|times_per_week|once (default daily)
  --style toggle|occurrence|volume                (alias --execution-style; default derived:
                                                  boolean×daily|weekdays → toggle,
                                                  boolean×times_per_week|once → occurrence,
                                                  quantity|duration → volume)
  --target <n> --count <n> --unit <text>
  --week <n> --starts-week <n> --ends-week <n>

A --style that contradicts tracking×recurrence is a hard error
(e.g. --style toggle with --tracking quantity).

Examples:
  vibevision tactic add --goal <id> --title "Publish 7 posts" --tracking quantity --recurrence times_per_week --target 7 --unit posts
  vibevision tactic add --goal <id> --title "Inbox zero" --tracking boolean --recurrence daily --style toggle
  vibevision tactic add --goal <id> --title "Run 3x" --tracking boolean --recurrence times_per_week --count 3 --style occurrence`;

export async function cmdTacticAdd(args: Args, ctx: Ctx): Promise<void> {
  if (args.help === true || args.h === true) {
    console.log(TACTIC_ADD_HELP);
    return;
  }
  const instance = connect(args.instance);
  if (!args.goal || !args.title) throw new Error("vibevision tactic add needs --goal <id> and --title \"…\"");
  const trackingType: TrackingType = args.tracking ?? "quantity";
  if (!TRACKING_TYPES.includes(trackingType)) throw new Error(`--tracking must be one of: ${TRACKING_TYPES.join(" | ")}`);
  const recurrenceType: RecurrenceType = args.recurrence ?? "daily";
  if (!RECURRENCE_TYPES.includes(recurrenceType)) throw new Error(`--recurrence must be one of: ${RECURRENCE_TYPES.join(" | ")}`);
  const rawStyle = flag(args, "style", "execution-style", "executionStyle");
  let executionStyle: ExecutionStyle;
  if (rawStyle !== undefined) {
    if (!EXECUTION_STYLES.includes(rawStyle as ExecutionStyle)) throw new Error(`--style must be one of: ${EXECUTION_STYLES.join(" | ")}`);
    executionStyle = rawStyle as ExecutionStyle;
    assertStyleMatches(executionStyle, trackingType, recurrenceType);
  } else {
    executionStyle = deriveExecutionStyle(trackingType, recurrenceType);
  }
  // boolean toggles imply target 1; quantity/duration need an explicit --target.
  const targetValue = args.target
    ? Number(args.target)
    : trackingType === "boolean"
      ? 1
      : undefined;
  const startsWeekRaw = flag(args, "starts-week", "startsWeek");
  const endsWeekRaw = flag(args, "ends-week", "endsWeek");
  // unit is NOT NULL per contract; boolean toggles get a sane default.
  const unit = args.unit ?? (trackingType === "boolean" ? "checkins" : undefined);
  const data = await apiFetch<{ tactic: ApiRow }>("POST", "/v1/tactics", {
    goal_id: args.goal,
    title: args.title,
    tracking_type: trackingType,
    recurrence_type: recurrenceType,
    execution_style: executionStyle,
    recurrence_count: args.count ? Number(args.count) : undefined,
    target_value: targetValue,
    unit,
    starts_week: startsWeekRaw ? Number(startsWeekRaw) : undefined,
    ends_week: endsWeekRaw ? Number(endsWeekRaw) : undefined
  });
  const tactic = mapTactic(data.tactic);
  if (args.week) {
    await apiFetch("POST", "/v1/tactic-schedules", {
      tactic_id: tactic.id,
      week_number: Number(args.week),
      planned_target: args.target ? Number(args.target) : tactic.targetValue,
      required: true
    });
  }
  emit(ctx, `Added tactic "${tactic.title}" ${tactic.id} (style ${executionStyle})`, { instance, tactic: { ...tactic, executionStyle } });
}

// ---------------------------------------------------------------------- today / score

/**
 * Enrich a today row for --json: executionStyle (stored or derived),
 * weekRemaining (weekly remainder), and the "pool" kind for flexible
 * weekly-pool tactics (occurrence/volume without a fixed daily target).
 */
function enrichTodayRow<T extends Record<string, any>>(row: T): T & Record<string, unknown> {
  const executionStyle = getExecutionStyle(row as { executionStyle?: unknown; trackingType?: unknown; recurrenceType?: unknown });
  const rawKind = String((row as Record<string, unknown>).todayKind ?? "");
  const isPool = rawKind === "pool" || (rawKind === "unscheduled" && executionStyle !== "toggle");
  const remaining = Number((row as Record<string, unknown>).remaining ?? 0);
  return {
    ...row,
    executionStyle,
    todayKind: isPool ? "pool" : rawKind,
    todayTarget: isPool ? null : (row as Record<string, unknown>).todayTarget,
    weekRemaining: remaining
  };
}

async function getDashboard(cycleId?: string): Promise<DashboardData> {
  const params = cycleId ? `?cycle_id=${encodeURIComponent(cycleId)}` : "";
  const data = await apiFetch<{ dashboard: ApiRow | null }>("GET", `/v1/dashboard${params}`);
  if (!data.dashboard) throw new Error("No active cycle found.");
  return mapDashboard(data.dashboard);
}

export async function cmdToday(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const dash = await getDashboard(args.cycle);
  if (ctx.json) {
    const today = dash.todayTactics.map((t) => enrichTodayRow(t as unknown as Record<string, unknown>));
    return emit(ctx, "", { instance, today, summary: dash.todaySummary, scheduled: dash.todayScheduledBlocks });
  }
  console.log(`Today — ${cycleLabel(dash.cycle)}, week ${dash.currentWeek}/12, ${dash.daysLeft} days left`);
  const rows = dash.todayTactics.map((t) => ({
    id: t.tacticId,
    tactic: t.tacticTitle,
    today: t.todayActual != null ? String(t.todayActual) : "—",
    remaining: t.remaining != null ? String(t.remaining) : "—",
    done: t.isTodayComplete ? "✓" : "",
    goal: t.goalTitle
  }));
  console.log(table(rows, ["id", "tactic", "today", "remaining", "done", "goal"]));
  const s = dash.todaySummary;
  console.log(`\n${s.completedCount}/${s.relevantCount} complete today · ${s.remainingCount} open · ${s.totalRemaining} units remaining`);
}

export async function cmdScore(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycle = args.cycle ? await getCycleById(args.cycle) : await getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const week = args.week ? Number(args.week) : await currentWeek(cycle.id);
  const asOfDate = flag(args, "as-of", "asOf", "asOfDate");
  const params = new URLSearchParams({ week: String(week) });
  if (asOfDate) params.set("as_of", asOfDate);
  const data = await apiFetch<{ score: ApiRow }>("GET", `/v1/cycles/${cycle.id}/score?${params}`);
  const score = mapScore(data.score);
  if (ctx.json) {
    const tacticScores = score.tacticScores.map((t) => ({ ...t, executionStyle: getExecutionStyle(t) }));
    return emit(ctx, "", { instance, cycle: cycle.id, week, score: { ...score, tacticScores } });
  }
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  console.log(`Week ${week}/12 — ${cycle.title}: ${pct(score.weeklyScore)} (${score.status})`);
  for (const g of score.goalScores) console.log(`${indent}${g.goalTitle}: ${pct(g.score)} (${g.status})`);
  console.log("");
  const rows = score.tacticScores.map((t) => ({
    tactic: t.tacticTitle,
    planned: `${t.actual}/${t.planned}`,
    full: t.fullWeekPlanned != null ? `/ ${t.fullWeekPlanned} wk` : "",
    score: pct(t.score),
    status: t.status
  }));
  console.log(indentBlock(table(rows, ["tactic", "planned", "full", "score", "status"]), indent));
}

// ---------------------------------------------------------------------- report

export async function cmdReport(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycle = args.cycle ? await getCycleById(args.cycle) : await getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const week = args.week ? Number(args.week) : await currentWeek(cycle.id);
  if (ctx.json) {
    const data = await apiFetch<unknown>("GET", `/v1/cycles/${cycle.id}/weeks/${week}/report`);
    return emit(ctx, "", { instance, cycle: cycle.id, week, report: data });
  }
  const markdown = await apiFetch<string>("GET", `/v1/cycles/${cycle.id}/weeks/${week}/report?format=markdown`);
  console.log(markdown);
}

// ---------------------------------------------------------------------- log (entries + check-ins)

const LOG_ENTRY_HELP = `vibevision log entry — log progress on a tactic

Usage: vibevision log entry --tactic <id> [--value <n>] [--note "…"] [--date 2026-09-02|today]

  occurrence tactics (boolean × times_per_week|once): --value must be a positive whole number.
  quantity tactics: --value defaults to 1 when omitted.
  duration tactics: --value is required (minutes).
  toggle tactics (boolean × daily|weekdays): --value optional, defaults to 1 (complete).`;

export async function cmdLogEntry(args: Args, ctx: Ctx): Promise<void> {
  if (args.help === true || args.h === true) {
    console.log(LOG_ENTRY_HELP);
    return;
  }
  const instance = connect(args.instance);
  if (!args.tactic) throw new Error("vibevision log entry needs --tactic <id> (see: vibevision tactics)");
  const tactic = await getTactic(args.tactic);
  if (!tactic) throw new Error(`Tactic not found: ${args.tactic}`);
  const executionStyle = getExecutionStyle(tactic);
  const trackingType = String(tactic.trackingType);
  let value = args.value != null ? Number(args.value) : undefined;
  if (value !== undefined && !Number.isFinite(value)) throw new Error(`--value must be a number (got "${args.value}")`);
  if (executionStyle === "occurrence") {
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
      throw new Error(`occurrence tactics need a positive whole --value (got "${args.value}")`);
    }
  } else if (trackingType === "quantity") {
    if (value === undefined) value = 1;
  } else if (trackingType === "duration") {
    if (value === undefined) throw new Error("duration tactics need --value <minutes> (e.g. vibevision log entry --tactic <id> --value 30)");
  }
  const rawDate = args.date ?? todayDateString();
  const data = await apiFetch<{ tactic_entry: ApiRow }>("POST", "/v1/entries/log", {
    tactic_id: args.tactic,
    value,
    note: args.note,
    date: rawDate === "today" ? todayDateString() : rawDate
  });
  emit(ctx, `Logged entry on "${tactic.title}" (entry ${String(data.tactic_entry.id ?? "").slice(0, 13)}${value != null ? `, value ${value}` : ""})`, { instance, entry: data.tactic_entry });
}

export async function cmdLogComplete(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  if (!args.tactic) throw new Error("vibevision log complete needs --tactic <id>");
  const data = await apiFetch<{ tactic_entry: ApiRow }>("POST", "/v1/entries/log", {
    tactic_id: args.tactic,
    value: 1,
    completed: true,
    date: todayDateString()
  });
  const tactic = await getTactic(args.tactic);
  emit(ctx, `Marked "${tactic?.title ?? args.tactic}" complete (entry ${String(data.tactic_entry.id ?? "").slice(0, 13)})`, { instance, entry: data.tactic_entry });
}

export async function cmdLogMorning(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const oneThing = flag(args, "one-thing", "oneThing");
  const data = await apiFetch<{ daily_log: ApiRow }>("POST", "/v1/daily-logs/checkin", {
    kind: "morning",
    one_thing: oneThing,
    stress_level: args.stress != null ? Number(args.stress) : undefined,
    date: args.date
  });
  emit(ctx, `Morning check-in saved${oneThing ? ` — one thing: ${oneThing}` : ""}`, { instance, log: data.daily_log });
}

export async function cmdLogEvening(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const deepWorkRaw = flag(args, "deep-work", "deepWork");
  const data = await apiFetch<{ daily_log: ApiRow }>("POST", "/v1/daily-logs/checkin", {
    kind: "evening",
    agency_score: args.agency != null ? Number(args.agency) : undefined,
    stress_level: args.stress != null ? Number(args.stress) : undefined,
    wins: args.wins,
    avoidance: args.avoidance,
    notes: args.notes,
    deep_work_minutes: deepWorkRaw != null ? Number(deepWorkRaw) : undefined,
    comfort_zone_done: args.comfort === "true",
    date: args.date
  });
  emit(ctx, `Evening check-in saved`, { instance, log: data.daily_log });
}

export async function cmdLogList(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycle = args.cycle ? await getCycleById(args.cycle) : await getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const date = args.date ?? todayDateString();
  const data = await apiFetch<{ daily_log: ApiRow | null }>(
    "GET",
    `/v1/daily-logs?cycle_id=${encodeURIComponent(cycle.id)}&date=${encodeURIComponent(date)}`
  );
  const log = data.daily_log;
  if (ctx.json) return emit(ctx, "", { instance, cycle: cycle.id, date, log });
  if (!log) return console.log(`No log for ${date}.`);
  const lines = [
    `Log ${date} — ${cycleLabel(cycle)}`,
    `  one thing:   ${log.one_thing ?? "—"}`,
    `  stress:      ${log.stress_level ?? "—"}`,
    `  agency:      ${log.agency_score ?? "—"}`,
    `  deep work:   ${log.deep_work_minutes} min`,
    `  comfort:     ${Number(log.comfort_zone_done) === 1 ? "done" : "not done"}`,
    `  avoidance:   ${log.avoidance_trigger ?? "—"}`,
    `  notes:       ${log.notes ?? "—"}`
  ];
  console.log(lines.join("\n"));
}

// ---------------------------------------------------------------------- dashboard

export async function cmdDashboard(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycle = args.cycle ? await getCycleById(args.cycle) : await getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const params = new URLSearchParams({ cycle_id: cycle.id });
  if (args.week) params.set("as_of", args.week);
  const asOfDate = flag(args, "as-of", "asOf", "asOfDate");
  if (asOfDate) params.set("as_of", asOfDate);
  const data = await apiFetch<{ dashboard: ApiRow | null }>(`GET`, `/v1/dashboard${params}`);
  if (!data.dashboard) throw new Error("No cycle data found.");
  const dash = mapDashboard(data.dashboard);
  if (ctx.json) return emit(ctx, "", { instance, dashboard: dash });
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  console.log(`DASHBOARD — ${cycleLabel(cycle)}`);
  console.log(`week ${dash.currentWeek}/12 · ${dash.daysLeft} days left · score ${pct(dash.score.weeklyScore)} (${dash.score.status})`);
  for (const g of dash.goals) {
    const lags = (g as { lagIndicators?: { title: string; targetValue: number | null; currentValue: number | null; unit: string | null; achieved: boolean }[] }).lagIndicators ?? [];
    console.log(`${indent}• ${g.title} ${g.status ? `[${g.status}]` : ""}`);
    for (const lag of lags) {
      const progress =
        lag.targetValue != null ? `${lag.currentValue ?? 0}/${lag.targetValue} ${lag.unit ?? ""}` : lag.achieved ? "done" : "tracking";
      console.log(`${indent}${indent}└ ${lag.title} — ${progress}`);
    }
  }
  const s = dash.todaySummary;
  console.log(`${indent}today: ${s.completedCount}/${s.relevantCount} tactics complete, ${s.totalRemaining} units remaining`);
}

// ---------------------------------------------------------------------- lag indicator updates

export async function cmdLagUpdate(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  if (!args.lag) throw new Error("vibevision lag update needs --lag <id> and --value <n>");
  const data = await apiFetch<{ lag_indicator: ApiRow }>("PUT", `/v1/lag-indicators/${args.lag}`, {
    current_value: Number(args.value)
  });
  const lag = mapLag(data.lag_indicator);
  emit(ctx, `Updated lag "${lag.title}" → ${lag.currentValue} ${lag.unit ?? ""}`, { instance, lag });
}

export async function cmdLagDone(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  if (!args.lag) throw new Error("vibevision lag done needs --lag <id>");
  const data = await apiFetch<{ lag_indicator: ApiRow }>("PUT", `/v1/lag-indicators/${args.lag}/achieve`, {});
  const lag = mapLag(data.lag_indicator);
  emit(ctx, `Marked lag "${lag.title}" achieved`, { instance, lag });
}

// ---------------------------------------------------------------------- tokens

export async function cmdTokensCreate(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const name = args.name ?? `cli-${todayDateString()}`;
  const data = await apiFetch<{ id: string; token: string; prefix: string }>("POST", "/v1/tokens", { name });
  emit(ctx, `Token created (${data.prefix}…). Store it now — it won't be shown again:\n${data.token}`, {
    instance,
    id: data.id,
    prefix: data.prefix
  });
}

export async function cmdTokensLs(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const data = await apiFetch<{ tokens: Array<Record<string, unknown>> }>("GET", "/v1/tokens");
  if (ctx.json) return emit(ctx, "", { instance, tokens: data.tokens });
  if (!data.tokens.length) return console.log("No tokens yet. Create one with: vibevision tokens create --name <label>");
  console.log(table(data.tokens.map((t) => ({
    id: String(t.id).slice(0, 13),
    name: String(t.name ?? ""),
    prefix: `${String(t.prefix ?? "")}…`,
    last_used: String(t.last_used_at ?? "never")
  })), ["id", "name", "prefix", "last_used"]));
}

export async function cmdTokensRevoke(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const id = args.id ?? args.token;
  if (!id) throw new Error("vibevision tokens revoke needs --id <tokenId> (see: vibevision tokens ls)");
  await apiFetch("DELETE", `/v1/tokens/${id}`);
  emit(ctx, `Revoked token ${id}`, { instance, id });
}
