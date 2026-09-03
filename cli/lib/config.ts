/**
 * VibeVision CLI configuration.
 *
 * Instance resolution precedence (first set wins):
 *   1. --instance <url>            (flag, per invocation)
 *   2. VV_INSTANCE=<url>           (environment)
 *   3. config file: .vv/vv.json (repo, gitignored) or ~/.config/vibevision/config.json
 *
 * Per-instance API keys (PocketBase superuser tokens — PocketBase's
 * documented "API keys" mechanism) live in:
 *   .vv/instances.json (repo, gitignored) or ~/.config/vibevision/instances.json
 * Never in env, never printed, never committed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface VvConfig {
  instance?: string;
}

export interface InstanceEntry {
  apiKey: string;
  email?: string;
  label?: string;
  savedAt?: string;
}

function here(): string {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // CJS fallback (shouldn't happen in this repo)
    return __dirname;
  }
}

export function repoRoot(): string {
  return path.resolve(here(), "..", "..");
}

function homeDir(): string {
  return path.join(os.homedir(), ".config", "vibevision");
}

/** Prefer the repo-local dir (works from any cwd, sits next to the checkout), fall back to ~/.config. */
function configFile(): string {
  if (fs.existsSync(repoRoot())) {
    return path.join(repoRoot(), ".vv", "vv.json");
  }
  return path.join(homeDir(), "config.json");
}

function instancesFile(): string {
  const dir = fs.existsSync(repoRoot()) ? path.join(repoRoot(), ".vv") : homeDir();
  return path.join(dir, "instances.json");
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonAtomic(file: string, data: unknown): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

export function loadConfig(): VvConfig {
  return readJson<VvConfig>(configFile()) ?? {};
}

export function saveConfig(config: VvConfig): void {
  writeJsonAtomic(configFile(), config);
}

export function listInstances(): Record<string, InstanceEntry> {
  return readJson<Record<string, InstanceEntry>>(instancesFile()) ?? {};
}

export function instanceKey(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/[^a-z0-9.-]/gi, "_");
  }
}

export function getApiKey(url: string): string | null {
  const key = instanceKey(url);
  for (const file of [path.join(repoRoot(), ".vv", "instances.json"), path.join(homeDir(), "instances.json")]) {
    const store = readJson<Record<string, InstanceEntry>>(file);
    if (store?.[key]?.apiKey) return store[key].apiKey;
  }
  return null;
}

export function saveApiKey(url: string, apiKey: string, meta?: { email?: string; label?: string }): void {
  const file = instancesFile();
  const store = readJson<Record<string, InstanceEntry>>(file) ?? {};
  const key = instanceKey(url);
  store[key] = {
    apiKey,
    email: meta?.email,
    label: meta?.label,
    savedAt: new Date().toISOString()
  };
  writeJsonAtomic(file, store);
}

export function deleteApiKey(url: string): boolean {
  const file = instancesFile();
  const store = readJson<Record<string, InstanceEntry>>(file);
  if (!store?.[instanceKey(url)]) return false;
  delete store[instanceKey(url)];
  writeJsonAtomic(file, store);
  return true;
}

export function resolveInstance(flag?: string): string | null {
  return (
    flag ??
    (process.env.VV_INSTANCE || undefined) ??
    loadConfig().instance ??
    null
  );
}

export function redact(token: string): string {
  if (token.length <= 10) return "****";
  return `${token.slice(0, 6)}…${token.slice(-4)} (${token.length} chars)`;
}
