import { pb } from "@/app/lib/pb";

export const SETTINGS_KEY_ACTIVE_CYCLE = "active_cycle_id";

export async function getSetting(key: string): Promise<string | null> {
  const item = await pb
    .collection("settings")
    .getFirstListItem(pb.filter("key = {:k}", { k: key }))
    .catch(() => null);
  return item ? String(item.value) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const existing = await pb
    .collection("settings")
    .getFirstListItem(pb.filter("key = {:k}", { k: key }))
    .catch(() => null);
  if (existing) {
    await pb.collection("settings").update(existing.id, { value });
  } else {
    await pb.collection("settings").create({ key, value });
  }
}