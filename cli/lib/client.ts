/**
 * Connects the shared PocketBase client (the same singleton the web app's
 * core functions use) to a configured instance with a stored API key.
 *
 * PocketBase's documented "API keys" mechanism is a long-lived superuser
 * auth token (see pocketbase.io/docs/authentication#api-keys). Superusers
 * bypass collection API rules, which is exactly what the CLI needs to
 * operate the single-user workspace end to end.
 */
import type { RecordModel } from "pocketbase";
import { pb } from "@/app/lib/pb";
import { getApiKey, resolveInstance } from "./config";

export class UsageError extends Error {}

export function assertInstance(flag?: string): string {
  const url = resolveInstance(flag);
  if (!url) {
    throw new UsageError(
      "No instance configured. Set one with:\n" +
        "  vibevision config set instance <url>   (persistent)\n" +
        "  VV_INSTANCE=<url> vibevision <cmd>      (per invocation)\n" +
        "  vibevision <cmd> --instance <url>       (per invocation)"
    );
  }
  return url;
}

export function connect(flag?: string): string {
  const url = assertInstance(flag);
  pb.baseURL = url;
  const key = getApiKey(url);
  if (!key) {
    throw new UsageError(
      `No API key stored for ${url}. Authenticate first:\n` +
        `  vibevision auth login --instance ${url} --email <superuser> --password <pw>`
    );
  }
  pb.authStore.save(key, { id: "vv-cli", email: "vv-cli@vibelabs.local" } as unknown as RecordModel);
  return url;
}

/** Instance health without any auth (public endpoint). */
export async function health(url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/api/health`, { signal: AbortSignal.timeout(10_000) });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}
