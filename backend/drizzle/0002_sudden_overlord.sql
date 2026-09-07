-- 0002_per_user_isolation: foundation for per-user data isolation.
--
-- What this migration does:
-- 1. Adds `user_id` (FK -> user.id, ON DELETE CASCADE) to every domain
--    table: cycles, cycle_weeks, goals, lag_indicators, tactics,
--    tactic_schedules, tactic_calendar_blocks, daily_logs, tactic_entries,
--    week_snapshots, weekly_reviews, monthly_reviews, events, settings,
--    api_tokens.
-- 2. Scopes uniqueness per user: idx_cycles_slug is now (slug, user_id) and
--    idx_settings_key is now (key, user_id). The old global uniques
--    (cycles_slug_unique, settings_key_unique) are dropped.
--    api_tokens.token_hash stays globally UNIQUE (hashes are random and must
--    resolve unambiguously); events.cycle_id stays nullable.
-- 3. Backfills user_id on pre-existing rows (see BACKFILL RULE below) and
--    adds one idx_<table>_user index per table.
--
-- BACKFILL RULE: every upgraded row that has user_id IS NULL is assigned to
-- the oldest user: (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1),
-- i.e. the user with MIN(created_at). On a fresh DB the UPDATEs match zero
-- rows and are no-ops.
--
-- SQLite caveat (NOT NULL on populated tables): SQLite refuses
-- `ALTER TABLE ... ADD COLUMN ... NOT NULL` on a non-empty table, so the
-- columns are added NULLABLE and then backfilled. The drizzle schema declares
-- them .notNull() and the app always writes user_id, so after a successful
-- run no NULLs remain whenever at least one user exists. (A future
-- `drizzle-kit generate` may report nullability drift here; that is expected
-- and must be resolved with a table rebuild, not by editing this file.)
--
-- EMPTY-USER EDGE CASE: if the `user` table is empty but ANY domain table
-- already holds rows, there is no owner to assign. That fails FAST via the
-- _0002_backfill_guard below (it tries to INSERT NULL into a NOT NULL
-- column, so SQLite aborts with "NOT NULL constraint failed" and the whole
-- migration rolls back) instead of leaving silent NULLs. Fresh DBs (no
-- users, no rows) insert 'ok' and pass trivially.
CREATE TEMP TABLE `_0002_backfill_guard` (`ok` TEXT NOT NULL);--> statement-breakpoint
INSERT INTO `_0002_backfill_guard` SELECT CASE WHEN (SELECT COUNT(*) FROM `user`) = 0 AND (EXISTS(SELECT 1 FROM `cycles`) OR EXISTS(SELECT 1 FROM `cycle_weeks`) OR EXISTS(SELECT 1 FROM `goals`) OR EXISTS(SELECT 1 FROM `lag_indicators`) OR EXISTS(SELECT 1 FROM `tactics`) OR EXISTS(SELECT 1 FROM `tactic_schedules`) OR EXISTS(SELECT 1 FROM `tactic_calendar_blocks`) OR EXISTS(SELECT 1 FROM `daily_logs`) OR EXISTS(SELECT 1 FROM `tactic_entries`) OR EXISTS(SELECT 1 FROM `week_snapshots`) OR EXISTS(SELECT 1 FROM `weekly_reviews`) OR EXISTS(SELECT 1 FROM `monthly_reviews`) OR EXISTS(SELECT 1 FROM `events`) OR EXISTS(SELECT 1 FROM `settings`) OR EXISTS(SELECT 1 FROM `api_tokens`)) THEN NULL ELSE 'ok' END;--> statement-breakpoint
DROP TABLE `_0002_backfill_guard`;--> statement-breakpoint
DROP INDEX `cycles_slug_unique`;--> statement-breakpoint
DROP INDEX `idx_cycles_slug`;--> statement-breakpoint
ALTER TABLE `cycles` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `cycles` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cycles_slug` ON `cycles` (`slug`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_cycles_user` ON `cycles` (`user_id`);--> statement-breakpoint
DROP INDEX `settings_key_unique`;--> statement-breakpoint
DROP INDEX `idx_settings_key`;--> statement-breakpoint
ALTER TABLE `settings` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `settings` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_settings_key` ON `settings` (`key`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_settings_user` ON `settings` (`user_id`);--> statement-breakpoint
ALTER TABLE `api_tokens` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `api_tokens` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_api_tokens_user` ON `api_tokens` (`user_id`);--> statement-breakpoint
ALTER TABLE `cycle_weeks` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `cycle_weeks` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_cycle_weeks_user` ON `cycle_weeks` (`user_id`);--> statement-breakpoint
ALTER TABLE `daily_logs` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `daily_logs` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_daily_logs_user` ON `daily_logs` (`user_id`);--> statement-breakpoint
ALTER TABLE `events` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `events` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_events_user` ON `events` (`user_id`);--> statement-breakpoint
ALTER TABLE `goals` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `goals` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_goals_user` ON `goals` (`user_id`);--> statement-breakpoint
ALTER TABLE `lag_indicators` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `lag_indicators` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_lag_indicators_user` ON `lag_indicators` (`user_id`);--> statement-breakpoint
ALTER TABLE `monthly_reviews` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `monthly_reviews` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_monthly_reviews_user` ON `monthly_reviews` (`user_id`);--> statement-breakpoint
ALTER TABLE `tactic_calendar_blocks` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `tactic_calendar_blocks` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_tactic_calendar_blocks_user` ON `tactic_calendar_blocks` (`user_id`);--> statement-breakpoint
ALTER TABLE `tactic_entries` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `tactic_entries` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_tactic_entries_user` ON `tactic_entries` (`user_id`);--> statement-breakpoint
ALTER TABLE `tactic_schedules` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `tactic_schedules` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_tactic_schedules_user` ON `tactic_schedules` (`user_id`);--> statement-breakpoint
ALTER TABLE `tactics` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `tactics` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_tactics_user` ON `tactics` (`user_id`);--> statement-breakpoint
ALTER TABLE `week_snapshots` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `week_snapshots` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_week_snapshots_user` ON `week_snapshots` (`user_id`);--> statement-breakpoint
ALTER TABLE `weekly_reviews` ADD `user_id` text REFERENCES `user`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE;--> statement-breakpoint
UPDATE `weekly_reviews` SET user_id = (SELECT id FROM `user` ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_weekly_reviews_user` ON `weekly_reviews` (`user_id`);
