"use server";

import { revalidatePath } from "next/cache";

import {
  addTacticCalendarBlock,
  amountsEqual,
  deleteTacticCalendarBlock,
  getActiveCycle,
  getCalendarBlock,
  getTactic,
  getTacticStepDelta,
  getTacticTodayState,
  listGoals,
  moveTacticCalendarBlock,
  resolveExecutionStyle,
  resolveTacticPlan,
  todayDateString,
  undoLatestTacticEntry
} from "@/app/core";
import { evening, morning } from "@/app/core/dailyLogs";
import { addTacticEntry, completeTactic } from "@/app/core/tactics";
import { requireAuth } from "@/app/lib/auth";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
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
  const plan = resolveTacticPlan(tactic, { strict: true });
  if (resolveExecutionStyle(plan, tactic, { strict: true }) !== "toggle") {
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
  const rawDelta = value(formData, "delta");
  if (!tacticId) throw new Error("Missing tacticId");
  if (!rawDelta) throw new Error("Missing delta");
  const requestedDelta = Number(rawDelta);
  if (!Number.isFinite(requestedDelta) || requestedDelta === 0) {
    throw new Error("Invalid delta for today's remaining target");
  }

  const today = todayDateString();
  const todayState = await getTacticTodayState(tacticId, today);
  if (!todayState || todayState.todayTarget === null || todayState.todayTarget <= 0) {
    throw new Error("Tactic is not scheduled for today");
  }

  const tactic = todayState.tactic;
  const plan = resolveTacticPlan(tactic, { strict: true });
  const style = todayState.executionStyle;
  if (style === "toggle") {
    throw new Error("Toggles only go through the Complete path");
  }

  const direction = requestedDelta > 0 ? "increase" : "decrease";
  const allowedDelta = getTacticStepDelta({
    direction,
    todayActual: todayState.todayActual,
    todayTarget: todayState.todayTarget
  });
  if (allowedDelta === 0) {
    throw new Error(direction === "increase" ? "Tactic is already complete for today" : "Nothing to subtract today");
  }
  if (!amountsEqual(requestedDelta, allowedDelta)) {
    throw new Error("Invalid delta for today's remaining target");
  }

  if (direction === "decrease" && style === "occurrence") {
    const undone = await undoLatestTacticEntry(tacticId, today);
    if (!undone) throw new Error("Nothing to subtract today");
  } else {
    await addTacticEntry({ tacticId, value: allowedDelta, date: today });
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
  revalidatePath("/");
  revalidatePath("/today");
  return result;
}

export async function addBlockAction(input: { tacticId: string; date: string; plannedValue: number }) {
  await requireAuth();
  if (!input.tacticId) throw new Error("Missing tacticId");
  if (!input.date) throw new Error("Missing date");
  const tactic = await assertTacticInActiveCycle(input.tacticId);
  const plan = resolveTacticPlan(tactic, { strict: true });
  const style = resolveExecutionStyle(plan, tactic, { strict: true });
  if (style === "toggle") throw new Error("Toggles can't be scheduled");
  const plannedValue = Number(input.plannedValue);
  if (!Number.isFinite(plannedValue) || plannedValue <= 0) {
    throw new Error("Block size must be greater than 0");
  }
  if (style === "occurrence" && !Number.isInteger(plannedValue)) {
    throw new Error("Occurrence block size must be a whole number");
  }
  await addTacticCalendarBlock({
    tacticId: input.tacticId,
    date: input.date,
    plannedValue
  });
  revalidatePath("/calendar");
  revalidatePath("/");
  revalidatePath("/today");
}

export async function deleteBlockAction(input: { blockId: string }) {
  await requireAuth();
  if (!input.blockId) throw new Error("Missing blockId");
  await assertBlockInActiveCycle(input.blockId);
  await deleteTacticCalendarBlock(input.blockId);
  revalidatePath("/calendar");
  revalidatePath("/");
  revalidatePath("/today");
}
