export interface TacticScheduleListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  tactic_id?: string;
  week_number?: string;
}

export interface TacticScheduleBody {
  tactic_id?: unknown;
  week_number?: unknown;
  planned_target?: unknown;
  required?: unknown;
}

export interface TacticSchedule {
  id: string;
  tactic_id: string;
  week_number: number;
  planned_target: number;
  required: number;
  created_at: string;
  updated_at: string;
}
