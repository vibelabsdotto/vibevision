import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { account, session, user, verification } from './auth-schema';

// Contract §2: VibeVision tables. Ids are UUID v4 generated in the app layer.
// Timestamps are ISO-8601 strings written by the app. Booleans are INTEGER
// 0/1. Amounts are REAL, normalized to 1e-6 by the service layer.
//
// Per-user isolation: every domain table carries `user_id` (FK → user.id,
// cascade delete). Slugs/keys are unique per user, not globally.

export const cycles = sqliteTable(
  'cycles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    vision: text('vision').notNull().default(''),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    status: text('status').notNull(),
    capturedAt: text('captured_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_cycles_slug').on(table.slug, table.userId),
    index('idx_cycles_user').on(table.userId),
  ],
);

export const cycleWeeks = sqliteTable(
  'cycle_weeks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    label: text('label').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_cycle_weeks_cycle_week').on(
      table.cycleId,
      table.weekNumber,
    ),
    index('idx_cycle_weeks_user').on(table.userId),
  ],
);

export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    sortOrder: real('sort_order').notNull().default(0),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_goals_cycle').on(table.cycleId),
    index('idx_goals_user').on(table.userId),
  ],
);

export const lagIndicators = sqliteTable(
  'lag_indicators',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    type: text('type').notNull().default(''),
    targetValue: real('target_value').notNull().default(0),
    currentValue: real('current_value').notNull().default(0),
    unit: text('unit').notNull().default(''),
    achieved: integer('achieved').notNull().default(0),
    sortOrder: real('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_lags_goal').on(table.goalId),
    index('idx_lag_indicators_user').on(table.userId),
  ],
);

export const tactics = sqliteTable(
  'tactics',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Deprecated legacy type (daily_checkbox|weekly_hours|…): readable, plan fields lead. */
    type: text('type').notNull(),
    trackingType: text('tracking_type').notNull(),
    recurrenceType: text('recurrence_type').notNull(),
    executionStyle: text('execution_style'),
    recurrenceCount: real('recurrence_count').notNull().default(1),
    targetValue: real('target_value').notNull().default(0),
    unit: text('unit').notNull(),
    targetPerWeek: real('target_per_week').notNull().default(0),
    targetPerDay: real('target_per_day').notNull().default(0),
    scoringWeight: real('scoring_weight').notNull().default(1),
    startsWeek: integer('starts_week'),
    endsWeek: integer('ends_week'),
    active: integer('active').notNull().default(1),
    sortOrder: real('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_tactics_goal').on(table.goalId),
    index('idx_tactics_user').on(table.userId),
  ],
);

export const tacticSchedules = sqliteTable(
  'tactic_schedules',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tacticId: text('tactic_id')
      .notNull()
      .references(() => tactics.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    plannedTarget: real('planned_target').notNull().default(0),
    required: integer('required').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_tactic_schedules_tactic_week').on(
      table.tacticId,
      table.weekNumber,
    ),
    index('idx_tactic_schedules_user').on(table.userId),
  ],
);

export const tacticCalendarBlocks = sqliteTable(
  'tactic_calendar_blocks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tacticId: text('tactic_id')
      .notNull()
      .references(() => tactics.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    date: text('date').notNull(),
    startTime: text('start_time'),
    endTime: text('end_time'),
    durationMinutes: integer('duration_minutes'),
    plannedValue: real('planned_value').notNull(),
    note: text('note').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_blocks_cycle_week').on(table.cycleId, table.weekNumber),
    index('idx_tactic_calendar_blocks_user').on(table.userId),
  ],
);

export const dailyLogs = sqliteTable(
  'daily_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    oneThing: text('one_thing').notNull().default(''),
    morningDone: integer('morning_done').notNull().default(0),
    eveningDone: integer('evening_done').notNull().default(0),
    stressLevel: integer('stress_level'),
    agencyScore: integer('agency_score'),
    comfortZoneDone: integer('comfort_zone_done').notNull().default(0),
    deepWorkMinutes: integer('deep_work_minutes'),
    avoidanceTrigger: text('avoidance_trigger').notNull().default(''),
    privateVictories: text('private_victories').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_daily_logs_cycle_date').on(table.cycleId, table.date),
    index('idx_daily_logs_user').on(table.userId),
  ],
);

export const tacticEntries = sqliteTable(
  'tactic_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tacticId: text('tactic_id')
      .notNull()
      .references(() => tactics.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    date: text('date').notNull(),
    value: real('value').notNull().default(0),
    completed: integer('completed').notNull().default(0),
    note: text('note').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_tactic_entries_cycle_week').on(table.cycleId, table.weekNumber),
    index('idx_tactic_entries_user').on(table.userId),
  ],
);

export const weekSnapshots = sqliteTable(
  'week_snapshots',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    capturedAt: text('captured_at').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_week_snapshots_cycle_week').on(table.cycleId, table.weekNumber),
    index('idx_week_snapshots_user').on(table.userId),
  ],
);

export const weeklyReviews = sqliteTable(
  'weekly_reviews',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    executionScore: real('execution_score'),
    weeklyGoals: text('weekly_goals').notNull().default(''),
    wins: text('wins').notNull().default(''),
    misses: text('misses').notNull().default(''),
    avoidancePatterns: text('avoidance_patterns').notNull().default(''),
    lessons: text('lessons').notNull().default(''),
    nextWeekAdjustments: text('next_week_adjustments').notNull().default(''),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_weekly_reviews_cycle_week').on(
      table.cycleId,
      table.weekNumber,
    ),
    index('idx_weekly_reviews_user').on(table.userId),
  ],
);

export const monthlyReviews = sqliteTable(
  'monthly_reviews',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    monthNumber: integer('month_number').notNull(),
    title: text('title').notNull(),
    reflection: text('reflection').notNull().default(''),
    adjustments: text('adjustments').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_monthly_reviews_cycle_month').on(
      table.cycleId,
      table.monthNumber,
    ),
    index('idx_monthly_reviews_user').on(table.userId),
  ],
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id').references(() => cycles.id, {
      onDelete: 'cascade',
    }),
    type: text('type').notNull(),
    payloadJson: text('payload_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_events_cycle').on(table.cycleId),
    index('idx_events_user').on(table.userId),
  ],
);

export const settings = sqliteTable(
  'settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_settings_key').on(table.key, table.userId),
    index('idx_settings_user').on(table.userId),
  ],
);

// Personal access tokens for the CLI. Per-user (like all domain tables):
// each token is owned by exactly one user id; tokenHash stays globally
// UNIQUE because hashes are random and must resolve unambiguously.
export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ownerEmail: text('owner_email').notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    prefix: text('prefix').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at'),
  },
  (table) => [index('idx_api_tokens_user').on(table.userId)],
);

// Better Auth core tables (user/session/account/verification).
export * from './auth-schema';

export const schema = {
  cycles,
  cycleWeeks,
  goals,
  lagIndicators,
  tactics,
  tacticSchedules,
  tacticCalendarBlocks,
  dailyLogs,
  tacticEntries,
  weekSnapshots,
  weeklyReviews,
  monthlyReviews,
  events,
  settings,
  apiTokens,
} as const;

/** Full schema incl. Better Auth tables — used for the drizzle instance. */
export const databaseSchema = {
  ...schema,
  user,
  session,
  account,
  verification,
};
