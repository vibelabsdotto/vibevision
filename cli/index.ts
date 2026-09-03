#!/usr/bin/env tsx
/**
 * vibevision — the VibeVision CLI.
 *
 * Operates any VibeVision instance (PocketBase) with a stored API key,
 * reusing the same core functions as the web app. See README.md → "CLI".
 *
 * Global flags: --instance <url> (override instance), --json (machine output).
 */
import {
  deleteApiKey,
  getApiKey,
  instanceKey,
  listInstances,
  loadConfig,
  redact,
  resolveInstance,
  saveApiKey,
  saveConfig
} from "./lib/config";
import { UsageError, connect, health } from "./lib/client";
import * as C from "./lib/commands";

const HELP = `vibevision — VibeVision CLI (12 Week Year execution OS)

Usage: vibevision <command> [flags]

Instance (first set wins): --instance <url> | VV_INSTANCE=<url> | vibevision config set instance <url>
Output: --json prints the raw data object (default: human-readable tables)

INSTANCE & AUTH
  vibevision config set instance <url>        remember the instance for future runs
  vibevision config get                       show current instance + stored keys
  vibevision auth login --instance <url> --email <superuser> --password <pw>
                                      mint & store the API key for that instance
  vibevision auth whoami --instance <url>     verify the stored API key against the instance
  vibevision auth logout --instance <url>     remove the stored API key
  vibevision health                           check instance reachability (no auth needed)

CYCLES
  vibevision cycles                           list cycles (* = active)
  vibevision cycle create --title "…" --start 2026-09-07 [--vision "…"] [--activate]
  vibevision cycle activate --id <cycleId> | --slug <slug>
  vibevision cycle update --id <cycleId> [--title "…"] [--vision "…"] [--start 2026-09-07]

GOALS & LAGS
  vibevision goals                            list goals + lag indicators of the active cycle
  vibevision goal add --title "…" [--description "…"] [--cycle <id>]
  vibevision lag update --lag <id> --value <n>
  vibevision lag done --lag <id>

TACTICS
  vibevision tactics                          list all tactics (plan, goal, weeks)
  vibevision tactic add --goal <id> --title "…" [--tracking quantity|boolean|duration]
               [--recurrence daily|weekdays|times_per_week|once]
               [--target 5] [--count 3] [--unit pieces] [--week 1] [--starts-week 1] [--ends-week 4]

DAILY OPERATION
  vibevision today                            today's due tactics + summary
  vibevision log entry --tactic <id> [--value 2] [--note "…"] [--date 2026-09-02|today]
  vibevision log complete --tactic <id>
  vibevision log morning [--one-thing "…"] [--stress 3] [--date …]
  vibevision log evening [--agency 4] [--stress 3] [--wins "…"] [--avoidance "…"]
                [--notes "…"] [--deep-work 90] [--comfort true] [--date …]
  vibevision log list [--date 2026-09-02]    show the daily log entry

ANALYSIS
  vibevision score [--cycle <id>] [--week N] [--as-of <date>]   live week score (through yesterday)
  vibevision report [--cycle <id>] [--week N]                   full weekly report (markdown)
  vibevision dashboard [--cycle <id>] [--week N] [--as-of <date>]

Examples:
  vibevision config set instance https://vision-pb.vibelabs.to
  vibevision auth login --email vision-admin@vibelabs.local --password <pw>
  vibevision today --json
  vibevision log entry --tactic 1l61agqw… --value 2 --note "two pieces posted"`;

function fail(message: string): never {
  process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}

interface Parsed {
  flags: Record<string, string | boolean>;
  positional: string[];
}

