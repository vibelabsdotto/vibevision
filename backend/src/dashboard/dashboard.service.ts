import { Injectable } from '@nestjs/common';
import { toBool } from '../common/util';
import { DatabaseService } from '../database/database.service';
import { getWeekExecutionBlocks } from '../calendar/execution-blocks';
import { ScoresService, currentWeekNumber } from '../scores/scores.service';
import {
  buildTodayTactics,
  mergeTodayScoreRows,
  type TodayBlockRow,
  type TodayTacticProgress,
} from '../scoring/today';
import type { ScoreEntry, TacticWeekScore, WeekScore } from '../scoring/types';

export interface DashboardData {
  cycle: Record<string, unknown>;
  current_week: number;
  weeks: Array<Record<string, unknown>>;
  goals: Array<Record<string, unknown>>;
  score: WeekScore;
  tactics: Array<{ tactic: Record<string, unknown>; goal_title: string }>;
  days_left: number;
  today_summary: {
    relevant_count: number;
    completed_count: number;
    remaining_count: number;
    total_remaining: number;
  };
  today_tactics: TodayTacticProgress[];
  today_scheduled_blocks: Array<Record<string, unknown>>;
  recent_events: Array<{ id: string; type: string; created_at: string }>;
  reviews: Array<Record<string, unknown>>;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly database: DatabaseService,
    private readonly scores: ScoresService,
  ) {}

  getDashboard(
    userId: string,
    cycleIdParam?: string,
    asOfDate?: string,
  ): { dashboard: DashboardData | null } {
    const sqlite = this.database.sqlite;
    const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
    let cycle: Record<string, unknown> | undefined;
    if (cycleIdParam) {
      cycle = sqlite
        .prepare('select * from cycles where id = ? and user_id = ?')
        .get(cycleIdParam, userId) as Record<string, unknown> | undefined;
      if (!cycle) return { dashboard: null };
    } else {
      cycle = this.activeCycle(userId);
      if (!cycle) return { dashboard: null };
    }
    const cycleId = String(cycle.id);
    const weeks = this.scores.weeksOf(cycleId, userId);
    const currentWeek =
      currentWeekNumber(
        weeks.map((w) => ({
          week_number: w.week_number,
          start_date: w.start_date,
          end_date: w.end_date,
        })),
        asOf,
      ) ?? 1;

    const snapshot = this.scores.latestSnapshot(
      cycleId,
      userId,
      currentWeek,
    )?.snapshot;
    const goals = snapshot
      ? snapshot.goals.map((goal) => ({ ...goal, cycle_id: cycleId }))
      : (sqlite
          .prepare(
            'select * from goals where cycle_id = ? and user_id = ? order by sort_order asc',
          )
          .all(cycleId, userId) as Record<string, unknown>[]);
    const lags = snapshot
      ? snapshot.lag_indicators
      : (sqlite
          .prepare(
            `select l.* from lag_indicators l join goals g on g.id = l.goal_id where g.cycle_id = ? and g.user_id = ? and l.user_id = ?`,
          )
          .all(cycleId, userId, userId) as Record<string, unknown>[]);

    const score = this.scores.getWeekScore(userId, cycleId, currentWeek, {
      as_of_date: asOf,
    });

    const tactics: Array<{
      tactic: Record<string, unknown>;
      goal_title: string;
    }> = snapshot
      ? snapshot.tactics.map((tactic) => ({
          tactic: { ...tactic },
          goal_title:
            snapshot.goals.find((goal) => goal.id === tactic.goal_id)?.title ??
            'Unknown goal',
        }))
      : this.scores.tacticRows(cycleId, userId).map((row) => ({
          tactic: { ...row.tactic },
          goal_title: row.goal_title,
        }));

    const weekEntries: ScoreEntry[] = (
      sqlite
        .prepare(
          'select tactic_id, date, value, completed from tactic_entries where cycle_id = ? and user_id = ? and week_number = ?',
        )
        .all(cycleId, userId, currentWeek) as Array<{
        tactic_id: string;
        date: string;
        value: number;
        completed: number;
      }>
    ).map((row) => ({
      tactic_id: row.tactic_id,
      date: row.date ?? null,
      value: row.value,
      completed: toBool(row.completed),
    }));

    const executionBlocks = getWeekExecutionBlocks(
      sqlite,
      userId,
      cycleId,
      currentWeek,
      asOf,
    );
    const weekBlocks: TodayBlockRow[] = executionBlocks.map((row) => ({
      id: String(row.id),
      tactic_id: String(row.tactic_id),
      date: String(row.date),
      start_time: (row.start_time as string) ?? null,
      end_time: (row.end_time as string) ?? null,
      duration_minutes: (row.duration_minutes as number) ?? null,
      planned_value: row.scheduled_value,
      note: (row.note as string) ?? null,
    }));

    const today = asOf;
    const todayBlocks = weekBlocks.filter((block) => block.date === today);
    const todayScoreRows = mergeTodayScoreRows({
      score_rows: score.tactic_scores,
      tactic_rows: tactics.map((row) => ({
        tactic: {
          id: String(row.tactic.id),
          title: String(row.tactic.title),
          goal_id: String(row.tactic.goal_id),
          tracking_type: String(row.tactic.tracking_type),
          recurrence_type: String(row.tactic.recurrence_type),
          recurrence_count: Number(row.tactic.recurrence_count),
          target_value: Number(row.tactic.target_value),
          scoring_weight: Number(row.tactic.scoring_weight),
          unit: String(row.tactic.unit),
          execution_style: (row.tactic.execution_style as string) ?? null,
        },
        goal_title: row.goal_title,
      })),
      entries: weekEntries,
      today_blocks: todayBlocks,
      week_blocks: executionBlocks.map((block) => ({
        ...block,
        date: block.original_date,
      })),
      as_of_date: today,
    });
    const todayTactics = buildTodayTactics(
      todayScoreRows,
      weekEntries,
      today,
      todayBlocks,
    );
    const tacticMeta = new Map(
      todayScoreRows.map((item: TacticWeekScore) => [
        item.tactic_id,
        {
          tactic_title: item.tactic_title,
          goal_title: item.goal_title,
          unit: item.unit,
        },
      ]),
    );
    const todayScheduledBlocks = todayBlocks
      .map((block) => {
        const meta = tacticMeta.get(block.tactic_id);
        if (!meta) return null;
        return { ...block, ...meta };
      })
      .filter((block) => block !== null);

    const todaySummary = {
      relevant_count: todayTactics.length,
      completed_count: todayTactics.filter((tactic) => tactic.is_today_complete)
        .length,
      remaining_count: todayTactics.filter(
        (tactic) => !tactic.is_today_complete,
      ).length,
      total_remaining: todayTactics.reduce(
        (sum, tactic) => sum + tactic.today_remaining,
        0,
      ),
    };

    const todayNow = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    const endDate = new Date(`${String(cycle.end_date)}T00:00:00.000Z`);
    const daysLeft = Math.max(
      0,
      Math.floor((endDate.getTime() - todayNow.getTime()) / 86400000) + 1,
    );

    const reviews = sqlite
      .prepare(
        'select * from weekly_reviews where cycle_id = ? and user_id = ? order by week_number asc',
      )
      .all(cycleId, userId) as Record<string, unknown>[];
    const recentEvents = (
      sqlite
        .prepare(
          'select id, type, created_at from events where cycle_id = ? and user_id = ? order by created_at desc limit 10',
        )
        .all(cycleId, userId) as Array<{
        id: string;
        type: string;
        created_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      type: row.type,
      created_at: row.created_at,
    }));

    return {
      dashboard: {
        cycle,
        current_week: currentWeek,
        weeks,
        goals: goals.map((goal) => ({
          ...goal,
          lag_indicators: lags.filter(
            (lag) =>
              String(lag.goal_id) ===
              String((goal as Record<string, unknown>).id),
          ),
        })),
        score,
        tactics,
        days_left: daysLeft,
        today_summary: todaySummary,
        today_tactics: todayTactics,
        today_scheduled_blocks: todayScheduledBlocks,
        recent_events: recentEvents,
        reviews,
      },
    };
  }

  private activeCycle(userId: string): Record<string, unknown> | undefined {
    const sqlite = this.database.sqlite;
    const setting = sqlite
      .prepare(
        "select value from settings where key = 'active_cycle_id' and user_id = ?",
      )
      .get(userId) as { value: string } | undefined;
    if (setting?.value) {
      const row = sqlite
        .prepare('select * from cycles where id = ? and user_id = ?')
        .get(setting.value, userId) as Record<string, unknown> | undefined;
      if (row) return row;
    }
    return sqlite
      .prepare(
        "select * from cycles where status = 'active' and user_id = ? order by start_date desc limit 1",
      )
      .get(userId) as Record<string, unknown> | undefined;
  }
}
