# VibeVision — Kontrakt v1

Verbindlich für `backend` (NestJS-API), Web (Next.js, Repo-Root) und `cli`. Abweichungen nur nach Absprache (dann dieses Dokument aktualisieren).

Port des PocketBase-Backends (`backend/pocketbase`, Collections siehe `scripts/migrate-pocketbase.mjs`, Server-Regeln siehe `backend/pocketbase/hooks/main.pb.js`) auf den VibeLabs-Stack: **NestJS + Drizzle + better-sqlite3**. Die Hooks-Validierungslogik (Calendar-Blocks, Tactic-Entries) wird in Nest-Services portiert, nicht neu erfunden. Das Scoring (`src/app/core`, inkl. `scoring.test.ts`-Matrix) wird als Pure-Functions-Modul ins Backend portiert; die Testmatrix wird mitportiert.

**Diff zum PB-Original:** snake_case-Felder, UUIDs statt PB-IDs, ISO-Timestamps `created_at/updated_at` überall, `/v1`-Prefix, flache `{ error }`-Fehler. Web und CLI werden auf die neue API umgebaut (kein PB-SDK mehr). Kein E-Mail-Verify, kein OAuth (persönliches Tool).

## 1. Begriffe (aus README + Core übernommen)

- **Cycle** — 12 Wochen, max 3 Goals, ein aktiver Cycle (`slug` UNIQUE, `status` planned|active|done).
- **Goal** — mit Lag-Indikatoren (`status` in_progress|achieved|dropped).
- **Tactic** — Lead-Measures: `tracking_type` boolean|quantity|duration × `recurrence_type` daily|weekdays|times_per_week|once, `execution_style` toggle|occurrence|volume (abgeleitet oder explizit, Regeln wie bisher: `deriveExecutionStyle`/`resolveExecutionStyle`).
- **Tactic-Schedule** — Wochen-Override (`planned_target`, `required`), UNIQUE(tactic, Woche).
- **Calendar-Block** — Taktik-Slot an Datum/Zeit mit `planned_value`.
- **Tactic-Entry** — geloggter Fortschritt (tactic × Datum), `value`/`completed`.
- **Daily-Log** — Morgen (`one_thing`, `stress_level`) + Abend (`agency_score`, Wins, Avoidance, Deep Work), UNIQUE(cycle, Datum).
- **Week-Snapshot** — eingefrorener Wochenstand (JSON) für stabile Reports.
- **Weekly-/Monthly-Review** — Wochen-/Monats-Reflexion.
- **Event** — append-only Aktivitäts-Log (`type`, `payload_json`).
- **Settings** — Key-Value (`active_cycle` u.a.).
- **API-Token** — Personal Access Token für CLI, Format `vv_<48 hex>` (Prefix `vv_`).

**Tenant-Modell v2: Per-User-Isolation.** Jede Fach-Tabelle trägt `user_id` (FK → `user.id`, ON DELETE CASCADE). Jede authentifizierte Identität (Session ODER Token) sieht und mutiert nur eigene Rows; Fremdzugriff gibt 404 (kein Existence-Leak). Migration `0002`: Backfill aller Bestands-Rows auf den ältesten User (`MIN(created_at)`).

## 2. Storage — SQLite (drizzle + better-sqlite3, `/data/vibevision.sqlite` in Prod, `./data/vibevision.sqlite` lokal)

Pragmas: `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`. Migrationen via drizzle-kit, committed unter `backend/drizzle/`. IDs: UUID v4 (App-Layer `randomUUID`). Timestamps: `created_at/updated_at` TEXT NOT NULL ISO-8601 (bei append-only `events`: nur `created_at`).

### Tabellen `user`, `session`, `account`, `verification` (Better Auth)

Von Better Auth verwaltet (Drizzle-Adapter). Nicht manuell verändern.

### Tabelle `cycles`

`id` PK, `slug` TEXT NOT NULL UNIQUE, `title` NOT NULL, `vision` DEFAULT `''`, `start_date`/`end_date` NOT NULL (ISO-Datum), `status` NOT NULL (`planned|active|done`, sonst 400), `captured_at` NULL, timestamps.

### Tabelle `cycle_weeks`

`id` PK, `cycle_id` NOT NULL → `cycles(id) ON DELETE CASCADE`, `week_number` INTEGER NOT NULL, `start_date`/`end_date`/`label` NOT NULL, UNIQUE(`cycle_id`,`week_number`), timestamps.

### Tabelle `goals`

`id` PK, `cycle_id` NOT NULL → CASCADE, `title` NOT NULL, `description` DEFAULT `''`, `sort_order` REAL DEFAULT `0`, `status` NOT NULL (`in_progress|achieved|dropped`, sonst 400), timestamps. Index (`cycle_id`).

