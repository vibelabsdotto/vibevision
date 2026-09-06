/**
 * Connects the CLI to a configured instance with a stored API token.
 *
 * Tokens (`vv_…`) are minted in the web app (/settings/tokens) or via
 * `vibevision tokens create` and verified against the instance before use.
 */
import { apiFetch, initApi } from "./api";
import { getApiKey, resolveInstance } from "./config";

export class UsageError extends Error {}

/** URL passed to the most recent connect() — used for honest connection errors. */
let lastInstanceUrl = "";
export function lastConnectedInstance(): string {
  return lastInstanceUrl;
}

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
  lastInstanceUrl = url;
  const key = getApiKey(url);
  if (!key) {
    throw new UsageError(
      `No API token stored for ${url}. Authenticate first:\n` +
        `  vibevision auth login --instance ${url} --token <vv_…>`
    );
  }
  initApi(url, key);
  return url;
}

/** Instance health without any auth (public endpoint). */
export async function health(url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    initApi(url, null);
    const body = await apiFetch<unknown>("GET", "/health");
    return { ok: true, status: 200, body };
  } catch (err) {
    if (err instanceof Error && "status" in err) {
      const status = (err as { status?: number }).status ?? 0;
      return { ok: false, status, body: err.message };
    }
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}
