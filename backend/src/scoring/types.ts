import type { ExecutionStyle } from '../tactics/plan';

/** Week score for one tactic (snake_case API shape). */
export interface TacticWeekScore {
  tactic_id: string;
  tactic_title: string;
  goal_id: string;
  goal_title: string;
  planned: number;
  full_week_planned: number;
  actual: number;
  score: number;
  weight: number;
  status: TrackStatus;
  unit: string;
  scheduled?: number;
  tracking_type: string;
  recurrence_type: string;
  recurrence_count: number;
  target_value: number;
  execution_style: ExecutionStyle;
}

export type TrackStatus = 'on_track' | 'warning' | 'off_track' | 'coming';

export interface GoalScore {
  goal_id: string;
  goal_title: string;
  score: number;
  status: TrackStatus;
}

export interface WeekScore {
  cycle_id: string;
  week_number: number;
  weekly_score: number;
  status: TrackStatus;
  goal_scores: GoalScore[];
  tactic_scores: TacticWeekScore[];
}

/** Minimal tactic view the scorer needs (snake_case DB row subset). */
export interface ScoreTactic {
  id: string;
  goal_id: string;
  title: string;
  type: string;
  tracking_type: string;
  recurrence_type: string;
  execution_style: string | null;
  recurrence_count: number;
  target_value: number;
  target_per_week: number | null;
  target_per_day: number | null;
  unit: string;
  scoring_weight: number;
  starts_week: number | null;
  ends_week: number | null;
  active: boolean;
  sort_order: number;
}

export interface ScoreTacticRow {
  tactic: ScoreTactic;
  goal_title: string;
}

export interface ScoreScheduleRow {
  tactic_id: string;
  week_number: number;
  planned_target: number | null;
  required: boolean;
}

export interface ScoreBlockRow {
  tactic_id: string;
  date: string;
  planned_value: number;
}

export interface ScoreEntry {
  tactic_id: string;
  date: string | null;
  value: number;
  completed: boolean;
}

export interface ScoreInput {
  week_number: number;
  as_of_date: string;
  include_as_of_date?: boolean;
  tactic_rows: ScoreTacticRow[];
  schedule_rows: ScoreScheduleRow[];
  calendar_blocks: ScoreBlockRow[];
  entries: ScoreEntry[];
  week_start_date: string | null;
  week_end_date: string | null;
  has_snapshot: boolean;
}
