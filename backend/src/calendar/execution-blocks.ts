import type Database from 'better-sqlite3';
import { normalizeAmount, toBool } from '../common/util';
import { getActualProgress } from '../scoring/week';
import type { ScoreEntry } from '../scoring/types';
import {
  resolveExecutionStyle,
  resolveTacticPlan,
  type PlanInput,
} from '../tactics/plan';

export interface ExecutionBlock {
  id: string;
  tactic_id: string;
  cycle_id: string;
  week_number: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  planned_value: number;
  note: string | null;
  tactic_title: string;
  goal_title: string;
  unit: string;
  original_date: string;
  scheduled_value: number;
}

/**
 * Read-only execution view. Keep the stored plan for scoring and capacity;
 * roll only unfinished work in the requested date's week. Progress pays off
 * blocks oldest-first, once per tactic, not once per block. Today's entries
 * never shrink today's target, so completion and undo stay stable.
 */
export function getWeekExecutionBlocks(
  sqlite: Database.Database,
  userId: string,
  cycleId: string,
  weekNumber: number,
  asOfDate: string,
  excludeEntryId?: string | null,
): ExecutionBlock[] {
  const week = sqlite
    .prepare(
      'select start_date, end_date from cycle_weeks where cycle_id = ? and week_number = ? and user_id = ?',
    )
    .get(cycleId, weekNumber, userId) as
    { start_date: string; end_date: string } | undefined;
  if (!week) return [];

  const rows = sqlite
    .prepare(
      `select b.*, t.title as tactic_title, g.title as goal_title,
            t.type, t.tracking_type, t.recurrence_type, t.recurrence_count,
            t.target_value, t.target_per_week, t.target_per_day, t.execution_style, t.unit
     from tactic_calendar_blocks b
     join tactics t on t.id = b.tactic_id and t.user_id = b.user_id
     join goals g on g.id = t.goal_id and g.user_id = b.user_id and g.cycle_id = b.cycle_id
     where b.cycle_id = ? and b.week_number = ? and b.user_id = ?
     order by b.date asc, b.start_time asc, b.id asc`,
    )
    .all(cycleId, weekNumber, userId) as Array<
    Omit<ExecutionBlock, 'original_date' | 'scheduled_value'> & PlanInput
  >;
  const entries: ScoreEntry[] = (
    sqlite
      .prepare(
        `select tactic_id, date, value, completed from tactic_entries
     where cycle_id = ? and week_number = ? and user_id = ?
       and (date is null or (date >= ? and date <= ?))
       ${excludeEntryId ? 'and id != ?' : ''}`,
      )
      .all(
        cycleId,
        weekNumber,
        userId,
        week.start_date,
        asOfDate,
        ...(excludeEntryId ? [excludeEntryId] : []),
      ) as Array<{
      tactic_id: string;
      date: string | null;
      value: number;
      completed: number;
    }>
  ).map((entry) => ({ ...entry, completed: toBool(entry.completed) }));

  const byTactic = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = byTactic.get(row.tactic_id) ?? [];
    group.push(row);
    byTactic.set(row.tactic_id, group);
  }
  const result: ExecutionBlock[] = [];
  const inWeek = asOfDate >= week.start_date && asOfDate <= week.end_date;
  for (const tacticBlocks of byTactic.values()) {
    const first = tacticBlocks[0];
    const plan = resolveTacticPlan(first);
    const style = resolveExecutionStyle(plan, first);
    const tacticEntries = entries.filter(
      (entry) => entry.tactic_id === first.tactic_id,
    );
    const entryDates = [
      ...new Set(tacticEntries.map((entry) => entry.date ?? week.start_date)),
    ].sort();
    const progressBefore = (date: string) =>
      normalizeAmount(
        getActualProgress(
          plan,
          tacticEntries.filter(
            (entry) => (entry.date ?? week.start_date) < date,
          ),
          style,
        ),
      );
    const priorProgress = progressBefore(asOfDate);
    let allocated = 0;
    for (const row of tacticBlocks) {
      const planned = normalizeAmount(row.planned_value);
      const threshold = normalizeAmount(allocated + planned);
      let date = row.date;
      let scheduledValue = planned;
      if (inWeek && style !== 'toggle') {
        if (row.date < asOfDate) {
          if (priorProgress < threshold) {
            date = asOfDate;
          } else {
            // A completed rolled block stays on its completion day, not back
            // on the missed day. Corrections can reopen it on a later day.
            let completedOn: string | null = null;
            for (const entryDate of entryDates.filter(
              (value) => value < asOfDate,
            )) {
              const actual = normalizeAmount(
                getActualProgress(
                  plan,
                  tacticEntries.filter(
                    (entry) => (entry.date ?? week.start_date) <= entryDate,
                  ),
                  style,
                ),
              );
              completedOn =
                actual >= threshold ? (completedOn ?? entryDate) : null;
            }
            if (completedOn && completedOn > date) date = completedOn;
          }
        }
        const creditedBeforeDay = Math.min(
          planned,
          Math.max(progressBefore(date) - allocated, 0),
        );
        scheduledValue = normalizeAmount(planned - creditedBeforeDay);
      }
      result.push({
        id: row.id,
        tactic_id: row.tactic_id,
        cycle_id: row.cycle_id,
        week_number: row.week_number,
        date,
        start_time: row.start_time,
        end_time: row.end_time,
        duration_minutes: row.duration_minutes,
        planned_value: planned,
        note: row.note,
        tactic_title: row.tactic_title,
        goal_title: row.goal_title,
        unit: row.unit,
        original_date: row.date,
        scheduled_value: scheduledValue,
      });
      allocated = threshold;
    }
  }
  return result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
      a.original_date.localeCompare(b.original_date) ||
      a.id.localeCompare(b.id),
  );
}
