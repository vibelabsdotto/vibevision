/**
 * Minimal Bearer client for the VibeVision API (contract docs/CONTRACT.md §4).
 * Node runtime (tsx) — no Next.js imports. Errors carry HTTP status.
 */
import { getApiKey } from "./config";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? `${status}: ${code}`);
    this.status = status;
    this.code = code;
  }
}

let baseUrl = "";
let apiToken: string | null = null;

/** Point the client at an instance (token may be null for public endpoints). */
export function initApi(url: string, token: string | null): void {
  baseUrl = url.replace(/\/+$/, "");
  apiToken = token;
}

export function apiBase(): string {
  return baseUrl;
}

export async function apiFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000)
    });
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err);
    throw new ApiError(0, "connection_failed", `Cannot reach ${baseUrl}: ${hint}`);
  }
  if (!res.ok) {
    let code = res.statusText || "error";
    let message: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      if (data.error) code = data.error;
      if (data.message) message = data.message;
    } catch {
      // kein JSON-Body — Statuscode reicht
    }
    throw new ApiError(res.status, code, message ?? `${res.status}: ${code}`);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return text as unknown as T;
  return JSON.parse(text) as T;
}

/** Stored-token GET helper used by commands (base URL + key from config). */
export async function authedFetch<T>(instance: string, method: string, path: string, body?: unknown): Promise<T> {
  initApi(instance, getApiKey(instance));
  return apiFetch<T>(method, path, body);
}
