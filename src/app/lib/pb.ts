import PocketBase, { type RecordModel } from "pocketbase";

export const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";

/**
 * VibeVision is a single-user 12WY execution app. One shared PocketBase client
 * carries the session auth; getAuth() re-establishes it per request from the
 * auth cookie. Concurrent different-user sessions are not a use case here.
 */
export const pb = new PocketBase(PB_URL);

/**
 * Request mutex — the PB SDK auto-cancels concurrent requests with identical
 * URLs on one client. With a module-singleton client, two overlapping SSR
 * renders (e.g. Next.js link-prefetch racing the real navigation) aborted
 * each other's identical fetches and crashed the page. Serialize everything.
 */
let pbChain: Promise<unknown> = Promise.resolve();
export function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = pbChain.then(fn, fn);
  pbChain = run.catch(() => {});
  return run;
}

const send = pb.send.bind(pb);
pb.send = function (path: string, options: Parameters<typeof pb.send>[1]) {
  return serialize(() => send(path, options));
};

export function setPbAuth(token: string, user: { id: string; email: string }) {
  pb.authStore.save(token, user as unknown as RecordModel);
}

export function clearPbAuth() {
  pb.authStore.clear();
}

/** Alias kept for older call sites. */
export const pbForRequest = () => pb;