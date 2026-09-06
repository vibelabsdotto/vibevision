CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `cycle_weeks` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`week_number` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cycle_weeks_cycle_week` ON `cycle_weeks` (`cycle_id`,`week_number`);--> statement-breakpoint
CREATE TABLE `cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`vision` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text NOT NULL,
	`captured_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cycles_slug_unique` ON `cycles` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cycles_slug` ON `cycles` (`slug`);--> statement-breakpoint
CREATE TABLE `daily_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`date` text NOT NULL,
	`one_thing` text DEFAULT '' NOT NULL,
	`morning_done` integer DEFAULT 0 NOT NULL,
	`evening_done` integer DEFAULT 0 NOT NULL,
	`stress_level` integer,
	`agency_score` integer,
	`comfort_zone_done` integer DEFAULT 0 NOT NULL,
	`deep_work_minutes` integer,
	`avoidance_trigger` text DEFAULT '' NOT NULL,
	`private_victories` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_logs_cycle_date` ON `daily_logs` (`cycle_id`,`date`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text,
	`type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_cycle` ON `events` (`cycle_id`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_goals_cycle` ON `goals` (`cycle_id`);--> statement-breakpoint
CREATE TABLE `lag_indicators` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`target_value` real DEFAULT 0 NOT NULL,
	`current_value` real DEFAULT 0 NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`achieved` integer DEFAULT 0 NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_lags_goal` ON `lag_indicators` (`goal_id`);--> statement-breakpoint
CREATE TABLE `monthly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`month_number` integer NOT NULL,
	`title` text NOT NULL,
	`reflection` text DEFAULT '' NOT NULL,
	`adjustments` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monthly_reviews_cycle_month` ON `monthly_reviews` (`cycle_id`,`month_number`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_settings_key` ON `settings` (`key`);--> statement-breakpoint
CREATE TABLE `tactic_calendar_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`tactic_id` text NOT NULL,
	`cycle_id` text NOT NULL,
	`week_number` integer NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`duration_minutes` integer,
	`planned_value` real NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tactic_id`) REFERENCES `tactics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_blocks_cycle_week` ON `tactic_calendar_blocks` (`cycle_id`,`week_number`);--> statement-breakpoint
CREATE TABLE `tactic_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tactic_id` text NOT NULL,
	`cycle_id` text NOT NULL,
	`week_number` integer NOT NULL,
	`date` text NOT NULL,
	`value` real DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tactic_id`) REFERENCES `tactics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tactic_entries_cycle_week` ON `tactic_entries` (`cycle_id`,`week_number`);--> statement-breakpoint
CREATE TABLE `tactic_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`tactic_id` text NOT NULL,
	`week_number` integer NOT NULL,
	`planned_target` real DEFAULT 0 NOT NULL,
	`required` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tactic_id`) REFERENCES `tactics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tactic_schedules_tactic_week` ON `tactic_schedules` (`tactic_id`,`week_number`);--> statement-breakpoint
CREATE TABLE `tactics` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`tracking_type` text NOT NULL,
	`recurrence_type` text NOT NULL,
	`execution_style` text,
	`recurrence_count` real DEFAULT 1 NOT NULL,
	`target_value` real DEFAULT 0 NOT NULL,
	`unit` text NOT NULL,
	`target_per_week` real DEFAULT 0 NOT NULL,
	`target_per_day` real DEFAULT 0 NOT NULL,
	`scoring_weight` real DEFAULT 1 NOT NULL,
	`starts_week` integer,
	`ends_week` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tactics_goal` ON `tactics` (`goal_id`);--> statement-breakpoint
CREATE TABLE `week_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`week_number` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`captured_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_week_snapshots_cycle_week` ON `week_snapshots` (`cycle_id`,`week_number`);--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`week_number` integer NOT NULL,
	`execution_score` real,
	`weekly_goals` text DEFAULT '' NOT NULL,
	`wins` text DEFAULT '' NOT NULL,
	`misses` text DEFAULT '' NOT NULL,
	`avoidance_patterns` text DEFAULT '' NOT NULL,
	`lessons` text DEFAULT '' NOT NULL,
	`next_week_adjustments` text DEFAULT '' NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_weekly_reviews_cycle_week` ON `weekly_reviews` (`cycle_id`,`week_number`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_account_id_unique` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);