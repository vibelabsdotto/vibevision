import { describe, expect, it } from "vitest";

import {
  getTacticExecutionScore,
  getActualProgress,
  getTodayProgress,
  getPlannedWeeklyTarget,
  isDueToday,
  isWeekdayDate,
  resolveTacticPlan,
  statusFromScore,
  slugify,
  startOfIsoWeek,
  addDays,
  parseDate,
  formatPercent
} from "@/app/core";
import type { TacticPlan } from "@/app/core";

describe("scoring thresholds", () => {
  it("maps scores to statuses", () => {
    expect(statusFromScore(0.9)).toBe("on_track");
    expect(statusFromScore(0.85)).toBe("on_track");
    expect(statusFromScore(0.75)).toBe("warning");
    expect(statusFromScore(0.7)).toBe("warning");
    expect(statusFromScore(0.5)).toBe("off_track");
  });
});

describe("getTacticExecutionScore", () => {
  const plan: TacticPlan = { trackingType: "quantity", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 10, unit: "activities" };

  it("is proportional for quantity tactics with planned > 1", () => {
    expect(getTacticExecutionScore(plan, 10, 5)).toBe(0.5);
    expect(getTacticExecutionScore(plan, 10, 12)).toBe(1);
  });

  it("is binary for planned <= 1", () => {
    expect(getTacticExecutionScore({ ...plan, targetValue: 1 }, 1, 1)).toBe(1);
    expect(getTacticExecutionScore({ ...plan, targetValue: 1 }, 1, 0)).toBe(0);
  });

  it("is binary for once tactics regardless of overshoot", () => {
    const oncePlan: TacticPlan = { trackingType: "boolean", recurrenceType: "once", recurrenceCount: 1, targetValue: 1, unit: "done" };
    expect(getTacticExecutionScore(oncePlan, 1, 1)).toBe(1);
    expect(getTacticExecutionScore(oncePlan, 1, 0)).toBe(0);
  });

  it("rewards actual > 0 when planned <= 0", () => {
    expect(getTacticExecutionScore(plan, 0, 3)).toBe(1);
    expect(getTacticExecutionScore(plan, 0, 0)).toBe(0);
  });
});

describe("progress aggregation", () => {
  it("counts completed entries for boolean tactics", () => {
    const plan: TacticPlan = { trackingType: "boolean", recurrenceType: "daily", recurrenceCount: 1, targetValue: 1, unit: "done" };
    const entries = [
      { tacticId: "t1", date: "2026-04-20", value: 1, completed: true },
      { tacticId: "t1", date: "2026-04-21", value: 0, completed: true },
      { tacticId: "t1", date: "2026-04-22", value: 0, completed: false }
    ];
    expect(getActualProgress(plan, entries)).toBe(2);
  });

  it("sums values for quantity tactics", () => {
    const plan: TacticPlan = { trackingType: "quantity", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 10, unit: "count" };
    const entries = [
      { tacticId: "t1", date: "2026-04-20", value: 4, completed: false },
      { tacticId: "t1", date: "2026-04-22", value: 3, completed: false }
    ];
    expect(getActualProgress(plan, entries)).toBe(7);
  });

  it("filters today progress by date", () => {
    const plan: TacticPlan = { trackingType: "quantity", recurrenceType: "daily", recurrenceCount: 1, targetValue: 1, unit: "count" };
    const entries = [
      { tacticId: "t1", date: "2026-04-20", value: 2, completed: false },
      { tacticId: "t1", date: "2026-04-21", value: 5, completed: false }
    ];
    expect(getTodayProgress(plan, entries, "2026-04-21")).toBe(5);
    expect(getTodayProgress(plan, entries, "2026-04-25")).toBe(0);
  });
});

describe("weekly targets", () => {
  it("derives planned weekly targets from recurrence", () => {
    expect(getPlannedWeeklyTarget({ trackingType: "boolean", recurrenceType: "daily", recurrenceCount: 1, targetValue: 1, unit: "done" })).toBe(7);
    expect(getPlannedWeeklyTarget({ trackingType: "boolean", recurrenceType: "weekdays", recurrenceCount: 1, targetValue: 1, unit: "done" })).toBe(5);
    expect(getPlannedWeeklyTarget({ trackingType: "quantity", recurrenceType: "times_per_week", recurrenceCount: 3, targetValue: 2, unit: "count" })).toBe(6);
    expect(getPlannedWeeklyTarget({ trackingType: "boolean", recurrenceType: "once", recurrenceCount: 1, targetValue: 1, unit: "done" })).toBe(1);
  });
});

