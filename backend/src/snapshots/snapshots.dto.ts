/** Raw list query params — plain interface so ValidationPipe passes them through. */
export interface SnapshotListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  cycle_id?: string;
  week_number?: string;
}

export interface SnapshotBody {
  cycle_id?: unknown;
  week_number?: unknown;
  snapshot_json?: unknown;
  captured_at?: unknown;
}

export interface Snapshot {
  id: string;
  cycle_id: string;
  week_number: number;
  snapshot_json: string;
  captured_at: string;
  created_at: string;
  updated_at: string;
}