### Tabelle `lag_indicators`

`id` PK, `goal_id` NOT NULL → CASCADE, `title` NOT NULL, `type` DEFAULT `''` (`number|boolean|milestone|text|quantity`, sonst 400), `target_value`/`current_value` REAL DEFAULT `0`, `unit` DEFAULT `''`, `achieved` INTEGER DEFAULT `0`, `sort_order` REAL DEFAULT `0`, timestamps. Index (`goal_id`).

### Tabelle `tactics`

`id` PK, `goal_id` NOT NULL → CASCADE, `title` NOT NULL, `type` NOT NULL (**deprecated**: Legacy-Typ `daily_checkbox|weekly_hours|weekly_count|habit|one_time`, nur noch lesbar; Plan-Felder sind führend), `tracking_type` NOT NULL (`boolean|quantity|duration`), `recurrence_type` NOT NULL (`daily|weekdays|times_per_week|once`), `execution_style` NULL (`toggle|occurrence|volume`), `recurrence_count` REAL DEFAULT `1`, `target_value` REAL DEFAULT `0`, `unit` NOT NULL, `target_per_week`/`target_per_day` REAL DEFAULT `0`, `scoring_weight` REAL DEFAULT `1`, `starts_week`/`ends_week` INTEGER NULL, `active` INTEGER DEFAULT `1`, `sort_order` REAL DEFAULT `0`, timestamps. Index (`goal_id`). Plan-/Style-Regeln = Port von `resolveTacticPlan`/`resolveExecutionStyle` (inkl. Legacy-`type`-Mapping).

### Tabelle `tactic_schedules`

`id` PK, `tactic_id` NOT NULL → CASCADE, `week_number` INTEGER NOT NULL, `planned_target` REAL DEFAULT `0`, `required` INTEGER DEFAULT `0`, UNIQUE(`tactic_id`,`week_number`).

### Tabelle `tactic_calendar_blocks`

`id` PK, `tactic_id` NOT NULL → CASCADE, `cycle_id` NOT NULL → CASCADE, `week_number` INTEGER NOT NULL, `date` NOT NULL (ISO-Datum), `start_time`/`end_time` NULL (`HH:MM`), `duration_minutes` INTEGER NULL, `planned_value` REAL NOT NULL, `note` DEFAULT `''`, timestamps. Index (`cycle_id`,`week_number`). **Write-Regeln = Port von `calendarExecute`:** Block > 0 (normalisiert, sonst 400); Cycle/Woche müssen zu Taktik+Datum passen; Toggles nicht planbar; Occurrence-Blöcke ganzzahlig; Wochenbudget (`planned_target` bzw. Basis-Target) darf nicht überschritten werden.

### Tabelle `daily_logs`

`id` PK, `cycle_id` NOT NULL → CASCADE, `date` NOT NULL, `one_thing` DEFAULT `''`, `morning_done`/`evening_done` INTEGER DEFAULT `0`, `stress_level`/`agency_score` INTEGER NULL, `comfort_zone_done` INTEGER DEFAULT `0`, `deep_work_minutes` INTEGER NULL, `avoidance_trigger`/`private_victories`/`notes` DEFAULT `''`, UNIQUE(`cycle_id`,`date`), timestamps.

### Tabelle `tactic_entries`

`id` PK, `tactic_id` NOT NULL → CASCADE, `cycle_id` NOT NULL → CASCADE, `week_number` INTEGER NOT NULL, `date` NOT NULL, `value` REAL DEFAULT `0`, `completed` INTEGER DEFAULT `0`, `note` DEFAULT `''`, timestamps. Index (`cycle_id`,`week_number`). **Write-Regeln = Port von `entryCreateOrUpdateExecute`/`entryDeleteExecute`:** Cycle/Woche müssen zu Taktik+Datum passen (Datum innerhalb Cycle); Toggle braucht `completed` oder Wert > 0 (zählt 1); Occurrence ganzzahlig > 0; Volume ≠ 0; Tages-Target (Blöcke > Plan) darf nicht überschritten werden; negative Entries nicht direkt löschbar.

### Tabelle `week_snapshots`

`id` PK, `cycle_id` NOT NULL → CASCADE, `week_number` INTEGER NOT NULL, `snapshot_json` NOT NULL (≤ 2 MB), `captured_at` NOT NULL, timestamps. Index (`cycle_id`,`week_number`).

### Tabelle `weekly_reviews`

`id` PK, `cycle_id` NOT NULL → CASCADE, `week_number` INTEGER NOT NULL, `execution_score` REAL NULL, Textfelder `weekly_goals|wins|misses|avoidance_patterns|lessons|next_week_adjustments` DEFAULT `''` (≤ 10k), `completed_at` NULL, UNIQUE(`cycle_id`,`week_number`), timestamps.

