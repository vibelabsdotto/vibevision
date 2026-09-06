export interface TacticListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  goal_id?: string;
}

export interface TacticBody {
  goal_id?: unknown;
  title?: unknown;
  type?: unknown;
  tracking_type?: unknown;
  recurrence_type?: unknown;
  execution_style?: unknown;
  recurrence_count?: unknown;
  target_value?: unknown;
  unit?: unknown;
  target_per_week?: unknown;
  target_per_day?: unknown;
  scoring_weight?: unknown;
  starts_week?: unknown;
  ends_week?: unknown;
  active?: unknown;
  sort_order?: unknown;
}

export interface Tactic {
  id: string;
  goal_id: string;
  title: string;
  type: string;
  tracking_type: string;
  recurrence_type: string;
  execution_style: string | null;
  recurrence_count: number;
  target_value: number;
  unit: string;
  target_per_week: number;
  target_per_day: number;
  scoring_weight: number;
  starts_week: number | null;
  ends_week: number | null;
  active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
