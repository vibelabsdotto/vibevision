import { Injectable, NotFoundException } from '@nestjs/common';
import { str, toBool } from '../common/util';
import { DatabaseService } from '../database/database.service';
import { ScoresService } from '../scores/scores.service';
import type { TacticWeekScore, WeekScore } from '../scoring/types';

export interface WeekReportEntry {
  id: string;
  date: string | null;
  tactic_title: string;
  goal_title: string;
  value: number;
  completed: boolean;
  note: string | null;
}

export interface WeekReportBlock {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  tactic_title: string;
  goal_title: string;
  planned_value: number;
  note: string | null;
}

export interface WeekReport {
  cycle: Record<string, unknown>;
  week: { week_number: number; start_date: string; end_date: string };
  score: WeekScore;
  blocks: WeekReportBlock[];
  daily_logs: Array<Record<string, unknown>>;
  entries: WeekReportEntry[];
  review: Record<string, unknown> | null;
  highlights: {
    completed_tactics: TacticWeekScore[];
    off_track_tactics: TacticWeekScore[];
    carry_over_tactics: TacticWeekScore[];
    recurring_gaps: TacticWeekScore[];
    best_goal: WeekScore['goal_scores'][number] | null;
    weakest_goal: WeekScore['goal_scores'][number] | null;
  };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatValue(value: number, unit: string): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly scores: ScoresService,
  ) {}

  getWeekReport(cycleId: string, weekNumber: number): WeekReport {
    const sqlite = this.database.sqlite;
    const cycle = sqlite
      .prepare('select * from cycles where id = ?')
      .get(cycleId) as Record<string, unknown> | undefined;
    if (!cycle) throw new NotFoundException('not_found');
    const week = sqlite
      .prepare(
        'select * from cycle_weeks where cycle_id = ? and week_number = ?',
      )
      .get(cycleId, weekNumber) as Record<string, unknown> | undefined;
    if (!week) throw new NotFoundException('not_found');

    // Weekly reports are final reflections, not a live "through yesterday"
    // dashboard view: score against the full-week plan (include the end date).
    const score = this.scores.getWeekScore(cycleId, weekNumber, {
      as_of_date: String(week.end_date),
      include_as_of_date: true,
    });

    const blocks = (
      sqlite
        .prepare(
          `select b.*, t.title as tactic_title, t.unit as unit, g.title as goal_title
           from tactic_calendar_blocks b
           left join tactics t on t.id = b.tactic_id
           left join goals g on g.id = t.goal_id
           where b.cycle_id = ? and b.week_number = ? order by b.date asc, b.start_time asc, b.id asc`,
        )
        .all(cycleId, weekNumber) as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      date: str(row.date),
      start_time: str(row.start_time) || null,
      end_time: str(row.end_time) || null,
      tactic_title: str(row.tactic_title) || 'Unknown',
      goal_title: str(row.goal_title) || 'Unknown',
      planned_value: Number(row.planned_value),
      note: str(row.note) || null,
    }));

    const logs = sqlite
      .prepare(
        'select * from daily_logs where cycle_id = ? and date >= ? and date <= ? order by date asc',
      )
      .all(cycleId, String(week.start_date), String(week.end_date)) as Array<
      Record<string, unknown>
    >;

    const entries: WeekReportEntry[] = (
      sqlite
        .prepare(
          `select e.*, t.title as tactic_title, g.title as goal_title
           from tactic_entries e
           left join tactics t on t.id = e.tactic_id
           left join goals g on g.id = t.goal_id
           where e.cycle_id = ? and e.week_number = ? order by e.date asc, e.id asc`,
        )
        .all(cycleId, weekNumber) as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      date: row.date ? str(row.date) : null,
      tactic_title: str(row.tactic_title) || 'Unknown',
      goal_title: str(row.goal_title) || 'Unknown',
      value: Number(row.value),
      completed: toBool(row.completed),
      note: str(row.note) || null,
    }));

    const review =
      (sqlite
        .prepare(
          'select * from weekly_reviews where cycle_id = ? and week_number = ?',
        )
        .get(cycleId, weekNumber) as Record<string, unknown> | undefined) ??
      null;

    const offTrack = score.tactic_scores.filter(
      (tactic) => tactic.status !== 'on_track',
    );
    const completed = score.tactic_scores.filter((tactic) => tactic.score >= 1);
    return {
      cycle,
      week: {
        week_number: weekNumber,
        start_date: String(week.start_date),
        end_date: String(week.end_date),
      },
      score,
      blocks,
      daily_logs: logs,
      entries,
      review,
      highlights: {
        completed_tactics: completed,
        off_track_tactics: offTrack,
        carry_over_tactics: offTrack.filter(
          (tactic) => tactic.recurrence_type === 'once',
        ),
        recurring_gaps: offTrack.filter(
          (tactic) => tactic.recurrence_type !== 'once',
        ),
        best_goal:
          [...score.goal_scores].sort((a, b) => b.score - a.score)[0] ?? null,
        weakest_goal:
          [...score.goal_scores].sort((a, b) => a.score - b.score)[0] ?? null,
      },
    };
  }

  /** Port of core renderWeekReportMarkdown. */
  renderMarkdown(report: WeekReport): string {
    const review = report.review as Record<string, string | null> | null;
    const wins =
      review?.wins ??
      report.daily_logs
        .flatMap((log) => str(log.private_victories).split('\n'))
        .filter(Boolean)
        .join('\n');
    const lines = [
      `# ${String(report.cycle.title)} — Week ${report.week.week_number} Report`,
      '',
      `**Date range:** ${report.week.start_date} → ${report.week.end_date}`,
      `**Execution Score:** ${formatPercent(report.score.weekly_score)} (${report.score.status})`,
      '',
      '## Wochen-Ziele / Outcomes',
      '',
      review?.weekly_goals ?? '_Noch keine Wochen-Outcomes festgelegt._',
      '',
      '## Cycle Goal Scores',
      '',
      '| Goal | Score | Status |',
      '|---|---:|---:|',
      ...report.score.goal_scores.map(
        (goal) =>
          `| ${goal.goal_title} | ${formatPercent(goal.score)} | ${goal.status} |`,
      ),
      '',
      '## Tactic Execution',
      '',
      '| Tactic | Goal | Planned | Actual | Score | Status |',
      '|---|---|---:|---:|---:|---:|',
      ...report.score.tactic_scores.map(
        (tactic) =>
          `| ${tactic.tactic_title} | ${tactic.goal_title} | ${formatValue(tactic.planned, tactic.unit)} | ${formatValue(tactic.actual, tactic.unit)} | ${formatPercent(tactic.score)} | ${tactic.status} |`,
      ),
      '',
      '## Scheduled Blocks',
      '',
      ...report.blocks.map((block) => {
        const time =
          block.start_time && block.end_time
            ? ` ${block.start_time}–${block.end_time}`
            : '';
        return `- ${block.date}${time}: ${block.tactic_title} (${formatValue(block.planned_value, 'planned')})${block.note ? ` — ${block.note}` : ''}`;
      }),
      report.blocks.length ? '' : 'No scheduled blocks.',
      '',
      '## Größte Wins der Woche',
      '',
      wins || '_No wins captured yet._',
      '',
      '## Reflection',
      '',
      [
        review?.lessons,
        review?.next_week_adjustments,
        review?.misses,
        review?.avoidance_patterns,
      ]
        .filter(Boolean)
        .join('\n') || '_Reflection wird am Ende der Woche gemeinsam ergänzt._',
      '',
      '## Nicht vollständig erfüllt diese Woche',
      '',
      ...(report.highlights.recurring_gaps.length
        ? report.highlights.recurring_gaps.map(
            (tactic) =>
              `- ${tactic.tactic_title}: ${formatValue(tactic.actual, tactic.unit)} / ${formatValue(tactic.planned, tactic.unit)} (${formatPercent(tactic.score)})`,
          )
        : ['No recurring tactic gaps.']),
      '',
      '## Carry-over in nächste Woche',
      '',
      ...(report.highlights.carry_over_tactics.length
        ? report.highlights.carry_over_tactics.map(
            (tactic) =>
              `- ${tactic.tactic_title}: ${formatValue(tactic.actual, tactic.unit)} / ${formatValue(tactic.planned, tactic.unit)} (${formatPercent(tactic.score)})`,
          )
        : ['No one-time carry-over.']),
    ];
    return lines.join('\n');
  }
}
