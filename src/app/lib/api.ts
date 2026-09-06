import { apiUrl, serverApiUrl } from "./env";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(`${status}: ${code}`);
    this.status = status;
    this.code = code;
  }
}

type ApiFetchOptions = {
  method?: string;
  token?: string | null;
  cookie?: string | null; // Server-seitig: Session-Cookie durchreichen
  body?: unknown;
};

/** Low-Level-Client gegen die VibeVision-API. Wirft ApiError bei !ok. */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  return fetchJson<T>(apiUrl(), path, opts);
}

async function fetchJson<T>(base: string, path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", token, cookie, body } = opts;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "include"
  });

  if (!res.ok) {
    let code = res.statusText || "error";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) code = data.error;
    } catch {
      // kein JSON-Body — Statuscode reicht
    }
    throw new ApiError(res.status, code);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return text as unknown as T;
  return JSON.parse(text) as T;
}

/**
 * Server-seitiger API-Request mit durchgereichtem Session-Cookie.
 */
export async function serverApiFetch<T>(
  path: string,
  cookie: string | null | undefined,
  opts: Pick<ApiFetchOptions, "method" | "body"> = {}
): Promise<T> {
  return fetchJson<T>(serverApiUrl(), path, { ...opts, cookie: cookie ?? null });
}
