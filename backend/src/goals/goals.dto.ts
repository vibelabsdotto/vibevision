export interface GoalListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  cycle_id?: string;
  status?: string;
}

export interface GoalBody {
  cycle_id?: unknown;
  title?: unknown;
  description?: unknown;
  sort_order?: unknown;
  status?: unknown;
}

export interface Goal {
  id: string;
  cycle_id: string;
  title: string;
  description: string;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
}