### Tabelle `monthly_reviews`

`id` PK, `cycle_id` NOT NULL → CASCADE, `month_number` INTEGER NOT NULL, `title` NOT NULL, `reflection`/`adjustments` DEFAULT `''` (≤ 20k), UNIQUE(`cycle_id`,`month_number`), timestamps.

### Tabelle `events`

`id` PK, `cycle_id` NULL → `cycles(id) ON DELETE CASCADE`, `type` NOT NULL, `payload_json` DEFAULT `'{}'` (≤ 50k), `created_at`. Append-only (kein PUT/DELETE). Index (`cycle_id`).

### Tabelle `settings`

`id` PK, `key` TEXT NOT NULL UNIQUE, `value` NOT NULL, timestamps.

### Tabelle `api_tokens`

`id` PK (UUID), `user_id` NOT NULL (FK → `user.id`, CASCADE), `owner_email` NOT NULL, `name` NOT NULL, `token_hash` NOT NULL UNIQUE (SHA-256 hex), `prefix` NOT NULL (erste 12 Zeichen), `created_at` NOT NULL, `last_used_at` NULL. Token-Listen/Revoke sind pro User.

**v1-Nicht-Ziele:** keine File-Uploads (PB hatte keine), keine Realtime-Abos, keine Admin-UI.

## 3. Auth

