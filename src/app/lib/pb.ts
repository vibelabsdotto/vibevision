import PocketBase, { type RecordModel } from "pocketbase";

export const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";

/**
 * VibeVision is a single-user 12WY execution app. One shared PocketBase client
 * carries the session auth; getAuth() re-establishes it per request from the
 * auth cookie. Concurrent different-user sessions are not a use case here.
 */
export const pb = new PocketBase(PB_URL);

export function setPbAuth(token: string, user: { id: string; email: string }) {
  pb.authStore.save(token, user as unknown as RecordModel);
}

export function clearPbAuth() {
  pb.authStore.clear();
}

/** Alias kept for older call sites. */
export const pbForRequest = () => pb;