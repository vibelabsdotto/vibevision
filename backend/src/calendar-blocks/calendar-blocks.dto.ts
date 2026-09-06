export interface CalendarBlockListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  tactic_id?: string;
  cycle_id?: string;
  week_number?: string;
  date?: string;
}

export interface CalendarBlockBody {
  tactic_id?: unknown;
  cycle_id?: unknown;
  week_number?: unknown;
  date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  duration_minutes?: unknown;
  planned_value?: unknown;
  note?: unknown;
}

export interface CalendarBlock {
  id: string;
  tactic_id: string;
  cycle_id: string;
  week_number: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  planned_value: number;
  note: string;
  created_at: string;
  updated_at: string;
}