Reihenfolge überall: 1. **Better-Auth-Session (Cookie)**, 2. **API-Token** `Authorization: Bearer *** (SHA-256 → Lookup, `last_used_at`-Update throttled 60 s). Better-Auth-Handler als Express-Middleware unter `/api/auth/*` (VOR dem Nest-Router, dort kein Guard). Login: Email + Password, kein Verify, kein OAuth. Guard: globaler `APP_GUARD` + `@Public()` für `/health`. Der Guard hängt `request.auth` an (`AuthContext { userId, email, via }`); Controller lesen sie per `@Auth()` und geben `userId` an Services weiter — alle Fach-Queries sind pro User gefiltert. Fehler: `401 { error: 'unauthorized' }`. `BETTER_AUTH_SECRET` fehlt/Platzhalter → Boot-Fail.

## 4. API (NestJS, Prefix `/v1`, Port lokal `3101`)

Alle Responses JSON. Fehler flach `{ error: string }`. Codes: `unauthorized` 401, `not_found` 404, `bad_request` 400, `conflict` 409, `unprocessable` 422 (`{ error, unknown_fields, valid_fields }`), `payload_too_large` 413, `rate_limited` 429, `internal_error` 500. Body-Limit 3 MB. ValidationPipe (whitelist + forbidNonWhitelisted). POST→201, PUT (partiell)→200, DELETE→200 `{ ok: true }`. List-Query: `?page&limit(≤100)&sort&order&search&filters` (`filters` = JSON `[{field,op,value}]`, ops `contains|is|is_not|is_empty|is_not_empty|gt|lt`, Feldnamen allowlist-validiert). Beträge/Mengen als REAL (normalisiert auf 1e-6 wie bisher `normalizeAmount`).

### Öffentlich

| Method | Pfad | Verhalten |
| --- | --- | --- |
| GET | `/health` | `{ ok: true, db: true }`, DB-Check inkl. |
| * | `/api/auth/*` | Better Auth (kein Guard) |

### CRUD (alle authentifiziert, je `{ items, total, page, limit }` auf GET-Listen)

`cycles` (POST erzeugt 12 `cycle_weeks`; POST `/:id/activate` aktiviert exklusiv), `cycle-weeks` (read + PUT label, kein DELETE), `goals`, `lag-indicators` (PUT `/:id/achieve` setzt achieved+current), `tactics`, `tactic-schedules` (POST-Upsert per tactic+Woche), `calendar-blocks` (Write-Regeln §2), `daily-logs` (GET per `?cycle_id=&date=`, PUT-Upsert per cycle+Datum), `entries` (Write-Regeln §2), `snapshots`, `weekly-reviews`, `monthly-reviews`, `events` (nur GET/POST), `settings` (GET `/v1/settings/:key`, PUT-Upsert).

### Computed (Ports von `src/app/core`; Scoring-Modul inkl. Testmatrix wandert ins Backend)

| Method | Pfad | Verhalten |
| --- | --- | --- |
| GET | `/v1/dashboard?cycle_id=` | DashboardData (aktiver Cycle, currentWeek, daysLeft, score, todaySummary/Tactics/Blocks, recentEvents) |
| GET | `/v1/cycles/:id/score?week=&as_of=` | WeekScore (Tactic-/Goal-Scores, Status) |
| GET | `/v1/cycles/:id/overall?week=` | OverallScore über gestartete Wochen |
| GET | `/v1/cycles/:id/weeks/:n/report` | WeekReport (Score + Logs + Reviews + Snapshot) |
| POST | `/v1/cycles/:id/weeks/:n/snapshot` | Snapshot einfrieren → 201 |
| POST | `/v1/entries/log` | Entry loggen (validiert, idempotent pro tactic×Datum: summiert wie bisher) |
| POST | `/v1/entries/undo` | `{tactic_id!, date!}` → letztes Entry dekrementieren/löschen → `{ undone: id|null }` |
| POST | `/v1/calendar-blocks/move` | `{block_id?|tactic_id?+from_date?, to_date!}` → Ziel-Budget prüfen, Datum+Woche setzen |
| GET | `/v1/cycles/:id/calendar?from=&to=` | Kalender-Seite: `{ blocks (mit Titeln+unit), scheduling: SchedulingItem[], current_week }` |
| GET | `/v1/tactics/:id/today-state?date=` | Stepper-State: `{ tactic, execution_style, today_actual, today_target }` |
| GET | `/v1/cycles/:id/weeks/scores?weeks=1,2,3` | Batch-Scores ohne Block-Präzision (Wochen-Übersicht) |
| POST | `/v1/daily-logs/checkin` | `{ cycle_id, date, kind: morning\|evening, ...Felder }` |
| POST/GET/DELETE | `/v1/tokens` | `{name!}→201 { id, token, prefix }` (einmalig) / Liste ohne Hash / `:id` → `{ ok: true }` |

## 5. Web (Next.js, Repo-Root, Port 3000)

- API-Client `apiFetch` (Session-Cookie-Passthrough serverseitig), `NEXT_PUBLIC_API_URL` (Build-Arg) + `NEXT_PUBLIC_WEB_URL`. Serverseitige Env `API_URL` für SSR.
- Auth via Better-Auth-Client gegen API (`/api/auth`); `/login` umgebaut; kein PB-SDK mehr (`pocketbase`-Dep entfällt).
- `src/app/core/*` wird dünn: API-Calls + Render-Formatierung; Scoring/Validierung lebt in der API.
- Neu: `/settings/tokens` (Token-Self-Service für CLI).
- `export const dynamic = 'force-dynamic'` auf Seiten mit Session-Zugriff.

## 6. CLI (`cli/`, `bin/vibevision.js`)

- Instance-Precedence bleibt: `--instance > VV_INSTANCE > ./.vv/vv.json > ~/.config/vibevision/vv.json` (jetzt API-Base-URL).
- Keys: Format wie bisher, aber `vv_`-Tokens. Auth: `auth login --instance <url> --token <vv_…>` (Token aus Web `/settings/tokens`; verify via `GET /health` + `GET /v1/dashboard`) — KEIN Password-Flow. `auth whoami`, `auth logout`, `health` (ohne Key), `tokens create|ls|revoke`.
- Befehlsumfang bleibt: `today`, `log entry|evening|morning`, `score`, `report`, Cycle-/Goal-/Taktik-Befehle wie bisher, `--json` überall. Fehler: `✗`-Prefix, exit 1.

## 7. Ops

- Repo `vibelabsdotto/vibevision` (bleibt), neue Coolify-App `vibevision-api` auf `hetzner1` (`backend/Dockerfile`, Port 3101): erst Temp-Domain + E2E, dann Domain `https://vision-pb.vibelabs.to` von `vibevision-pb` übernehmen. Wildcard `*.vibelabs.to` deckt ab, kein DNS-Record nötig.
- API-Env: `PORT=3101, DATABASE_PATH=/data/vibevision.sqlite, WEB_BASE_URL=https://vision.vibelabs.to, CORS_ORIGIN=https://vision.vibelabs.to, BETTER_AUTH_SECRET` + Coolify Persistent Storage → `/data`.
- Web-Env beim Cutover: `NEXT_PUBLIC_API_URL=https://vision-pb.vibelabs.to` (+ serverseitig `API_URL`), dann Redeploy `vibevision-web`.
- Danach `vibevision-pb` stoppen (Volume bleibt als Backup). Prod-Datenstand 2026-09: 1 User, 0 Records — Migration = ersten User per Sign-up anlegen, kein Export nötig.
- Gates: `typecheck` → `lint` → `test` → `build` je Workspace grün. Prod-E2E: Health, Auth (Session + Token), CRUD je Entity, Block-/Entry-Validierung (Negativfälle), Dashboard/Score/Report, CLI-Befehle gegen Prod-Instance.
