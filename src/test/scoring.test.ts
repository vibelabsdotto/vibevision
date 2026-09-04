import { describe, expect, it } from "vitest";

import {
  buildTodayTactics,
  getTacticExecutionScore,
  getActualProgress,
  getTodayProgress,
  getPlannedWeeklyTarget,
  getPlannedTargetForDate,
  isDueToday,
  isWeekdayDate,
  resolveExecutionStyle,
  resolveScheduledStatus,
  resolveTacticEntryValue,
  resolveTacticPlan,
  statusFromScore,
  slugify,
  startOfIsoWeek,
  addDays,
  parseDate,
  formatAmount,
  formatPercent,
  getTacticStepDelta
} from "@/app/core";
import type { TacticPlan, TacticWeekScore } from "@/app/core";
import * as Core from "@/app/core";

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

  it("aggregates same-day boolean entries when occurrence is explicit", () => {
    const plan: TacticPlan = {
      trackingType: "boolean",
      recurrenceType: "daily",
      recurrenceCount: 1,
      targetValue: 1,
      unit: "done"
    };
    const entries = [
      { tacticId: "t1", date: "2026-04-21", value: 1, completed: true },
      { tacticId: "t1", date: "2026-04-21", value: 1, completed: true }
    ];

    expect(getActualProgress(plan, entries, "occurrence")).toBe(2);
    expect(getTodayProgress(plan, entries, "2026-04-21", "occurrence")).toBe(2);
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

describe("calendar scheduling progress", () => {
  const calendarCore = Core as unknown as {
    getSchedulingProgress?: (
      plan: TacticPlan,
      blocks: Array<{ plannedValue: number }>,
      weeklyTargetOverride?: number
    ) => { weekTarget: number; scheduled: number; remaining: number };
    resolveCalendarBlockValue?: (
      plan: TacticPlan,
      blocks: Array<{ plannedValue: number }>,
      requestedValue: number,
      executionStyle?: "toggle" | "occurrence" | "volume",
      weeklyTargetOverride?: number
    ) => number;
  };
  const getSchedulingProgress = calendarCore.getSchedulingProgress;
  const resolveCalendarBlockValue = calendarCore.resolveCalendarBlockValue;

  it("exposes scheduling progress as scheduled units, not block count", () => {
    expect(getSchedulingProgress).toBeTypeOf("function");
  });

  it("rejects a block that would exceed the remaining weekly target", () => {
    expect(resolveCalendarBlockValue).toBeTypeOf("function");
    if (!resolveCalendarBlockValue) return;
    const plan: TacticPlan = {
      trackingType: "duration",
      recurrenceType: "times_per_week",
      recurrenceCount: 1,
      targetValue: 10,
      unit: "hours"
    };

    expect(() => resolveCalendarBlockValue(plan, [{ plannedValue: 8 }], 3)).toThrow(
      "Only 2 hours remain to schedule this week"
    );
    expect(resolveCalendarBlockValue(plan, [{ plannedValue: 8 }], 2)).toBe(2);
  });

  it("sums custom block values against the weekly target", () => {
    if (!getSchedulingProgress) return;
    const plan: TacticPlan = {
      trackingType: "duration",
      recurrenceType: "times_per_week",
      recurrenceCount: 1,
      targetValue: 10,
      unit: "hours"
    };

    expect(getSchedulingProgress(plan, [{ plannedValue: 2 }, { plannedValue: 2 }])).toEqual({
      weekTarget: 10,
      scheduled: 4,
      remaining: 6
    });
  });

  it("uses an explicit weekly target override for scheduling progress", () => {
    if (!getSchedulingProgress || !resolveCalendarBlockValue) return;
    const plan: TacticPlan = {
      trackingType: "duration",
      recurrenceType: "times_per_week",
      recurrenceCount: 1,
      targetValue: 10,
      unit: "hours"
    };

    expect(getSchedulingProgress(plan, [{ plannedValue: 3 }], 5)).toEqual({
      weekTarget: 5,
      scheduled: 3,
      remaining: 2
    });
    expect(() => resolveCalendarBlockValue(plan, [{ plannedValue: 3 }], 3, "volume", 5)).toThrow(
      "Only 2 hours remain to schedule this week"
    );
  });

  it("accepts an exact decimal allocation without floating-point drift", () => {
    if (!getSchedulingProgress || !resolveCalendarBlockValue) return;
    const plan: TacticPlan = {
      trackingType: "duration",
      recurrenceType: "times_per_week",
      recurrenceCount: 1,
      targetValue: 0.3,
      unit: "hours"
    };

    expect(resolveCalendarBlockValue(plan, [{ plannedValue: 0.1 }], 0.2, "volume")).toBe(0.2);
    expect(getSchedulingProgress(plan, [{ plannedValue: 0.1 }, { plannedValue: 0.2 }])).toEqual({
      weekTarget: 0.3,
      scheduled: 0.3,
      remaining: 0
    });
  });

  it("honors an explicit occurrence style when validating block values", () => {
    if (!resolveCalendarBlockValue) return;
    const plan: TacticPlan = {
      trackingType: "quantity",
      recurrenceType: "times_per_week",
      recurrenceCount: 1,
      targetValue: 5,
      unit: "posts"
    };

    expect(() => resolveCalendarBlockValue(plan, [], 1.5, "occurrence")).toThrow(
      "Occurrence block size must be a whole number"
    );
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

  it("formatAmount preserves meaningful decimal precision", () => {
    expect(formatAmount(0.5)).toBe("0.5");
    expect(formatAmount(2.25)).toBe("2.25");
    expect(formatAmount(1.0000000001)).toBe("1");
  });
});

describe("today tactic step bounds", () => {
  it("stops incrementing at today's target", () => {
    expect(getTacticStepDelta({ direction: "increase", todayActual: 1, todayTarget: 2 })).toBe(1);
    expect(getTacticStepDelta({ direction: "increase", todayActual: 2, todayTarget: 2 })).toBe(0);
  });

  it("uses the exact fractional remainder for the final increment", () => {
    expect(getTacticStepDelta({ direction: "increase", todayActual: 1, todayTarget: 1.5 })).toBe(0.5);
    expect(getTacticStepDelta({ direction: "decrease", todayActual: 0.5, todayTarget: 1.5 })).toBe(-0.5);
  });
});

describe("resolveExecutionStyle", () => {
  it("derives toggle for boolean daily/weekdays", () => {
    expect(
      resolveExecutionStyle({ trackingType: "boolean", recurrenceType: "daily", recurrenceCount: 1, targetValue: 1, unit: "done" })
    ).toBe("toggle");
    expect(
      resolveExecutionStyle({ trackingType: "boolean", recurrenceType: "weekdays", recurrenceCount: 1, targetValue: 1, unit: "done" })
    ).toBe("toggle");
  });

  it("derives occurrence for boolean times_per_week/once", () => {
    expect(
      resolveExecutionStyle({ trackingType: "boolean", recurrenceType: "times_per_week", recurrenceCount: 3, targetValue: 1, unit: "done" })
    ).toBe("occurrence");
    expect(
      resolveExecutionStyle({ trackingType: "boolean", recurrenceType: "once", recurrenceCount: 1, targetValue: 1, unit: "done" })
    ).toBe("occurrence");
  });

  it("derives volume for quantity/duration", () => {
    expect(
      resolveExecutionStyle({ trackingType: "quantity", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 7, unit: "posts" })
    ).toBe("volume");
    expect(
      resolveExecutionStyle({ trackingType: "duration", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 5, unit: "hours" })
    ).toBe("volume");
  });

  it("explicit valid style wins", () => {
    const plan: TacticPlan = { trackingType: "quantity", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 7, unit: "posts" };
    expect(resolveExecutionStyle(plan, { executionStyle: "occurrence", trackingType: "quantity" })).toBe("occurrence");
  });

  it("contradiction throws on write, derives on read", () => {
    const plan: TacticPlan = { trackingType: "quantity", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 7, unit: "posts" };
    expect(() => resolveExecutionStyle(plan, { executionStyle: "toggle", trackingType: "quantity" }, { strict: true })).toThrow();
    expect(resolveExecutionStyle(plan, { executionStyle: "toggle", trackingType: "quantity" })).toBe("volume");
  });
});

describe("toggle idempotency", () => {
  it("two completes on the same day count once", () => {
    const plan: TacticPlan = { trackingType: "boolean", recurrenceType: "daily", recurrenceCount: 1, targetValue: 1, unit: "done" };
    const entries = [
      { tacticId: "t1", date: "2026-04-20", value: 1, completed: true },
      { tacticId: "t1", date: "2026-04-20", value: 1, completed: true }
    ];
    expect(getActualProgress(plan, entries)).toBe(1);
    expect(getTodayProgress(plan, entries, "2026-04-20")).toBe(1);
  });
});

describe("occurrence counting", () => {
  const plan: TacticPlan = { trackingType: "boolean", recurrenceType: "times_per_week", recurrenceCount: 7, targetValue: 1, unit: "posts" };

  it("seven +1 entries score 1.0 with no fractions", () => {
    const entries = Array.from({ length: 7 }, (_, i) => ({
      tacticId: "t1",
      date: `2026-04-${String(13 + i).padStart(2, "0")}`,
      value: 1,
      completed: false
    }));
    const actual = getActualProgress(plan, entries);
    expect(actual).toBe(7);
    expect(Number.isInteger(actual)).toBe(true);
    expect(getTacticExecutionScore(plan, 7, actual)).toBe(1);
  });
});

describe("floor pace", () => {
  // Week Mon 2026-04-13 → Sun 2026-04-19, cutoff Wed 2026-04-15 (3 elapsed days)
  it("occurrence uses floor(N * elapsed/7)", () => {
    const plan: TacticPlan = { trackingType: "boolean", recurrenceType: "times_per_week", recurrenceCount: 3, targetValue: 1, unit: "done" };
    expect(
      getPlannedTargetForDate({
        plan,
        fullWeekPlanned: 3,
        blocks: [],
        weekStartDate: "2026-04-13",
        weekEndDate: "2026-04-19",
        scoringCutoffDate: "2026-04-15"
      })
    ).toBe(1);
  });

  it("volume keeps the exact prorata pace", () => {
    const plan: TacticPlan = { trackingType: "quantity", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 10, unit: "count" };
    expect(
      getPlannedTargetForDate({
        plan,
        fullWeekPlanned: 10,
        blocks: [],
        weekStartDate: "2026-04-13",
        weekEndDate: "2026-04-19",
        scoringCutoffDate: "2026-04-15"
      })
    ).toBeCloseTo((10 * 3) / 7, 10);
  });

  it("uses floor pace when a quantity tactic explicitly uses occurrence", () => {
    const plan: TacticPlan = {
      trackingType: "quantity",
      recurrenceType: "times_per_week",
      recurrenceCount: 1,
      targetValue: 10,
      unit: "count"
    };

    expect(
      getPlannedTargetForDate({
        plan,
        executionStyle: "occurrence",
        fullWeekPlanned: 10,
        blocks: [],
        weekStartDate: "2026-04-13",
        weekEndDate: "2026-04-19",
        scoringCutoffDate: "2026-04-15"
      })
    ).toBe(4);
  });
});

describe("entry guards", () => {
  const occurrencePlan: TacticPlan = { trackingType: "boolean", recurrenceType: "times_per_week", recurrenceCount: 7, targetValue: 1, unit: "posts" };
  const quantityPlan: TacticPlan = { trackingType: "quantity", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 7, unit: "posts" };
  const durationPlan: TacticPlan = { trackingType: "duration", recurrenceType: "times_per_week", recurrenceCount: 1, targetValue: 5, unit: "hours" };

  it("occurrence needs positive whole values", () => {
    expect(resolveTacticEntryValue(occurrencePlan, "occurrence", 2)).toBe(2);
    expect(resolveTacticEntryValue(occurrencePlan, "occurrence", undefined)).toBe(1);
    expect(() => resolveTacticEntryValue(occurrencePlan, "occurrence", 1.5)).toThrow();
    expect(() => resolveTacticEntryValue(occurrencePlan, "occurrence", 0)).toThrow();
    expect(() => resolveTacticEntryValue(occurrencePlan, "occurrence", -1)).toThrow();
  });

  it("quantity defaults to 1", () => {
    expect(resolveTacticEntryValue(quantityPlan, "volume", undefined)).toBe(1);
    expect(resolveTacticEntryValue(quantityPlan, "volume", 3)).toBe(3);
  });

  it("duration requires a value", () => {
    expect(() => resolveTacticEntryValue(durationPlan, "volume", undefined)).toThrow();
    expect(resolveTacticEntryValue(durationPlan, "volume", 30)).toBe(30);
  });
});

describe("scheduled today tactics", () => {
  const occurrenceRow: TacticWeekScore = {
    tacticId: "t1",
    tacticTitle: "Publish posts",
    goalId: "g1",
    goalTitle: "Audience",
    planned: 0,
    fullWeekPlanned: 5,
    actual: 0,
    score: 0,
    weight: 1,
    status: "off_track",
    unit: "posts",
    trackingType: "boolean",
    recurrenceType: "times_per_week",
    recurrenceCount: 5,
    targetValue: 1,
    executionStyle: "occurrence"
  };
  const durationRow: TacticWeekScore = {
    ...occurrenceRow,
    tacticId: "t2",
    tacticTitle: "Bulk Up development",
    planned: 0,
    fullWeekPlanned: 10,
    unit: "hours",
    trackingType: "duration",
    recurrenceType: "times_per_week",
    recurrenceCount: 1,
    targetValue: 10,
    executionStyle: "volume"
  };
  const block = (id: string, tacticId: string, date: string, plannedValue: number) => ({
    id,
    tacticId,
    date,
    startTime: null,
    endTime: null,
    durationMinutes: null,
    plannedValue,
    note: null
  });

  it("does not surface unscheduled flexible tactics", () => {
    expect(buildTodayTactics([occurrenceRow, durationRow], [], "2026-04-15", [], [])).toEqual([]);
  });

  it("uses the sum of today's scheduled occurrence blocks as today's target", () => {
    const todayBlocks = [block("b1", "t1", "2026-04-15", 1), block("b2", "t1", "2026-04-15", 1)];
    const entries = [{ tacticId: "t1", date: "2026-04-15", value: 1, completed: true }];
    const rows = buildTodayTactics([occurrenceRow], entries, "2026-04-15", todayBlocks, todayBlocks);

    expect(rows).toHaveLength(1);
    expect(rows[0].todayKind).toBe("scheduled");
    expect(rows[0].todayTarget).toBe(2);
    expect(rows[0].todayActual).toBe(1);
    expect(rows[0].todayRemaining).toBe(1);
    expect(rows[0].todayLabel).toBe("2 posts scheduled");
    expect(rows[0].isTodayComplete).toBe(false);
  });

  it("uses explicit occurrence semantics for a boolean daily tactic", () => {
    const explicitOccurrence: TacticWeekScore = {
      ...occurrenceRow,
      tacticId: "daily-occurrence",
      fullWeekPlanned: 7,
      trackingType: "boolean",
      recurrenceType: "daily",
      recurrenceCount: 1,
      targetValue: 1,
      executionStyle: "occurrence"
    };
    const todayBlocks = [block("b1", "daily-occurrence", "2026-04-15", 2)];
    const entries = [
      { tacticId: "daily-occurrence", date: "2026-04-15", value: 1, completed: true },
      { tacticId: "daily-occurrence", date: "2026-04-15", value: 1, completed: true }
    ];

    const rows = buildTodayTactics([explicitOccurrence], entries, "2026-04-15", todayBlocks, todayBlocks);

    expect(rows[0].todayActual).toBe(2);
    expect(rows[0].todayRemaining).toBe(0);
    expect(rows[0].isTodayComplete).toBe(true);
  });

  it("uses a custom duration block instead of the full weekly tactic target", () => {
    const todayBlock = block("b1", "t2", "2026-04-15", 2);
    const weekBlocks = [
      todayBlock,
      block("b2", "t2", "2026-04-16", 2),
      block("b3", "t2", "2026-04-17", 2),
      block("b4", "t2", "2026-04-18", 2),
      block("b5", "t2", "2026-04-19", 2)
    ];
    const rows = buildTodayTactics([durationRow], [], "2026-04-15", [todayBlock], weekBlocks);

    expect(rows).toHaveLength(1);
    expect(rows[0].todayTarget).toBe(2);
    expect(rows[0].todayRemaining).toBe(2);
    expect(rows[0].weekTarget).toBe(10);
    expect(rows[0].todayLabel).toBe("2 hours scheduled");
  });

  it("keeps a completed scheduled block visible for the day", () => {
    const todayBlock = block("b1", "t2", "2026-04-15", 2);
    const entries = [
      { tacticId: "t2", date: "2026-04-15", value: 1, completed: false },
      { tacticId: "t2", date: "2026-04-15", value: 1, completed: false }
    ];
    const rows = buildTodayTactics([{ ...durationRow, actual: 2 }], entries, "2026-04-15", [todayBlock], [todayBlock]);

    expect(rows).toHaveLength(1);
    expect(rows[0].dueToday).toBe(false);
    expect(rows[0].isTodayComplete).toBe(true);
    expect(rows[0].todayRemaining).toBe(0);
  });

  it("does not show weekday toggles on weekends", () => {
    const weekdayToggle: TacticWeekScore = {
      ...occurrenceRow,
      tacticId: "toggle-weekday",
      fullWeekPlanned: 5,
      planned: 5,
      trackingType: "boolean",
      recurrenceType: "weekdays",
      recurrenceCount: 1,
      targetValue: 1,
      executionStyle: "toggle"
    };

    expect(buildTodayTactics([weekdayToggle], [], "2026-04-18", [], [])).toEqual([]);
  });

  it("keeps completed recurring volume tactics visible on their recurrence day", () => {
    const dailyVolume: TacticWeekScore = {
      ...durationRow,
      tacticId: "daily-volume",
      planned: 2,
      fullWeekPlanned: 14,
      actual: 2,
      recurrenceType: "daily",
      targetValue: 2,
      executionStyle: "volume"
    };
    const entries = [{ tacticId: "daily-volume", date: "2026-04-15", value: 2, completed: false }];
    const rows = buildTodayTactics([dailyVolume], entries, "2026-04-15", [], []);

    expect(rows).toHaveLength(1);
    expect(rows[0].todayKind).toBe("recurring");
    expect(rows[0].todayTarget).toBe(2);
    expect(rows[0].isTodayComplete).toBe(true);
  });
});
describe("resolveScheduledStatus", () => {
  const base = {
    style: "occurrence" as const,
    fullWeekPlanned: 3,
    planned: 1,
    actual: 0,
    scheduledDates: [] as string[],
    asOfDate: "2026-09-03"
  };
  it("returns null when nothing is scheduled", () => {
    expect(resolveScheduledStatus(base)).toBeNull();
  });
  it("returns coming when untouched and everything is in the future", () => {
    expect(resolveScheduledStatus({ ...base, scheduledDates: ["2026-09-04", "2026-09-05"] })).toBe("coming");
  });
  it("returns null once the pool is full", () => {
    expect(resolveScheduledStatus({ ...base, actual: 3, scheduledDates: ["2026-09-04"] })).toBeNull();
  });
  it("compares actual vs due-by-now for occurrence", () => {
    expect(
      resolveScheduledStatus({ ...base, scheduledDates: ["2026-09-01", "2026-09-03", "2026-09-05"] })
    ).toBe("off_track");
    expect(
      resolveScheduledStatus({ ...base, actual: 2, scheduledDates: ["2026-09-01", "2026-09-03", "2026-09-05"] })
    ).toBe("on_track");
    expect(
      resolveScheduledStatus({ ...base, actual: 1, scheduledDates: ["2026-09-01", "2026-09-03", "2026-09-05"] })
    ).toBe("warning");
  });
  it("uses scheduled values rather than block count for occurrence status", () => {
    const input = {
      ...base,
      actual: 1,
      scheduledDates: ["2026-09-01"],
      scheduledBlocks: [{ date: "2026-09-01", plannedValue: 3 }]
    } as Parameters<typeof resolveScheduledStatus>[0] & {
      scheduledBlocks: Array<{ date: string; plannedValue: number }>;
    };

    expect(resolveScheduledStatus(input)).toBe("warning");
  });
  it("keeps volume on its score status (null) past the coming check", () => {
    expect(
      resolveScheduledStatus({ ...base, style: "volume", scheduledDates: ["2026-09-01"] })
    ).toBeNull();
    expect(
      resolveScheduledStatus({ ...base, style: "volume", scheduledDates: ["2026-09-05"] })
    ).toBe("coming");
  });
  it("marks toggles coming when their day is still ahead", () => {
    expect(
      resolveScheduledStatus({ ...base, style: "toggle", planned: 1, scheduledDates: ["2026-09-05"] })
    ).toBe("coming");
  });
});
