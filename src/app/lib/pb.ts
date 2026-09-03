import http from "node:http";
import https from "node:https";

import PocketBase, { type RecordModel } from "pocketbase";

export const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";

/**
 * Raw fetch bypassing Next.js's global fetch patch (cache instrumentation).
 *
 * Next.js's patched fetch adds measurable per-request overhead (~50-100ms of
 * pipeline work per call), which turned every SSR page issuing ~15 PocketBase
 * requests into 1-2s of pure overhead. Measured inside the production
 * container: 15 raw keep-alive requests run in <50ms where the same 15 via
 * the patched fetch took >1.4s.
 *
 * Custom `fetch` in SendOptions is the PocketBase-recommended way to swap the
 * transport (js-sdk docs; pocketbase/pocketbase discussion #5313, "API cache
 * issues and custom fetch functions").
 */
/**
 * Connection-per-request (no keep-alive): PB runs in the same Docker network
 * (<1ms hop), so a fresh TCP connect costs nothing — while stale keep-alive
 * sockets (PB closes idle connections) caused intermittent 100-600ms stalls
 * with silent retries under load. No pooling, no stale-socket class.
 */
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

type RawResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
};

function rawFetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const agent = isHttps ? httpsAgent : httpAgent;
    const request = (isHttps ? https : http).request(
      {
        host: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method ?? "GET",
        headers: options.headers ?? {},
        agent
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const text = body.toString("utf8");
          resolve({
            ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode ?? 0,
            headers: {
              get(name: string) {
                const value = res.headers[name.toLowerCase()];
                return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
              }
            },
            text: async () => text,
            json: async () => JSON.parse(text)
          });
        });
      }
    );
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

/**
 * VibeVision is a single-user 12WY execution app. One shared PocketBase client
 * carries the session auth; getAuth() re-establishes it per request from the
 * auth cookie. Concurrent different-user sessions are not a use case here.
 */
export const pb = new PocketBase(PB_URL);

/**
 * Disable SDK auto-cancellation: with a shared server-side client, two
 * overlapping SSR renders (e.g. link-prefetch racing the real navigation)
 * aborted each other's identical fetches and crashed the page with
 * `AbortError`. Per PocketBase's own guidance for global server instances
 * (discussion #4843): disable autocancellation when a server process issues
 * concurrent requests.
 */
pb.autoCancellation(false);

const send = pb.send.bind(pb);
pb.send = function (path: string, options: Parameters<typeof pb.send>[1]) {
  const __t0 = performance.now();
  const result = send(path, { ...options, fetch: rawFetch as unknown as typeof globalThis.fetch });
  // temporary transport instrumentation
  Promise.resolve(result).finally(() => {
    // eslint-disable-next-line no-console
    console.log(`[perf-pb] ${(performance.now() - __t0).toFixed(0)}ms ${path.slice(0, 60)}`);
  });
  return result;
};

export function setPbAuth(token: string, user: { id: string; email: string }) {
  pb.authStore.save(token, user as unknown as RecordModel);
}

export function clearPbAuth() {
  pb.authStore.clear();
}

/** Alias kept for older call sites. */
export const pbForRequest = () => pb;