#!/usr/bin/env node
/**
 * Functional smoke: create a cycle + goal + tactic + entry through the core
 * functions against the local PB as an authenticated app user, verify scoring,
 * then clean up. Run: PB_URL=... VV_USER_EMAIL=... VV_USER_PASSWORD=... npx tsx scripts/core-smoke.mjs
 */
import { pb, setPbAuth } from "../src/app/lib/pb.ts";
import {
  createCycle, addGoal, addTactic, addTacticEntry, getWeekScore,
  getWeekReport, listCycles
} from "../src/app/core/index.ts";

async function main() {
  const email = process.env.VV_USER_EMAIL;
  const password = process.env.VV_USER_PASSWORD;
  if (!email || !password) throw new Error("VV_USER_EMAIL / VV_USER_PASSWORD required");

  const auth = await pb.collection("users").authWithPassword(email, password);
  setPbAuth(auth.token, auth.record);
  console.log("authed as", email);

  const cyclesBefore = (await listCycles()).length;
  console.log("cycles before:", cyclesBefore);

  const cycle = await createCycle({ title: "Smoke Cycle", startDate: "2026-08-31", status: "active" });
  console.log("cycle created:", cycle.slug, cycle.startDate, "→", cycle.endDate);

  const goal = await addGoal(cycle.id, "Smoke goal", "g");
  const tactic = await addTactic({
    goalId: goal.id, title: "Sales activities", trackingType: "quantity",
    recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 10, unit: "activities"
  });
  await addTacticEntry({ tacticId: tactic.id, date: "2026-09-01", value: 4 });

  const score = await getWeekScore(cycle.id, 1);
  console.log(
    "week 1 score:", score.weeklyScore, score.status,
    "| planned", score.tacticScores[0]?.planned,
    "actual", score.tacticScores[0]?.actual
  );
  // scoring cutoff is "yesterday" during the live week → 2 elapsed days → planned = 10 * 2/7
  if (score.tacticScores[0]?.score !== 1) {
    throw new Error(`expected score 1 (actual 4 >= planned ~2.86), got ${score.tacticScores[0]?.score}`);
  }
  if (score.weeklyScore !== 1) throw new Error(`expected weekly score 1, got ${score.weeklyScore}`);

  const report = await getWeekReport(cycle.id, 1);
  // report uses includeAsOfDate: full week planned (10) vs actual (4) → 0.4
  const reportScore = report.score.tacticScores[0]?.score;
  console.log("report tactic score (full week):", reportScore);
  if (reportScore !== 0.4) throw new Error(`expected 0.4 full-week score, got ${reportScore}`);

  // cleanup probe data (admin delete via superuser would be needed; cycle createRule is null)
  console.log("NOTE: probe cycle left in DB — delete manually in the PB dashboard (slug smoke-cycle)");
}

main().catch((e) => { console.error("smoke failed:", e.message, e.response ?? ""); process.exit(1); });