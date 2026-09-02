# VibeVision

**The open 12 Week Year execution operating system.**
Next.js (App Router) + PocketBase. Built by [VibeLabs](https://vibelabs.to).

Rebranded and rebuilt from **twy**, the local-first 12 Week Year tracker — now open source
and self-hostable: goals, lag indicators, weekly tactics, calendar blocks, daily
morning/evening logs, execution scoring, week snapshots, and printable weekly reports.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions)
- **PocketBase** as backend — collections + rules ship via migration script and baked-in `pb_migrations/`
- **Tailwind CSS v4** with the VibeLabs design tokens (coral / teal / amber, light + dark)
- Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (labels)
- Tests: Vitest

## Quick start (Docker Compose)

```bash
docker compose up --build
# web: http://localhost:3000
# pocketbase: http://localhost:8080
```

## Quick start (local dev)

```bash
# 1. download pocketbase into backend/pocketbase and start it
cd backend/pocketbase
curl -fsSL https://github.com/pocketbase/pocketbase/releases/download/v0.40.1/pocketbase_v0.40.1_darwin_arm64.zip -o pb.zip
unzip -o pb.zip && rm pb.zip
./pocketbase serve --http=127.0.0.1:8090 --dir=./data

# 2. in a second terminal: migrate schema + create user, then run the app
cd ../../
PB_URL=http://127.0.0.1:8090 \
PB_ADMIN_PASSWORD=<superuser-pass> \
VV_USER_EMAIL=you@example.com VV_USER_PASSWORD=<your-pass> \
npm run pb:migrate

npm install
npm run dev
```

## Concepts

- **Cycle** — 12 weeks, max 3 goals, one active cycle at a time
- **Goal** — with lag indicators (outcomes you cannot directly control)
- **Tactic** — the lead measures: daily / weekdays / times-per-week / once, boolean or quantity/duration tracking
- **Calendar block** — a tactic scheduled at a specific date/time
- **Execution score** — per-week, per-goal, per-tactic; proportional for quantity/duration tactics
- **Daily log** — morning (one thing, stress) + evening (agency, wins, avoidance, deep work)
- **Weekly report** — printable markdown-ish summary per week

## API

PocketBase exposes everything via its REST API at `/api/`. Collections:
`cycles`, `cycle_weeks`, `goals`, `lag_indicators`, `tactics`, `tactic_schedules`,
`tactic_calendar_blocks`, `daily_logs`, `tactic_entries`, `week_snapshots`,
`weekly_reviews`, `monthly_reviews`, `events`, `settings`.

## Deployment

Two containers: `web` (Next.js, port 3000) and `pb` (PocketBase, port 8080).
Point the web container's `PB_URL` at the PocketBase origin, then run the
migration script once against the live instance (or bake `pb_migrations/` into
the PocketBase image — the repo's backend image does exactly that).

## License

MIT — see [LICENSE](LICENSE).