/** Raw list query params — plain interface so ValidationPipe passes them through. */
export interface DailyLogListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  cycle_id?: string;
  date?: string;
}

export interface DailyLogBody {
  cycle_id?: unknown;
  date?: unknown;
  one_thing?: unknown;
  morning_done?: unknown;
  evening_done?: unknown;
  stress_level?: unknown;
  agency_score?: unknown;
  comfort_zone_done?: unknown;
  deep_work_minutes?: unknown;
  avoidance_trigger?: unknown;
  private_victories?: unknown;
  notes?: unknown;
}

export interface DailyLog {
  id: string;
  cycle_id: string;
  date: string;
  one_thing: string;
  morning_done: number;
  evening_done: number;
  stress_level: number | null;
  agency_score: number | null;
  comfort_zone_done: number;
  deep_work_minutes: number | null;
  avoidance_trigger: string;
  private_victories: string;
  notes: string;
  created_at: string;
  updated_at: string;
}
