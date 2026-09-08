import { describe, expect, it } from "vitest";
import { mapBlockWithTitles } from "@/app/core/shapes";
import { getRemainingForCalendarDate } from "@/app/components/calendar-scheduling";

const row = {
  id: "block", tactic_id: "tactic", cycle_id: "cycle", week_number: 1,
  date: "2026-09-08", original_date: "2026-09-07",
  planned_value: 5, scheduled_value: 2,
  tactic_title: "Write", goal_title: "Publish", unit: "pages",
};

describe("calendar rollover boundary", () => {
  it("preserves the original budget and maps the carried amount separately", () => {
    const block = mapBlockWithTitles(row);
    expect(block).toMatchObject({
      date: "2026-09-08", originalDate: "2026-09-07",
      plannedValue: 5, scheduledValue: 2,
    });
    expect(getRemainingForCalendarDate({
      tacticId: "tactic", date: "2026-09-08", weekTarget: 10, blocks: [block],
    })).toBe(5);
  });

  it("falls back to stored plan fields for historical responses", () => {
    const { original_date, scheduled_value, ...historical } = row;
    void original_date;
    void scheduled_value;
    expect(mapBlockWithTitles(historical)).toMatchObject({
      originalDate: "2026-09-08", scheduledValue: 5,
    });
  });
});
