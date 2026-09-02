#!/usr/bin/env node
/**
 * One-time import: migrate the old twy SQLite database (drizzle) into PocketBase.
 *
 * Usage:
 *   node scripts/import-twy.mjs /path/to/twy.sqlite
 * Env:
 *   PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 *
 * Idempotent per natural key: cycles are matched by slug; goals/tactics/entries
 * are matched in insertion order per cycle. Re-running a fully imported DB is a
 * no-op (existing cycle detection short-circuits).
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD ?? "";

const sqlitePath = process.argv[2] ?? "/Users/maxmannstein/Coding/twy/data/twy.sqlite";
if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`);
  process.exit(1);
}

async function api(path, options = {}, token = null) {
  const response = await fetch(`${PB_URL}/api/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) }
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`${options.method ?? "GET"} ${path} -> ${response.status}`);
    error.status = response.status;
    error.response = body;
    throw error;
  }
  return body;
}

function sql(dbPath, query) {
  const out = execFileSync("sqlite3", ["-json", dbPath, query], { maxBuffer: 64 * 1024 * 1024 });
  return out.toString().trim() ? JSON.parse(out.toString()) : [];
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optNum(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

async function create(token, collection, body) {
  return api(`collections/${collection}/records`, { method: "POST", body: JSON.stringify(body) }, token);
}

async function findExisting(token, collection, filter, perPage = 100) {
  return api(
    `collections/${collection}/records?filter=${encodeURIComponent(filter)}&perPage=${perPage}`,
    {},
    token
  );
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are required");
    process.exit(1);
  }
  const auth = await api("collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const token = auth.token;

  const cycles = sql(sqlitePath, "SELECT * FROM cycles ORDER BY start_date");
  const weeks = sql(sqlitePath, "SELECT * FROM cycle_weeks");
  const goals = sql(sqlitePath, "SELECT * FROM goals");
  const lags = sql(sqlitePath, "SELECT * FROM lag_indicators");
  const tactics = sql(sqlitePath, "SELECT * FROM tactics");
  const schedules = sql(sqlitePath, "SELECT * FROM tactic_schedules");
  const blocks = sql(sqlitePath, "SELECT * FROM tactic_calendar_blocks");
  const logs = sql(sqlitePath, "SELECT * FROM daily_logs");
  const entries = sql(sqlitePath, "SELECT * FROM tactic_entries");
  const reviews = sql(sqlitePath, "SELECT * FROM weekly_reviews");
  const monthlies = sql(sqlitePath, "SELECT * FROM monthly_reviews");
  const settings = sql(sqlitePath, "SELECT * FROM settings");

  console.log(
    `source: ${cycles.length} cycles, ${goals.length} goals, ${tactics.length} tactics, ${entries.length} entries, ${logs.length} daily logs`
  );

  const created = { cycles: 0, weeks: 0, goals: 0, lags: 0, tactics: 0, schedules: 0, blocks: 0, logs: 0, entries: 0, reviews: 0, monthlies: 0, settings: 0 };

  for (const cycle of cycles) {
    const existing = await findExisting(token, "cycles", `slug = "${cycle.slug}"`);
    let cycleId = existing.items[0]?.id;
    if (!cycleId) {
      const record = await create(token, "cycles", {
        slug: cycle.slug,
        title: cycle.title,
        vision: cycle.vision ?? "",
        startDate: cycle.start_date,
        endDate: cycle.end_date,
        status: cycle.status === "active" ? "active" : cycle.status
      }, token);
      cycleId = record.id;
      created.cycles += 1;
      console.log(`cycle ${cycle.slug} created`);
    }

    // weeks
    const existingWeeks = await findExisting(token, "cycle_weeks", `cycle = "${cycleId}"`, 100);
    if (existingWeeks.totalItems === 0) {
      const cycleWeeks = weeks.filter((week) => week.cycle_id === cycle.id);
      for (const week of cycleWeeks) {
        await create(token, "cycle_weeks", {
          cycle: cycleId,
          weekNumber: num(week.week_number),
          startDate: week.start_date,
          endDate: week.end_date,
          label: week.label
        });
        created.weeks += 1;
      }
    }

    // goals (match by title; sortOrder fallback 0)
    const goalIdMap = new Map();
    const existingGoals = await findExisting(token, "goals", `cycle = "${cycleId}"`, 50);
    const cycleGoals = goals.filter((goal) => goal.cycle_id === cycle.id);
    for (const goal of cycleGoals) {
      const match = existingGoals.items.find((item) => item.title === goal.title);
      if (match) {
        goalIdMap.set(goal.id, match.id);
        continue;
      }
      const record = await create(token, "goals", {
        cycle: cycleId,
        title: goal.title,
        description: goal.description ?? "",
        sortOrder: num(goal.sort_order),
        status: goal.status || "in_progress"
      });
      goalIdMap.set(goal.id, record.id);
      created.goals += 1;
    }

    // lags
    const existingLags = await findExisting(token, "lag_indicators", `goal.cycle = "${cycleId}"`, 200);
    const cycleLags = lags.filter((lag) => cycleGoals.some((goal) => goal.id === lag.goal_id));
    for (const lag of cycleLags) {
      const mappedGoalId = goalIdMap.get(lag.goal_id);
      if (!mappedGoalId) continue;
      const match = existingLags.items.find((item) => item.goal === mappedGoalId && item.title === lag.title);
      if (match) continue;
      await create(token, "lag_indicators", {
        goal: mappedGoalId,
        title: lag.title,
        type: lag.type || "number",
        targetValue: lag.target_value ?? "",
        currentValue: lag.current_value ?? "",
        unit: lag.unit ?? "",
        achieved: Boolean(lag.achieved),
        sortOrder: num(lag.sort_order)
      });
      created.lags += 1;
    }

    // tactics + schedules
    const tacticIdMap = new Map();
    const existingTactics = await findExisting(token, "tactics", `goal.cycle = "${cycleId}"`, 200);
    const cycleTactics = tactics.filter((tactic) => cycleGoals.some((goal) => goal.id === tactic.goal_id));
    for (const tactic of cycleTactics) {
      const mappedGoalId = goalIdMap.get(tactic.goal_id);
      if (!mappedGoalId) continue;
      const match = existingTactics.items.find(
        (item) => item.goal === mappedGoalId && item.title === tactic.title && num(item.sortOrder) === num(tactic.sort_order)
      );
      if (match) {
        tacticIdMap.set(tactic.id, match.id);
        continue;
      }
      const record = await create(token, "tactics", {
        goal: mappedGoalId,
        title: tactic.title,
        type: tactic.type || "tracked",
        trackingType: tactic.tracking_type || "boolean",
        recurrenceType: tactic.recurrence_type || "times_per_week",
        recurrenceCount: num(tactic.recurrence_count, 1),
        targetValue: num(tactic.target_value, 1),
        unit: tactic.unit || "done",
        targetPerWeek: tactic.target_per_week ?? "",
        targetPerDay: tactic.target_per_day ?? "",
        scoringWeight: num(tactic.scoring_weight, 1),
        startsWeek: tactic.starts_week ?? "",
        endsWeek: tactic.ends_week ?? "",
        active: Boolean(tactic.active),
        sortOrder: num(tactic.sort_order)
      });
      tacticIdMap.set(tactic.id, record.id);
      created.tactics += 1;
    }

    for (const schedule of schedules.filter((row) => cycleTactics.some((tactic) => tactic.id === row.tactic_id))) {
      const mappedTacticId = tacticIdMap.get(schedule.tactic_id);
      if (!mappedTacticId) continue;
      const existing = await findExisting(
        token,
        "tactic_schedules",
        `tactic = "${mappedTacticId}" && weekNumber = ${num(schedule.week_number)}`
      );
      if (existing.totalItems > 0) continue;
      await create(token, "tactic_schedules", {
        tactic: mappedTacticId,
        weekNumber: num(schedule.week_number),
        plannedTarget: schedule.planned_target ?? "",
        required: Boolean(schedule.required)
      });
      created.schedules += 1;
    }

    // calendar blocks
    for (const block of blocks.filter((row) => row.cycle_id === cycle.id)) {
      const mappedTacticId = tacticIdMap.get(block.tactic_id);
      if (!mappedTacticId) continue;
      const existing = await findExisting(
        token,
        "tactic_calendar_blocks",
        `cycle = "${cycleId}" && tactic = "${mappedTacticId}" && date = "${block.date}"`
      );
      if (existing.totalItems > 0) continue;
      await create(token, "tactic_calendar_blocks", {
        tactic: mappedTacticId,
        cycle: cycleId,
        weekNumber: num(block.week_number),
        date: block.date,
        startTime: block.start_time ?? "",
        endTime: block.end_time ?? "",
        durationMinutes: block.duration_minutes ?? "",
        plannedValue: num(block.planned_value),
        note: block.note ?? ""
      });
      created.blocks += 1;
    }

    // daily logs
    for (const log of logs.filter((row) => row.cycle_id === cycle.id)) {
      const existing = await findExisting(token, "daily_logs", `cycle = "${cycleId}" && date = "${log.date}"`);
      if (existing.totalItems > 0) continue;
      await create(token, "daily_logs", {
        cycle: cycleId,
        date: log.date,
        oneThing: log.one_thing ?? "",
        morningDone: Boolean(log.morning_done),
        eveningDone: Boolean(log.evening_done),
        stressLevel: log.stress_level ?? "",
        agencyScore: log.agency_score ?? "",
        comfortZoneDone: Boolean(log.comfort_zone_done),
        deepWorkMinutes: num(log.deep_work_minutes),
        avoidanceTrigger: log.avoidance_trigger ?? "",
        privateVictories: log.private_victories ?? "",
        notes: log.notes ?? ""
      });
      created.logs += 1;
    }

    // tactic entries
    for (const entry of entries.filter((row) => row.cycle_id === cycle.id)) {
      const mappedTacticId = tacticIdMap.get(entry.tactic_id);
      if (!mappedTacticId) continue;
      const existing = await findExisting(
        token,
        "tactic_entries",
        `cycle = "${cycleId}" && tactic = "${mappedTacticId}" && weekNumber = ${num(entry.week_number)}${entry.date ? ` && date = "${entry.date}"` : ""}`
      );
      if (existing.totalItems > 0) continue;
      await create(token, "tactic_entries", {
        tactic: mappedTacticId,
        cycle: cycleId,
        weekNumber: num(entry.week_number),
        date: entry.date ?? "",
        value: num(entry.value),
        completed: Boolean(entry.completed),
        note: entry.note ?? ""
      });
      created.entries += 1;
    }

    // reviews
    for (const review of reviews.filter((row) => row.cycle_id === cycle.id)) {
      const existing = await findExisting(token, "weekly_reviews", `cycle = "${cycleId}" && weekNumber = ${num(review.week_number)}`);
      if (existing.totalItems > 0) continue;
      await create(token, "weekly_reviews", {
        cycle: cycleId,
        weekNumber: num(review.week_number),
        executionScore: review.execution_score ?? "",
        weeklyGoals: review.weekly_goals ?? "",
        wins: review.wins ?? "",
        misses: review.misses ?? "",
        avoidancePatterns: review.avoidance_patterns ?? "",
        lessons: review.lessons ?? "",
        nextWeekAdjustments: review.next_week_adjustments ?? "",
        completedAt: review.completed_at ?? ""
      });
      created.reviews += 1;
    }

    for (const monthly of monthlies.filter((row) => row.cycle_id === cycle.id)) {
      const existing = await findExisting(token, "monthly_reviews", `cycle = "${cycleId}" && monthNumber = ${num(monthly.month_number)}`);
      if (existing.totalItems > 0) continue;
      await create(token, "monthly_reviews", {
        cycle: cycleId,
        monthNumber: num(monthly.month_number),
        title: monthly.title ?? "Monthly",
        reflection: monthly.reflection ?? "",
        adjustments: monthly.adjustments ?? ""
      });
      created.monthlies += 1;
    }

    // settings: active cycle (remap to the new cycle id)
    for (const setting of settings) {
      const existing = await findExisting(token, "settings", `key = "${setting.key}"`);
      if (existing.totalItems > 0) {
        if (setting.key === "active_cycle_id") {
          await api(`collections/settings/records/${existing.items[0].id}`, {
            method: "PATCH",
            body: JSON.stringify({ value: cycleId })
          }, token);
        }
        continue;
      }
      const value = setting.key === "active_cycle_id" && setting.value === String(cycle.id) ? cycleId : String(setting.value);
      await create(token, "settings", { key: setting.key, value });
      created.settings += 1;
    }
  }

  console.log("import done:", JSON.stringify(created));
  const finalCycles = await api("collections/cycles/records?perPage=50", {}, token);
  for (const cycle of finalCycles.items) {
    console.log(`  cycle ${cycle.slug}: ${cycle.startDate} → ${cycle.endDate} [${cycle.status}]`);
  }
}

main().catch((error) => {
  console.error("import failed:", error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
});