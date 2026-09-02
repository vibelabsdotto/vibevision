"use server";

import { revalidatePath } from "next/cache";

import { evening, morning } from "@/app/core/dailyLogs";
import { addTacticEntry } from "@/app/core/tactics";
import { requireAuth } from "@/app/lib/auth";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export async function morningAction(formData: FormData) {
  await requireAuth();
  await morning({
    oneThing: value(formData, "oneThing"),
    stress: value(formData, "stress") ? Number(value(formData, "stress")) : undefined
  });
  revalidatePath("/");
  revalidatePath("/today");
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
}

export async function addEntryAction(formData: FormData) {
  await requireAuth();
  const tacticId = String(value(formData, "tacticId") ?? "");
  const valueRaw = value(formData, "value");
  const mode = value(formData, "mode");
  await addTacticEntry({
    tacticId,
    value: valueRaw ? Number(valueRaw) : undefined,
    completed: mode === "complete" ? true : undefined,
    note: value(formData, "note")
  });
  revalidatePath("/");
  revalidatePath("/today");
}