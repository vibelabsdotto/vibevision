#!/usr/bin/env node
/**
 * vibevision launcher — works from any cwd and any install layout (repo checkout,
 * pnpm workspace, or a standalone `node bin/vv.js` invocation).
 *
 * Resolves the repo root from this file's location, then delegates to the
 * TypeScript entry (cli/index.ts) via the repo's tsx + tsconfig, so the CLI
 * can import the app's core modules with their `@/` aliases unchanged.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const tsconfig = path.join(repoRoot, "tsconfig.json");
const entry = path.join(repoRoot, "cli", "index.ts");

function findTsxCli() {
  const candidates = [
    path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(repoRoot, "node_modules", ".pnpm")
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && c.endsWith("cli.mjs")) return c;
  }
  // locate the pnpm-copied tsx
  const pnpmDir = path.join(repoRoot, "node_modules", ".pnpm");
  if (fs.existsSync(pnpmDir)) {
    for (const dir of fs.readdirSync(pnpmDir)) {
      if (!dir.startsWith("tsx@")) continue;
      const candidate = path.join(pnpmDir, dir, "node_modules", "tsx", "dist", "cli.mjs");
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const tsxCli = findTsxCli();
if (!tsxCli) {
  console.error("vibevision: cannot locate tsx in the repo (node_modules). Run `pnpm install` in " + repoRoot + ".");
  process.exit(2);
}

const child = spawn(process.execPath, [tsxCli, "--tsconfig", tsconfig, entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: repoRoot
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
