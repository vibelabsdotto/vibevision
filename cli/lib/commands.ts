/**
 * vibevision commands — thin adapters over the app's core functions (src/app/core).
 * The CLI never duplicates business logic: it points the shared PocketBase
 * client at the configured instance (lib/client.ts) and calls the same
 * functions the web app renders from.
 */
import { UsageError, assertInstance, connect, health } from "./client";
import { pb } from "@/app/lib/pb";
import * as Core from "@/app/core";

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
 * Execution style derivation (same rule as core: missing `executionStyle`
 * is derived lazily, never backfilled).
 *   boolean × daily|weekdays          → toggle
 *   boolean × times_per_week|once     → occurrence
 *   quantity|duration × anything      → volume
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

// ---------------------------------------------------------------------- auth

export async function cmdHealth(args: Args, ctx: Ctx): Promise<void> {
  // health is the one command that works without an API key — it hits the public /api/health
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

// ---------------------------------------------------------------------- cycles

export async function cmdCycles(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycles = await Core.listCycles();
  if (ctx.json) return emit(ctx, "", { instance, cycles });
  if (cycles.length === 0) return console.log("No cycles yet. Create one with: vibevision cycle create --title \"…\" --start 2026-09-07");
  const active = await Core.getActiveCycle();
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
  const cycle = await Core.createCycle({
    title: args.title,
    startDate: args.start,
    vision: args.vision,
    status: args.activate ? "active" : "planned"
  });
  emit(ctx, `Created cycle "${cycle.title}" ${cycle.id} (${cycle.startDate} → ${cycle.endDate})${args.activate ? " and activated it" : ""}`, { instance, cycle });
}

export async function cmdCycleActivate(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  if (!args.slug && !args.id) throw new Error("vibevision cycle activate needs --slug <slug> or --id <cycleId> (see: vibevision cycles)");
  const cycle = args.slug
    ? await Core.activateCycleBySlug(args.slug)
    : (await Core.getCycleById(args.id)) ?? (() => {
        throw new Error(`Cycle not found: ${args.id}`);
      })();
  if (!args.slug) await Core.activateCycleById(cycle.id);
  emit(ctx, `Activated "${cycle.title}" (${cycle.id})`, { instance, cycle });
}

export async function cmdCycleUpdate(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const id = args.id ?? args.cycle;
  if (!id) throw new Error("vibevision cycle update needs --id <cycleId> (see: vibevision cycles)");
  if (args.title === undefined && args.vision === undefined && args.start === undefined)
    throw new Error("vibevision cycle update needs at least one of --title, --vision, --start");
  const cycle = await Core.updateCycle({ id, title: args.title, vision: args.vision, startDate: args.start });
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
  const cycle = args.id ? await Core.getCycleById(args.id) : await Core.getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id> or vibevision cycle activate …");
  const rows = [];
  for (const goal of await Core.listGoals(cycle.id)) {
    const lags = await Core.listLags(goal.id);
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
  const cycle = args.cycle ? await Core.getCycleById(args.cycle) : await Core.getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const goal = await Core.addGoal(cycle.id, args.title!, args.description);
  emit(ctx, `Added goal "${goal.title}" ${goal.id} to "${cycle.title}"`, { instance, goal });
}

// ---------------------------------------------------------------------- tactics

export async function cmdTactics(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const rows = [];
  const list = await Core.listTactics();
  for (const { tactic, goalTitle } of list) {
    const plan = tactic.recurrenceType === "once" ? `once` : `${tactic.targetValue}${tactic.unit ? " " + tactic.unit : ""} ${tactic.recurrenceType}`;
    rows.push({
      id: tactic.id,
      tactic: tactic.title,
      plan,
      goal: goalTitle,
      weeks: tactic.startsWeek || tactic.endsWeek ? `W${tactic.startsWeek ?? "?"}–${tactic.endsWeek ?? "?"}` : "all",
      on: tactic.active ? "yes" : "no",
      executionStyle: getExecutionStyle(tactic)
    });
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
  const startsWeekRaw = flag(args, "starts-week", "startsWeek");
  const endsWeekRaw = flag(args, "ends-week", "endsWeek");
  const tactic = await Core.addTactic({
    goalId: args.goal,
    title: args.title,
    trackingType,
    recurrenceType,
    recurrenceCount: args.count ? Number(args.count) : undefined,
    targetValue: args.target ? Number(args.target) : undefined,
    unit: args.unit,
    week: args.week ? Number(args.week) : undefined,
    startsWeek: startsWeekRaw ? Number(startsWeekRaw) : undefined,
    endsWeek: endsWeekRaw ? Number(endsWeekRaw) : undefined
  });
  // persist the (explicit or derived) style on the record; core reads it
  // lazily when present. Best-effort: the tactic itself is already created.
  try {
    await pb.collection("tactics").update(tactic.id, { executionStyle });
  } catch {
    /* column may predate the migration on this instance — style still reported below */
  }
  emit(ctx, `Added tactic "${tactic.title}" ${tactic.id} (style ${executionStyle})`, { instance, tactic: { ...tactic, executionStyle } });
}

// ---------------------------------------------------------------------- today / score

/**
 * Enrich a today row for --json: executionStyle (stored or derived),
 * weekRemaining (weekly remainder), and the "pool" kind for flexible
 * weekly-pool tactics (occurrence/volume without a fixed daily target).
 * BREAKING vs earlier builds: todayKind can now be "pool", in which case
 * todayTarget is null and the actionable number is weekRemaining.
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

export async function cmdToday(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const dash = await Core.getDashboardData();
  if (!dash) throw new Error("No active cycle found.");
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
  const cycle = args.cycle ? await Core.getCycleById(args.cycle) : await Core.getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const week = args.week ? Number(args.week) : (await Core.getCurrentWeekNumber(cycle.id)) ?? 1;
  const asOfDate = flag(args, "as-of", "asOf", "asOfDate");
  const score = await Core.getWeekScore(cycle.id, week, { asOfDate });
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
  const cycle = args.cycle ? await Core.getCycleById(args.cycle) : await Core.getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const week = args.week ? Number(args.week) : (await Core.getCurrentWeekNumber(cycle.id)) ?? 1;
  const report = await Core.getWeekReport(cycle.id, week);
  if (ctx.json) return emit(ctx, "", { instance, cycle: cycle.id, week, report });
  console.log(Core.renderWeekReportMarkdown(report));
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
  const tactic = await Core.getTactic(args.tactic);
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
  const entry = await Core.addTacticEntry({
    tacticId: args.tactic,
    value,
    note: args.note,
    date: args.date ?? Core.todayDateString()
  });
  emit(ctx, `Logged entry on "${tactic.title}" (entry ${String(entry.id ?? "").slice(0, 13)}${value != null ? `, value ${value}` : ""})`, { instance, entry });
}

export async function cmdLogComplete(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  if (!args.tactic) throw new Error("vibevision log complete needs --tactic <id>");
  const entry = await Core.completeTactic(args.tactic);
  emit(ctx, `Marked "${(await Core.getTactic(args.tactic))?.title ?? args.tactic}" complete (entry ${String(entry.id ?? "").slice(0, 13)})`, { instance, entry });
}

export async function cmdLogMorning(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const oneThing = flag(args, "one-thing", "oneThing");
  const log = await Core.morning({ oneThing, stress: args.stress != null ? Number(args.stress) : undefined, date: args.date });
  emit(ctx, `Morning check-in saved${oneThing ? ` — one thing: ${oneThing}` : ""}`, { instance, log });
}

export async function cmdLogEvening(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const deepWorkRaw = flag(args, "deep-work", "deepWork");
  const log = await Core.evening({
    agency: args.agency != null ? Number(args.agency) : undefined,
    stress: args.stress != null ? Number(args.stress) : undefined,
    wins: args.wins,
    avoidance: args.avoidance,
    notes: args.notes,
    deepWorkMinutes: deepWorkRaw != null ? Number(deepWorkRaw) : undefined,
    comfortZoneDone: args.comfort === "true",
    date: args.date
  });
  emit(ctx, `Evening check-in saved`, { instance, log });
}

export async function cmdLogList(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycle = args.cycle ? await Core.getCycleById(args.cycle) : await Core.getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const date = args.date ?? (await Core.todayDateString());
  const log = await Core.getDailyLog(cycle.id, date);
  if (ctx.json) return emit(ctx, "", { instance, cycle: cycle.id, date, log });
  if (!log) return console.log(`No log for ${date}.`);
  const lines = [
    `Log ${date} — ${cycleLabel(cycle)}`,
    `  one thing:   ${log.oneThing ?? "—"}`,
    `  stress:      ${log.stressLevel ?? "—"}`,
    `  agency:      ${log.agencyScore ?? "—"}`,
    `  deep work:   ${log.deepWorkMinutes} min`,
    `  comfort:     ${log.comfortZoneDone ? "done" : "not done"}`,
    `  avoidance:   ${log.avoidanceTrigger ?? "—"}`,
    `  notes:       ${log.notes ?? "—"}`
  ];
  console.log(lines.join("\n"));
}

// ---------------------------------------------------------------------- dashboard

export async function cmdDashboard(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  const cycle = args.cycle ? await Core.getCycleById(args.cycle) : await Core.getActiveCycle();
  if (!cycle) throw new Error("No active cycle. Pass --cycle <id>.");
  const week = args.week ? Number(args.week) : undefined;
  const asOfDate = flag(args, "as-of", "asOf", "asOfDate");
  const dash = await Core.getDashboardData(cycle.id, week, asOfDate);
  if (!dash) throw new Error("No cycle data found.");
  if (ctx.json) return emit(ctx, "", { instance, dashboard: dash });
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  console.log(`DASHBOARD — ${cycleLabel(cycle)}`);
  console.log(`week ${dash.currentWeek}/12 · ${dash.daysLeft} days left · score ${pct(dash.score.weeklyScore)} (${dash.score.status})`);
  for (const g of dash.goals) {
    const lags = (g as { lagIndicators?: Core.LagIndicator[] }).lagIndicators ?? [];
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
  const lag = await Core.updateLag(args.lag, Number(args.value));
  emit(ctx, `Updated lag "${lag.title}" → ${lag.currentValue} ${lag.unit ?? ""}`, { instance, lag });
}

export async function cmdLagDone(args: Args, ctx: Ctx): Promise<void> {
  const instance = connect(args.instance);
  if (!args.lag) throw new Error("vibevision lag done needs --lag <id>");
  const lag = await Core.markLagDone(args.lag);
  emit(ctx, `Marked lag "${lag.title}" achieved`, { instance, lag });
}
