#!/usr/bin/env tsx
/**
 * vibevision — the VibeVision CLI.
 *
 * Operates any VibeVision instance (NestJS API) with a stored API token,
 * minted in the web app (/settings/tokens) or via `vibevision tokens create`.
 * See README.md → "CLI".
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
import { UsageError, connect, health, lastConnectedInstance } from "./lib/client";
import { initApi, apiFetch } from "./lib/api";
import * as C from "./lib/commands";

const HELP = `vibevision — VibeVision CLI (12 Week Year execution OS)

Usage: vibevision <command> [flags]

Instance (first set wins): --instance <url> | VV_INSTANCE=<url> | vibevision config set instance <url>
Output: --json prints the raw data object (default: human-readable tables)

INSTANCE & AUTH
  vibevision config set instance <url>        remember the instance for future runs
  vibevision config get                       show current instance + stored keys
  vibevision auth login --instance <url> --token <vv_…>
                                      store the API token for that instance
                                      (mint it in the web app: /settings/tokens)
  vibevision auth whoami --instance <url>     verify the stored API token against the instance
  vibevision auth logout --instance <url>     remove the stored API token
  vibevision health                           check instance reachability (no auth needed)
  vibevision tokens create --name <label>     mint a new API token (needs a stored token)
  vibevision tokens ls                       list tokens (prefixes only)
  vibevision tokens revoke --id <tokenId>     revoke a token

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
               [--recurrence daily|weekdays|times_per_week|once] [--style toggle|occurrence|volume]
               [--target 5] [--count 3] [--unit pieces] [--week 1] [--starts-week 1] [--ends-week 4]
               (style default: boolean×daily|weekdays→toggle, boolean×times_per_week|once→occurrence,
                quantity|duration→volume; contradictions are errors; see "tactic add --help" for examples)

DAILY OPERATION
  vibevision today                            today's due tactics + summary
               (--json: rows carry executionStyle, todayKind incl. "pool", todayTarget null for pool,
                and weekRemaining — BREAKING vs earlier builds)
  vibevision log entry --tactic <id> [--value 2] [--note "…"] [--date 2026-09-02|today]
               (quantity without --value logs 1; duration requires --value;
                occurrence needs a positive whole --value; see "log entry --help" for details)
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
  vibevision auth login --instance <url> --token <vv_…>
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
      const token = str(flags, "token");
      if (!token) fail("vibevision auth login needs --token <vv_…> (mint it in the web app: /settings/tokens)");
      if (!/^vv_[0-9a-f]{48}$/.test(token)) fail("vibevision auth login needs a valid token (vv_ + 48 hex chars)");
      // verify the token actually authenticates before persisting it
      initApi(url, token);
      try {
        await apiFetch("GET", "/v1/dashboard");
      } catch {
        fail(`Token rejected by the instance — not storing it.`);
      }
      saveApiKey(url, token, {});
      console.log(`✓ API token stored for ${instanceKey(url)}. Use: vibevision today`);
      return;
    }
    if (sub === "whoami") {
      const key = getApiKey(url);
      if (!key) fail(`No API token stored for ${instanceKey(url)}. Run: vibevision auth login --instance ${url} --token <vv_…>`);
      initApi(url, key);
      try {
        await apiFetch("GET", "/v1/dashboard");
      } catch {
        fail(`API token rejected. Re-run: vibevision auth login --instance ${url} --token <vv_…>`);
      }
      console.log(`✓ ${instanceKey(url)} — API token valid.`);
      return;
    }
    if (sub === "logout") {
      if (deleteApiKey(url)) console.log(`✓ Removed API token for ${instanceKey(url)}`);
      else console.log(`No stored API token for ${instanceKey(url)}.`);
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
      case "tokens":
        if (sub === "create") await C.cmdTokensCreate(flags as C.Args, ctx);
        else if (sub === "ls") await C.cmdTokensLs(flags as C.Args, ctx);
        else if (sub === "revoke") await C.cmdTokensRevoke(flags as C.Args, ctx);
        else fail("vibevision tokens needs a subcommand: create | ls | revoke");
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
    if (status === 0 || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|connection_failed/i.test(message)) {
      const where = lastConnectedInstance();
      fail(
        `Cannot reach the API${where ? ` at ${where}` : ""} — connection refused or timed out. ` +
          `Is the instance running? (override: --instance <url> / VV_INSTANCE=<url>)`
      );
    }
    if (status && status >= 400) {
      const hint: Record<number, string> = {
        400: "Bad request — check the flags.",
        401: "Unauthorized — token missing or rejected (vibevision auth login --token <vv_…>).",
        403: "Forbidden — check the token.",
        404: "Not found — check the id/slug.",
        422: "Validation error — an unknown field was sent (see message)."
      };
      fail(`${message}${hint[status] ? ` (${hint[status]})` : ""}`);
    }
    fail(message);
  });