describe("due today", () => {
  const dailyPlan: TacticPlan = { trackingType: "boolean", recurrenceType: "daily", recurrenceCount: 1, targetValue: 1, unit: "done" };
  const weekdayPlan: TacticPlan = { trackingType: "boolean", recurrenceType: "weekdays", recurrenceCount: 1, targetValue: 1, unit: "done" };
  const weeklyPlan: TacticPlan = { trackingType: "boolean", recurrenceType: "times_per_week", recurrenceCount: 3, targetValue: 1, unit: "done" };

  it("daily is due until today's occurrence is done", () => {
    expect(isDueToday(dailyPlan, "2026-04-20", 5, 0, true)).toBe(true);
    expect(isDueToday(dailyPlan, "2026-04-20", 5, 1, true)).toBe(false);
    expect(isDueToday(dailyPlan, "2026-04-20", 0, 1, true)).toBe(false);
  });

  it("weekdays are not due on weekends", () => {
    // 2026-04-18 is a Saturday, 2026-04-19 a Sunday, 2026-04-20 a Monday
    expect(isWeekdayDate("2026-04-18")).toBe(false);
    expect(isWeekdayDate("2026-04-20")).toBe(true);
    expect(isDueToday(weekdayPlan, "2026-04-18", 5, 0, true)).toBe(false);
    expect(isDueToday(weekdayPlan, "2026-04-20", 5, 0, true)).toBe(true);
  });

  it("times_per_week boolean tactics are due while weekly remaining > 0", () => {
    expect(isDueToday(weeklyPlan, "2026-04-20", 2, 0, true)).toBe(true);
    expect(isDueToday(weeklyPlan, "2026-04-20", 0, 1, true)).toBe(false);
  });
});

describe("plan resolution (legacy types)", () => {
  it("resolves weekly_count", () => {
    const plan = resolveTacticPlan({
      startsWeek: null, endsWeek: null, active: true, type: "weekly_count",
      trackingType: "", recurrenceType: "", recurrenceCount: 1,
      targetValue: 0, targetPerWeek: 30, targetPerDay: null, unit: "activities"
    });
    expect(plan.trackingType).toBe("quantity");
    expect(plan.recurrenceType).toBe("times_per_week");
    expect(plan.targetValue).toBe(30);
  });

  it("resolves habit with target >= 7 to daily", () => {
    const plan = resolveTacticPlan({
      startsWeek: null, endsWeek: null, active: true, type: "habit",
      trackingType: "", recurrenceType: "", recurrenceCount: 1,
      targetValue: 0, targetPerWeek: 7, targetPerDay: null, unit: "done"
    });
    expect(plan.recurrenceType).toBe("daily");
  });

  it("resolves habit with target < 7 to times_per_week", () => {
    const plan = resolveTacticPlan({
      startsWeek: null, endsWeek: null, active: true, type: "habit",
      trackingType: "", recurrenceType: "", recurrenceCount: 1,
      targetValue: 0, targetPerWeek: 4, targetPerDay: null, unit: "done"
    });
    expect(plan.recurrenceType).toBe("times_per_week");
    expect(plan.recurrenceCount).toBe(4);
  });
});

describe("date utils", () => {
  it("startOfIsoWeek snaps to Monday", () => {
    // 2026-04-18 is a Saturday
    const monday = startOfIsoWeek(parseDate("2026-04-18"));
    expect(monday.toISOString().slice(0, 10)).toBe("2026-04-13");
  });

  it("addDays crosses month boundaries", () => {
    expect(addDays(parseDate("2026-04-30"), 1).toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("slugify", () => {
    expect(slugify("Just Live! 2026")).toBe("just-live-2026");
  });

  it("formatPercent rounds", () => {
    expect(formatPercent(0.456)).toBe("46%");
    expect(formatPercent(1)).toBe("100%");
  });
});