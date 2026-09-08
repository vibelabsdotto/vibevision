import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveCycle: vi.fn(),
  getCycleWeeks: vi.fn(),
  listCalendarBlocksForRange: vi.fn(),
  listSchedulingState: vi.fn()
}));

vi.mock("@/app/core", async () => ({
  ...(await import("@/app/lib/format")),
  ...mocks
}));
vi.mock("@/app/lib/auth", () => ({ requireAuth: vi.fn().mockResolvedValue({ user: { id: "u1" } }) }));
vi.mock("@/app/actions", () => ({ addBlockAction: vi.fn(), deleteBlockAction: vi.fn(), moveBlockAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import CalendarPage from "@/app/calendar/page";
import { addDays, parseDate, toDateString } from "@/app/lib/format";

const cycle = { id: "c1", title: "Autumn cycle", startDate: "2026-08-31", endDate: "2026-11-22" };
const cycleWeeks = Array.from({ length: 12 }, (_, index) => ({
  weekNumber: index + 1,
  startDate: toDateString(addDays(parseDate(cycle.startDate), index * 7)),
  endDate: toDateString(addDays(parseDate(cycle.startDate), index * 7 + 6))
}));

function tactic(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, title: id, goalTitle: "Goal", trackingType: "number", executionStyle: "volume",
    unit: "units", baseWeekTarget: 10, weekTargets: { 2: 4 }, weekTarget: 4,
    ...overrides
  };
}

async function renderPage(month?: string | string[]) {
  // A legacy URL may still carry query parameters, but the page must ignore them.
  return renderToStaticMarkup(await Reflect.apply(CalendarPage, undefined, [{
    searchParams: Promise.resolve({ month })
  }]));
}

function renderedDays(html: string) {
  return [...html.matchAll(/aria-label="Schedule for ([^"]+)"/g)].map((match) => match[1]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
  mocks.getActiveCycle.mockReset().mockResolvedValue(cycle);
  mocks.getCycleWeeks.mockReset().mockResolvedValue(cycleWeeks);
  mocks.listCalendarBlocksForRange.mockReset().mockResolvedValue([]);
  mocks.listSchedulingState.mockReset().mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe("CalendarPage current week", () => {
  it("renders only Monday through Sunday and fetches that same range", async () => {
    const html = await renderPage();
    expect(renderedDays(html)).toEqual([
      "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"
    ]);
    expect(mocks.listCalendarBlocksForRange.mock.calls.map((args) => args.slice(0, 3)))
      .toEqual([["c1", "2026-09-07", "2026-09-13"]]);
    expect(mocks.listSchedulingState.mock.calls.map((args) => args.slice(0, 3)))
      .toEqual([["c1", "2026-09-07", "2026-09-13"]]);
    expect(html).toContain("Week 2 of 12");
  });

  it.each([
    { month: "2026-11" },
    { month: "2025-01" },
    { month: "invalid" },
    { month: ["2026-10", "2026-11"] }
  ])(
    "ignores the legacy month query $month", async ({ month }) => {
      const html = await renderPage(month);
      expect(renderedDays(html)).toHaveLength(7);
      expect(renderedDays(html)[0]).toBe("2026-09-07");
      expect(html).toContain("Week 2 of 12");
      expect(html).not.toMatch(/month=|Month view|Previous month|Next month|Prev week|Next week|Calendar view/);
    }
  );

  it("uses the matching cycleWeeks number rather than a calculated or clamped week", async () => {
    mocks.getCycleWeeks.mockResolvedValue([{ weekNumber: 7, startDate: "2026-09-07", endDate: "2026-09-13" }]);
    expect(await renderPage()).toContain("Week 7 of 12");
  });

  it.each([
    ["2026-08-30", "2026-08-24", "2026-08-30"],
    ["2026-11-23", "2026-11-23", "2026-11-29"]
  ])("keeps the actual week outside the cycle on %s without fetching unrelated data", async (today, start, end) => {
    vi.setSystemTime(new Date(`${today}T12:00:00.000Z`));
    const html = await renderPage("2026-09");
    const days = renderedDays(html);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe(start);
    expect(days[6]).toBe(end);
    expect(html).toContain("No current cycle week");
    expect(html).not.toMatch(/Week \d+ of 12/);
    expect(mocks.listCalendarBlocksForRange).not.toHaveBeenCalled();
    expect(mocks.listSchedulingState).not.toHaveBeenCalled();
  });

  it("does not substitute another cycle week when cycleWeeks has no match", async () => {
    mocks.getCycleWeeks.mockResolvedValue(cycleWeeks.filter((week) => week.weekNumber !== 2));
    const html = await renderPage();
    expect(renderedDays(html)[0]).toBe("2026-09-07");
    expect(html).toContain("No current cycle week");
    expect(mocks.listCalendarBlocksForRange).not.toHaveBeenCalled();
    expect(mocks.listSchedulingState).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-08-31", 1],
    ["2026-11-22", 12]
  ])("includes the cycle boundary date %s in week %i", async (today, week) => {
    vi.setSystemTime(new Date(`${today}T12:00:00.000Z`));
    expect(await renderPage()).toContain(`Week ${week} of 12`);
    expect(mocks.listCalendarBlocksForRange).toHaveBeenCalledTimes(1);
    expect(mocks.listSchedulingState).toHaveBeenCalledTimes(1);
  });

  it("renders only this week's positive-target non-toggle tactics", async () => {
    mocks.listSchedulingState.mockResolvedValue([
      tactic("Due this week"),
      tactic("Occurrence this week", { executionStyle: "occurrence" }),
      tactic("Inactive this week", { weekTarget: 0, weekTargets: { 2: 0 } }),
      tactic("Negative target", { weekTarget: -1 }),
      tactic("Toggle tactic", { executionStyle: "toggle" }),
      tactic("Legacy toggle", { executionStyle: null, trackingType: "boolean" })
    ]);
    const html = await renderPage();
    expect(html).toContain("Due this week");
    expect(html).toContain("Occurrence this week");
    expect(html).not.toMatch(/Inactive this week|Negative target|Toggle tactic|Legacy toggle/);
  });

  it("passes rolled-block metadata through to the rendered card", async () => {
    mocks.listCalendarBlocksForRange.mockResolvedValue([{
      id: "rolled1", tacticId: "t1", cycleId: "c1", weekNumber: 2,
      date: "2026-09-08", originalDate: "2026-09-07", plannedValue: 4, scheduledValue: 2,
      tacticTitle: "Rolled article", goalTitle: "Publish", unit: "pages"
    }]);
    const html = await renderPage();
    expect(html).toContain("Rolled article");
    expect(html).toContain("Rolled from 2026-09-07");
    expect(html).toContain("2 pages");
    expect(html).not.toContain("4 pages");
  });

  it("keeps the no-active-cycle empty state without fetching calendar data", async () => {
    mocks.getActiveCycle.mockResolvedValue(null);
    expect(await renderPage()).toContain("No active cycle");
    expect(mocks.getCycleWeeks).not.toHaveBeenCalled();
    expect(mocks.listCalendarBlocksForRange).not.toHaveBeenCalled();
    expect(mocks.listSchedulingState).not.toHaveBeenCalled();
  });
});
