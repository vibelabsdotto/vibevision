<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CLI (`vibevision`)

The repo ships a CLI: `bin/vibevision.js` → `cli/index.ts`. It reuses the web app's core
functions (`src/app/core`) and talks to any VibeVision PocketBase instance via a stored
superuser API key.

- Global command: `npm link` from the repo root (like `vibe-release`), then `vibevision …` from any cwd.
- Without link: `node bin/vibevision.js …`
- Config: `.vv/` (repo, gitignored) — `vv.json` (instance), `instances.json` (API keys, 0600).
  Fallback: `~/.config/vibevision/`. Instance override: `--instance <url>` or `VV_INSTANCE`.
- All commands accept `--json`. Full reference: `vibevision help` / README "CLI".
- Auth is superuser-based: `vibevision auth login --email <superuser> --password <pw>`.
