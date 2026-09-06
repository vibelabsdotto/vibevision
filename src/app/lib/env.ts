export function apiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101").replace(/\/+$/, "");
}

/**
 * API-Basis für Server-seitige Requests (SSR, Route Handler, Server Actions).
 * In Compose per API_URL_INTERNAL auf http://api:3101 zeigen lassen —
 * NEXT_PUBLIC_API_URL ist browser-seitig und dort ggf. nicht auflösbar.
 */
export function serverApiUrl(): string {
  return (process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101").replace(
    /\/+$/,
    ""
  );
}

/**
 * Absolute Web-Origin für CallbackURLs.
 * Lazy verwenden — nie window im Render aufrufen.
 */
export function webUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WEB_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}
