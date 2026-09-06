/** Raw list query params — plain interface so ValidationPipe passes them through. */
export interface ListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
}

export interface CycleListQuery extends ListQuery {
  status?: string;
}

export interface CycleBody {
  title?: unknown;
  start_date?: unknown;
  vision?: unknown;
  status?: unknown;
  slug?: unknown;
  captured_at?: unknown;
}

export interface Cycle {
  id: string;
  slug: string;
  title: string;
  vision: string;
  start_date: string;
  end_date: string;
  status: string;
  captured_at: string | null;
  created_at: string;
  updated_at: string;
}

export type { CycleListQuery as CycleQuery };
