"use server";

import { revalidatePath } from "next/cache";

import { getActiveCycle, getCalendarBlock, getOccurrenceTarget, getTactic, listGoals, resolveExecutionStyle, resolveTacticPlan, todayDateString, undoLatestTacticEntry, type TacticPlan } from "@/app/core";
import * as coreModule from "@/app/core";
import {
  addTacticCalendarBlock,
  deleteTacticCalendarBlock,
  moveTacticCalendarBlock
} from "@/app/core";
import { evening, morning } from "@/app/core/dailyLogs";
import { addTacticEntry, completeTactic } from "@/app/core/tactics";
import { requireAuth } from "@/app/lib/auth";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

type ExecutionStyle = "toggle" | "occurrence" | "volume";

// Uses core's resolveExecutionStyle once it lands; falls back to trackingType until then.
function styleOfPlan(plan: TacticPlan): ExecutionStyle {
  const resolve = (coreModule as unknown as { resolveExecutionStyle?: (plan: TacticPlan) => ExecutionStyle }).resolveExecutionStyle;
  if (typeof resolve === "function") return resolve(plan);
  return plan.trackingType === "boolean" ? "toggle" : "volume";
}

async function assertTacticInActiveCycle(tacticId: string) {
  const tactic = await getTactic(tacticId);
  if (!tactic) throw new Error(`Tactic not found: ${tacticId}`);
  const active = await getActiveCycle();
  if (!active) throw new Error("No active cycle");
  const goals = await listGoals(active.id);
  if (!goals.some((goal) => goal.id === tactic.goalId)) {
    throw new Error("Tactic is not in the active cycle");
  }
  return tactic;
}

export async function morningAction(formData: FormData) {
  await requireAuth();
  await morning({
    oneThing: value(formData, "oneThing"),
    stress: value(formData, "stress") ? Number(value(formData, "stress")) : undefined
  });
  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/daily-logs");
}

export async function eveningAction(formData: FormData) {
  await requireAuth();
  await evening({
    agency: value(formData, "agency") ? Number(value(formData, "agency")) : undefined,
    stress: value(formData, "stress") ? Number(value(formData, "stress")) : undefined,
    wins: value(formData, "wins"),
    avoidance: value(formData, "avoidance"),
    notes: value(formData, "notes"),
    deepWorkMinutes: value(formData, "deepWorkMinutes") ? Number(value(formData, "deepWorkMinutes")) : undefined,
    comfortZoneDone: value(formData, "comfortZoneDone") === "on"
  });
  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/daily-logs");
}

export async function completeTacticAction(formData: FormData) {
  await requireAuth();
  const tacticId = String(value(formData, "tacticId") ?? "");
  if (!tacticId) throw new Error("Missing tacticId");
  const tactic = await assertTacticInActiveCycle(tacticId);
  if (styleOfPlan(resolveTacticPlan(tactic)) !== "toggle") {
    throw new Error("Only toggles go through the Complete path");
  }
  await completeTactic(tacticId);
  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/daily-logs");
}

export async function stepEntryAction(formData: FormData) {
  await requireAuth();
  const tacticId = String(value(formData, "tacticId") ?? "");
  const delta = value(formData, "delta");
  if (!tacticId) throw new Error("Missing tacticId");
  if (delta !== "1" && delta !== "-1") throw new Error("Invalid delta: must be 1 or -1");
  const tactic = await assertTacticInActiveCycle(tacticId);
  const style = styleOfPlan(resolveTacticPlan(tactic));
  if (style === "toggle") {
    throw new Error("Toggles only go through the Complete path");
  }
  if (delta === "-1" && style === "occurrence") {
    const undone = await undoLatestTacticEntry(tacticId, todayDateString());
    if (!undone) throw new Error("Nothing to subtract today");
  } else {
    await addTacticEntry({ tacticId, value: Number(delta), date: todayDateString() });
  }
  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/daily-logs");
}

async function assertBlockInActiveCycle(blockId: string) {
  const block = await getCalendarBlock(blockId);
  if (!block) throw new Error(`Block not found: ${blockId}`);
  const active = await getActiveCycle();
  if (!active) throw new Error("No active cycle");
  if (block.cycleId !== active.id) throw new Error("Block is not in the active cycle");
  return block;
}

export async function moveBlockAction(input: { blockId: string; toDate: string }) {
  await requireAuth();
  if (!input.blockId) throw new Error("Missing blockId");
  if (!input.toDate) throw new Error("Missing toDate");
  await assertBlockInActiveCycle(input.blockId);
  const result = await moveTacticCalendarBlock({ blockId: input.blockId, toDate: input.toDate });
  revalidatePath("/calendar");
  return result;
}

export async function addBlockAction(input: { tacticId: string; date: string }) {
  await requireAuth();
  if (!input.tacticId) throw new Error("Missing tacticId");
  if (!input.date) throw new Error("Missing date");
  const tactic = await assertTacticInActiveCycle(input.tacticId);
  const plan = resolveTacticPlan(tactic);
  if (styleOfPlan(plan) === "toggle") throw new Error("Toggles can't be scheduled");
  await addTacticCalendarBlock({
    tacticId: input.tacticId,
    date: input.date,
    plannedValue: plan.trackingType === "boolean" ? undefined : getOccurrenceTarget(plan)
  });
  revalidatePath("/calendar");
}

export async function deleteBlockAction(input: { blockId: string }) {
  await requireAuth();
  if (!input.blockId) throw new Error("Missing blockId");
  await assertBlockInActiveCycle(input.blockId);
  await deleteTacticCalendarBlock(input.blockId);
  revalidatePath("/calendar");
}