function parseFlags(argv: string[]): Parsed {
  const flags: Parsed["flags"] = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[body] = next;
          i++;
        } else {
          flags[body] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function str(flags: Parsed["flags"], name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

async function main(): Promise<void> {
  const [command, sub, ...rest] = process.argv.slice(2);
  // a flag right after the command (e.g. `vibevision cycles --json`) is not a subcommand
  const effectiveSub = sub && sub.startsWith("--") ? undefined : sub;
  const effectiveRest = sub && sub.startsWith("--") ? [sub, ...rest] : rest;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP + "\n");
    return;
  }
  const { flags, positional } = parseFlags(effectiveRest);
  const json = flags.json === true;
  const instanceFlag = str(flags, "instance");

  // ---- no-connect commands
  if (command === "config") {
    if (sub === "set" && positional[0] === "instance") {
      const url = positional[1];
      if (!url) fail("vibevision config set instance <url>");
      saveConfig({ ...loadConfig(), instance: url });
      console.log(`Instance set to ${url}${instanceKey(url) ? "" : ""}`);
      return;
    }
    if (sub === "get" || !sub) {
      const cfg = loadConfig();
      const instance = resolveInstance(instanceFlag) ?? "(not set)";
      console.log(`instance: ${instance}`);
      const store = listInstances();
      const keys = Object.entries(store);
      if (keys.length === 0) console.log("stored API keys: (none)");
      for (const [host, entry] of keys) {
        console.log(`stored API key: ${host} ${entry.email ? `(${entry.email}) ` : ""}${redact(entry.apiKey)}`);
      }
      return;
    }
    fail(`Unknown config command "vibevision config ${sub}". Try: vibevision config set instance <url> | vibevision config get`);
  }

  if (command === "auth") {
    const url = (instanceFlag ?? resolveInstance()) ?? fail("vibevision auth needs --instance <url> (or a configured instance)");
    if (sub === "login") {
      const email = str(flags, "email");
      const password = str(flags, "password");
      if (!email || !password) fail("vibevision auth login needs --email <superuser> and --password <pw>");
      const base = url.replace(/\/+$/, "");
      const res = await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: email, password }),
        signal: AbortSignal.timeout(15_000)
      }).catch((err: unknown) => {
        throw new Error(`Cannot reach ${base}: ${err instanceof Error ? err.message : String(err)}`);
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        fail(`Login failed (${res.status}). The account must be a PocketBase superuser (Dashboard user), not a regular app user. ${detail}`);
      }
      const data = (await res.json()) as { token?: string };
      if (!data.token) fail("Instance did not return a token.");
      // verify the token actually authenticates before persisting it
      const check = await health(url);
      if (!check.ok) fail(`Instance unhealthy after login — not storing the key.`);
      const verify = await fetch(`${base}/api/collections`, {
        headers: { Authorization: data.token },
        signal: AbortSignal.timeout(15_000)
      });
      if (!verify.ok) fail(`Token rejected by the instance (${verify.status}) — not storing it.`);
      saveApiKey(url, data.token, { email });
      console.log(`✓ API key stored for ${instanceKey(url)} (superuser ${email}). Use: vibevision cycles`);
      return;
    }
    if (sub === "whoami") {
      const key = getApiKey(url);
      if (!key) fail(`No API key stored for ${instanceKey(url)}. Run: vibevision auth login --instance ${url}`);
      const base = url.replace(/\/+$/, "");
      const verify = await fetch(`${base}/api/collections`, {
        headers: { Authorization: key },
        signal: AbortSignal.timeout(15_000)
      }).catch((err: unknown) => {
        throw new Error(`Cannot reach ${base}: ${err instanceof Error ? err.message : String(err)}`);
      });
      if (!verify.ok) fail(`API key rejected (${verify.status}). Re-run: vibevision auth login --instance ${url}`);
      const cols = (await verify.json()) as { items?: Array<{ name: string }> };
      const dataCols = (cols.items ?? []).filter((c) => !c.name.startsWith("_"));
      console.log(`✓ ${instanceKey(url)} — API key valid (superuser). ${dataCols.length} data collections: ${dataCols.map((c) => c.name).join(", ")}`);
      return;
    }
    if (sub === "logout") {
      if (deleteApiKey(url)) console.log(`✓ Removed API key for ${instanceKey(url)}`);
      else console.log(`No stored API key for ${instanceKey(url)}.`);
      return;
    }
    fail(`Unknown auth command "vibevision auth ${sub}". Try: login | whoami | logout`);
  }

  if (command === "health") {
    await C.cmdHealth(flags as C.Args, { instance: "", json });
    return;
  }

  // ---- data commands (all connect first)
  const ctx: C.Ctx = { instance: "", json };
  try {
    switch (command) {
      case "cycles":
        await C.cmdCycles(flags as C.Args, ctx);
        break;
      case "cycle":
        if (sub === "create") await C.cmdCycleCreate(flags as C.Args, ctx);
        else if (sub === "activate") await C.cmdCycleActivate(flags as C.Args, ctx);
        else if (sub === "update") await C.cmdCycleUpdate(flags as C.Args, ctx);
        else fail("vibevision cycle needs a subcommand: create | activate | update");
        break;
      case "goals":
        await C.cmdGoals(flags as C.Args, ctx);
        break;
      case "goal":
        if (sub === "add") await C.cmdGoalAdd(flags as C.Args, ctx);
        else fail("vibevision goal needs a subcommand: add");
        break;
      case "tactics":
        await C.cmdTactics(flags as C.Args, ctx);
        break;
      case "tactic":
        if (sub === "add") await C.cmdTacticAdd(flags as C.Args, ctx);
        else fail("vibevision tactic needs a subcommand: add");
        break;
      case "today":
        await C.cmdToday(flags as C.Args, ctx);
        break;
      case "score":
        await C.cmdScore(flags as C.Args, ctx);
        break;
      case "report":
        await C.cmdReport(flags as C.Args, ctx);
        break;
      case "dashboard":
        await C.cmdDashboard(flags as C.Args, ctx);
        break;
      case "log":
        if (sub === "entry") await C.cmdLogEntry(flags as C.Args, ctx);
        else if (sub === "complete") await C.cmdLogComplete(flags as C.Args, ctx);
        else if (sub === "morning") await C.cmdLogMorning(flags as C.Args, ctx);
        else if (sub === "evening") await C.cmdLogEvening(flags as C.Args, ctx);
        else if (sub === "list") await C.cmdLogList(flags as C.Args, ctx);
        else fail("vibevision log needs a subcommand: entry | complete | morning | evening | list");
        break;
      case "lag":
        if (sub === "update") await C.cmdLagUpdate(flags as C.Args, ctx);
        else if (sub === "done") await C.cmdLagDone(flags as C.Args, ctx);
        else fail("vibevision lag needs a subcommand: update | done");
        break;
      default:
        fail(`Unknown command "vibevision ${command}". Run: vibevision help`);
    }
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

main()
  .then(() => {
    process.exit(process.exitCode ?? 0);
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status;
    if (status && status >= 400) {
      const hint: Record<number, string> = {
        400: "Bad request — check the flags.",
        403: "Forbidden — the API key lacks permission (or data rules are stricter than superuser).",
        404: "Not found — check the id/slug or that the instance has been migrated (pnpm pb:migrate).",
        422: "Validation error — a field failed the PocketBase schema (see message)."
      };
      fail(`${message}${hint[status] ? ` (${hint[status]})` : ""}`);
    }
    fail(message);
  });
