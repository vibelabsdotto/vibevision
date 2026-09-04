import { describe, expect, it } from "vitest";

import { getRemainingForCalendarDate } from "@/app/components/calendar-scheduling";

describe("calendar destination-week capacity", () => {
  const blocks = [
    { tacticId: "t1", date: "2026-04-13", plannedValue: 6 },
    { tacticId: "t1", date: "2026-04-15", plannedValue: 4 },
    { tacticId: "other", date: "2026-04-22", plannedValue: 99 },
    { tacticId: "t1", date: "2026-04-23", plannedValue: 3 }
  ];

  it("uses the drop date's week instead of the current calendar week", () => {
    expect(
      getRemainingForCalendarDate({ tacticId: "t1", date: "2026-04-15", weekTarget: 10, blocks })
    ).toBe(0);
    expect(
      getRemainingForCalendarDate({ tacticId: "t1", date: "2026-04-22", weekTarget: 10, blocks })
    ).toBe(7);
  });

  it("uses the destination week's explicit target override", () => {
    const cycleWeeks = [
      { weekNumber: 1, startDate: "2026-04-13", endDate: "2026-04-19" },
      { weekNumber: 2, startDate: "2026-04-20", endDate: "2026-04-26" }
    ];

    expect(
      getRemainingForCalendarDate({
        tacticId: "t1",
        date: "2026-04-22",
        weekTarget: 10,
        weekTargets: { 2: 5 },
        cycleWeeks,
        blocks
      })
    ).toBe(2);
    expect(
      getRemainingForCalendarDate({
        tacticId: "t1",
        date: "2026-04-22",
        weekTarget: 10,
        weekTargets: { 2: 15 },
        cycleWeeks,
        blocks: [{ tacticId: "t1", date: "2026-04-23", plannedValue: 12 }]
      })
    ).toBe(3);
  });

  it("normalizes decimal block sums", () => {
    expect(
      getRemainingForCalendarDate({
        tacticId: "t2",
        date: "2026-04-22",
        weekTarget: 0.3,
        blocks: [
          { tacticId: "t2", date: "2026-04-20", plannedValue: 0.1 },
          { tacticId: "t2", date: "2026-04-21", plannedValue: 0.2 }
        ]
      })
    ).toBe(0);
  });
});
