import { pb } from "@/app/lib/pb";

export const SETTINGS_KEY_ACTIVE_CYCLE = "active_cycle_id";

export async function getSetting(key: string): Promise<string | null> {
  const item = await pb
    .collection("settings")
    .getFirstListItem(pb.filter("key = {:k}", { k: key }))
    .catch((err: unknown) => {
      // Genuine "no such setting" is a 404 → null. A dead connection (status 0)
      // must never masquerade as missing data — callers branch on null.
      if ((err as { status?: number })?.status === 0) throw err;
      return null;
    });
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