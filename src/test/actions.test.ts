import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  todayRows: [] as Array<{
    tacticId: string;
    todayActual: number;
    todayTarget: number | null;
    executionStyle: "occurrence" | "volume";
  }>,
  executionStyle: "volume" as "occurrence" | "volume",
  addTacticCalendarBlock: vi.fn(),
  addTacticEntry: vi.fn(),
  undoLatestTacticEntry: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/app/lib/auth", () => ({ requireAuth: vi.fn().mockResolvedValue({ user: { id: "u1" } }) }));
vi.mock("@/app/core/dailyLogs", () => ({ evening: vi.fn(), morning: vi.fn() }));
vi.mock("@/app/core/tactics", () => ({
  addTacticEntry: mocks.addTacticEntry,
  completeTactic: vi.fn()
}));
vi.mock("@/app/core", () => ({
  addTacticCalendarBlock: mocks.addTacticCalendarBlock,
  amountsEqual: (left: number, right: number) => Math.abs(left - right) < 0.000001,
  deleteTacticCalendarBlock: vi.fn(),
  getActiveCycle: vi.fn().mockResolvedValue({ id: "c1" }),
  getCalendarBlock: vi.fn(),
  getDashboardData: vi.fn().mockImplementation(() =>
    Promise.resolve({ todayTactics: mocks.todayRows })
  ),
  getPlannedWeeklyTarget: vi.fn().mockReturnValue(10),
  getTactic: vi.fn().mockImplementation(() => Promise.resolve({
    id: "t1",
    goalId: "g1",
    trackingType: "duration",
    recurrenceType: "times_per_week",
    recurrenceCount: 1,
    targetValue: 10,
    unit: "hours",
    executionStyle: mocks.executionStyle,
    active: true,
    startsWeek: 1,
    endsWeek: 12
  })),
  getTacticStepDelta: ({ direction, todayActual, todayTarget }: {
    direction: "increase" | "decrease";
    todayActual: number;
    todayTarget: number;
  }) => {
    if (direction === "increase") return Math.max(Math.min(1, todayTarget - todayActual), 0);
    return -Math.max(Math.min(1, todayActual), 0);
  },
  listGoals: vi.fn().mockResolvedValue([{ id: "g1" }]),
  moveTacticCalendarBlock: vi.fn(),
  resolveExecutionStyle: vi.fn().mockImplementation(
    (_plan: unknown, tactic?: { executionStyle?: string }) => tactic?.executionStyle ?? "volume"
  ),
  resolveTacticPlan: vi.fn().mockReturnValue({
    trackingType: "duration",
    recurrenceType: "times_per_week",
    recurrenceCount: 1,
    targetValue: 10,
    unit: "hours"
  }),
  todayDateString: vi.fn().mockReturnValue("2026-04-15"),
  undoLatestTacticEntry: mocks.undoLatestTacticEntry
}));

import { addBlockAction, stepEntryAction } from "@/app/actions";

function form(delta: number) {
  const data = new FormData();
  data.set("tacticId", "t1");
  data.set("delta", String(delta));
  return data;
}

describe("stepEntryAction daily bounds", () => {
  beforeEach(() => {
    mocks.todayRows = [];
    mocks.executionStyle = "volume";
    mocks.addTacticCalendarBlock.mockReset();
    mocks.addTacticEntry.mockReset();
    mocks.undoLatestTacticEntry.mockReset();
    mocks.revalidatePath.mockReset();
  });

  it("rejects a tactic that is not relevant today", async () => {
    await expect(stepEntryAction(form(1))).rejects.toThrow("Tactic is not scheduled for today");
    expect(mocks.addTacticEntry).not.toHaveBeenCalled();
  });

  it("rejects increments after today's target is complete", async () => {
    mocks.todayRows = [{
      tacticId: "t1",
      todayActual: 2,
      todayTarget: 2,
      executionStyle: "volume"
    }];

    await expect(stepEntryAction(form(1))).rejects.toThrow("Tactic is already complete for today");
    expect(mocks.addTacticEntry).not.toHaveBeenCalled();
  });

  it("accepts only the exact fractional final increment", async () => {
    mocks.todayRows = [{
      tacticId: "t1",
      todayActual: 1,
      todayTarget: 1.5,
      executionStyle: "volume"
    }];

    await expect(stepEntryAction(form(1))).rejects.toThrow("Invalid delta for today's remaining target");
    await stepEntryAction(form(0.5));

    expect(mocks.addTacticEntry).toHaveBeenCalledTimes(1);
    expect(mocks.addTacticEntry).toHaveBeenCalledWith({
      tacticId: "t1",
      value: 0.5,
      date: "2026-04-15"
    });
  });

  it("honors the tactic's explicit occurrence style when adding a block", async () => {
    mocks.executionStyle = "occurrence";

    await expect(
      addBlockAction({ tacticId: "t1", date: "2026-04-15", plannedValue: 1.5 })
    ).rejects.toThrow("Occurrence block size must be a whole number");
    expect(mocks.addTacticCalendarBlock).not.toHaveBeenCalled();
  });
});
