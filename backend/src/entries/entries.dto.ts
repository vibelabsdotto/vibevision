export interface TacticEntryListQuery {
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
  from?: string;
  to?: string;
}

export interface TacticEntryBody {
  tactic_id?: unknown;
  cycle_id?: unknown;
  week_number?: unknown;
  date?: unknown;
  value?: unknown;
  completed?: unknown;
  note?: unknown;
}

export interface TacticEntry {
  id: string;
  tactic_id: string;
  cycle_id: string;
  week_number: number;
  date: string;
  value: number;
  completed: number;
  note: string;
  created_at: string;
  updated_at: string;
}
