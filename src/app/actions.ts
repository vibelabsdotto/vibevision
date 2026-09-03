"use server";

import { revalidatePath } from "next/cache";

import { getActiveCycle, getTactic, listGoals, resolveTacticPlan, todayDateString } from "@/app/core";
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
  await assertTacticInActiveCycle(tacticId);
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
  if (resolveTacticPlan(tactic).trackingType === "boolean") {
    throw new Error("Boolean tactics only go through the Complete path");
  }
  await addTacticEntry({ tacticId, value: Number(delta), date: todayDateString() });
  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/daily-logs");
}
