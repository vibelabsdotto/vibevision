export interface LagIndicatorListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  goal_id?: string;
}

export interface LagIndicatorBody {
  goal_id?: unknown;
  title?: unknown;
  type?: unknown;
  target_value?: unknown;
  current_value?: unknown;
  unit?: unknown;
  achieved?: unknown;
  sort_order?: unknown;
}

export interface LagIndicator {
  id: string;
  goal_id: string;
  title: string;
  type: string;
  target_value: number;
  current_value: number;
  unit: string;
  achieved: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
