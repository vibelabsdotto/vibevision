import type { ComponentProps, EffectCallback } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";

const mocks = vi.hoisted(() => ({
  isMobile: false,
  effects: [] as EffectCallback[],
  dragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
  droppables: [] as Array<{ id: string; disabled?: boolean }>,
  cardProps: [] as Array<Record<string, unknown>>,
  refresh: vi.fn(),
  addBlock: vi.fn().mockResolvedValue(undefined),
  moveBlock: vi.fn().mockResolvedValue(undefined),
  deleteBlock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  // SSR has no effect/event lifecycle. Capture the real board callbacks so fake
  // timers and browser event targets can exercise them without adding a DOM dependency.
  useEffect: (effect: EffectCallback) => { mocks.effects.push(effect); },
  useTransition: () => [false, (task: () => void) => task()]
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/hooks/use-mobile", () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock("@/app/actions", () => ({
  addBlockAction: mocks.addBlock, moveBlockAction: mocks.moveBlock, deleteBlockAction: mocks.deleteBlock
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (event: DragEndEvent) => void }) => {
    mocks.dragEnd = onDragEnd;
    return children;
  },
  PointerSensor: function PointerSensor() {},
  TouchSensor: function TouchSensor() {},
  useSensor: vi.fn(),
  useSensors: vi.fn(),
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: (options: { id: string; disabled?: boolean }) => {
    mocks.droppables.push(options);
    return { setNodeRef: () => {}, isOver: false };
  }
}));
vi.mock("@/app/components/calendar-block-card", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/components/calendar-block-card")>();
  return {
    ...actual,
    CalendarBlockCard: (props: ComponentProps<typeof actual.CalendarBlockCard>) => {
      mocks.cardProps.push(props);
      return actual.CalendarBlockCard(props);
    }
  };
});

import { CalendarBoard } from "@/app/components/calendar-board";
import type { BacklogTactic, CalendarBlockWithTitle } from "@/app/components/calendar-block-card";

const tactic: BacklogTactic = {
  tacticId: "t1", title: "Write article", goalTitle: "Publish", trackingType: "number", executionStyle: "volume",
  unit: "pages", baseWeekTarget: 10, weekTargets: { 2: 4 }, weekTarget: 4
};
const block: CalendarBlockWithTitle = {
  id: "b1", tacticId: "t1", cycleId: "c1", weekNumber: 2, date: "2026-09-08",
  startTime: null, endTime: null, durationMinutes: null, plannedValue: 1, note: null,
  tacticTitle: "Scheduled article", goalTitle: "Publish", unit: "pages"
};
const defaults = {
  cycleId: "c1", cycleStart: "2026-08-31", cycleEnd: "2026-11-22",
  cycleWeeks: [{ weekNumber: 2, startDate: "2026-09-07", endDate: "2026-09-13" }],
  today: "2026-09-08", blocks: [block], backlog: [tactic],
  // Legacy inputs deliberately cover a month. The week-only board must not use them.
  monthKey: "2026-09", prevMonthKey: "2026-08", nextMonthKey: "2026-10",
  gridStart: "2026-08-31", gridEnd: "2026-10-04", monthStart: "2026-09-01", monthEnd: "2026-09-30"
};
function renderBoard(overrides: Partial<typeof defaults> = {}) {
  return renderToStaticMarkup(<CalendarBoard {...defaults} {...overrides} />);
}
function drop(id: string, date: string | null) {
  mocks.dragEnd?.({ active: { id }, over: date ? { id: date } : null } as DragEndEvent);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
  mocks.isMobile = false;
  mocks.effects = [];
  mocks.droppables = [];
  mocks.cardProps = [];
  mocks.refresh.mockClear();
  mocks.addBlock.mockClear();
  mocks.moveBlock.mockClear();
  mocks.deleteBlock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CalendarBoard rendered current week", () => {
  it.each([false, true])("renders exactly seven named days with no month or navigation on mobile=%s", (isMobile) => {
    mocks.isMobile = isMobile;
    const html = renderBoard();
    expect([...html.matchAll(/aria-label="Schedule for ([^"]+)"/g)].map((match) => match[1])).toEqual([
      "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"
    ]);
    expect(html).toMatch(/<h[1-6][^>]*>Week 2 of 12<\/h[1-6]>/);
    expect(html).not.toMatch(/month=|Month view|Previous month|Next month|Prev week|Next week|Calendar view/);
    for (const weekday of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      const tag = html.match(new RegExp(`<[^>]+>${weekday}<`))?.[0];
      expect(tag, `${weekday} must be visible in each layout`).toBeDefined();
      expect(tag).not.toMatch(/hidden/);
    }
    expect(html).toMatch(/aria-current="date" aria-label="Schedule for 2026-09-08"/);
    expect(html).toContain("Scheduled article");
    expect(html).toContain('aria-label="Delete Scheduled article block"');
  });

  it("spans an ISO week across a year boundary without adding surrounding days", () => {
    const html = renderBoard({
      today: "2027-01-01", cycleEnd: "2027-01-03",
      cycleWeeks: [{ weekNumber: 12, startDate: "2026-12-28", endDate: "2027-01-03" }]
    });
    const dates = [...html.matchAll(/aria-label="Schedule for ([^"]+)"/g)].map((match) => match[1]);
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-12-28");
    expect(dates[6]).toBe("2027-01-03");
    expect(html).toContain("Week 12 of 12");
  });

  it("omits toggles and inactive weekly targets even if a caller supplies them", () => {
    const html = renderBoard({ backlog: [
      tactic,
      { ...tactic, tacticId: "inactive", title: "Inactive weekly tactic", weekTarget: 0 },
      { ...tactic, tacticId: "toggle", title: "Toggle weekly tactic", executionStyle: "toggle" },
      { ...tactic, tacticId: "legacy", title: "Legacy boolean tactic", executionStyle: null, trackingType: "boolean" }
    ] });
    expect(html).toContain("Write article");
    expect(html).not.toMatch(/Inactive weekly tactic|Toggle weekly tactic|Legacy boolean tactic/);
    expect(html).toMatch(/aria-label="Write article block size"[^>]*value="4"/);
  });

  it("limits the block size control to this week's target rather than other weeks", () => {
    const html = renderBoard();
    expect(html).toMatch(/aria-label="Write article block size"[^>]*max="4"/);
  });

  it("leaves an unmatched current week empty and disables every drop target", () => {
    const html = renderBoard({ today: "2026-11-23" });
    expect(html).toContain("No current cycle week");
    expect(html).not.toMatch(/Week \d+ of 12|Write article|Scheduled article/);
    expect(mocks.droppables).toHaveLength(7);
    expect(mocks.droppables.every((day) => day.disabled)).toBe(true);
    drop("new:t1", "2026-11-23");
    drop("b1", "2026-11-24");
    expect(mocks.addBlock).not.toHaveBeenCalled();
    expect(mocks.moveBlock).not.toHaveBeenCalled();
  });

  it("disables days outside the matching cycle week even within a partial ISO week", () => {
    renderBoard({
      cycleStart: "2026-09-09", today: "2026-09-09",
      cycleWeeks: [{ weekNumber: 1, startDate: "2026-09-09", endDate: "2026-09-13" }]
    });
    expect(mocks.droppables.filter((day) => day.disabled).map((day) => day.id))
      .toEqual(["2026-09-07", "2026-09-08"]);
    drop("new:t1", "2026-09-08");
    expect(mocks.addBlock).not.toHaveBeenCalled();
  });
});

describe("CalendarBoard scheduling callbacks", () => {
  it("keeps scheduling, moving, and deleting current-week blocks", () => {
    renderBoard({ backlog: [{ ...tactic, executionStyle: "occurrence" }] });
    drop("new:t1", "2026-09-09");
    expect(mocks.addBlock).toHaveBeenCalledWith({ tacticId: "t1", date: "2026-09-09", plannedValue: 1 });
    drop("b1", "2026-09-10");
    expect(mocks.moveBlock).toHaveBeenCalledWith({ blockId: "b1", toDate: "2026-09-10" });
    const scheduledCard = mocks.cardProps.find((props) => props.variant === "scheduled");
    (scheduledCard?.onDelete as (id: string) => void)("b1");
    expect(mocks.deleteBlock).toHaveBeenCalledWith({ blockId: "b1" });
  });

  it("rejects unrelated destinations, absent backlog entries, and inactive tactics", () => {
    renderBoard({ backlog: [tactic, { ...tactic, tacticId: "inactive", weekTarget: 0 }] });
    drop("new:t1", "2026-09-14");
    drop("b1", "2026-09-14");
    drop("new:missing", "2026-09-09");
    drop("new:inactive", "2026-09-09");
    drop("new:t1", null);
    drop("b1", "2026-09-08");
    expect(mocks.addBlock).not.toHaveBeenCalled();
    expect(mocks.moveBlock).not.toHaveBeenCalled();
  });

  it("shows rolled remaining amounts without freeing the original weekly capacity", () => {
    const rolledBlock = { ...block, originalDate: "2026-09-07", plannedValue: 4, scheduledValue: 2 };
    const html = renderBoard({ blocks: [rolledBlock], backlog: [{ ...tactic, executionStyle: "occurrence" }] });
    expect(html).toContain("2 pages");
    expect(html).toContain("Rolled from 2026-09-07");
    drop("new:t1", "2026-09-09");
    expect(mocks.addBlock).not.toHaveBeenCalled();
  });

  it("does not label an unrolled block as rolled", () => {
    const unrolledBlock = { ...block, originalDate: block.date, scheduledValue: 1 };
    expect(renderBoard({ blocks: [unrolledBlock] })).not.toContain("Rolled from");
  });

  it("does not exceed the current-week scheduling target", () => {
    renderBoard({ backlog: [{ ...tactic, executionStyle: "occurrence", weekTarget: 1, weekTargets: { 2: 1 } }] });
    drop("new:t1", "2026-09-09");
    expect(mocks.addBlock).not.toHaveBeenCalled();
  });
});

function mountRefreshEffects() {
  const documentEvents = new EventTarget();
  const browserWindow = new EventTarget();
  Object.defineProperty(documentEvents, "visibilityState", { value: "visible", writable: true });
  vi.stubGlobal("document", documentEvents);
  vi.stubGlobal("window", browserWindow);
  renderBoard();
  const cleanups = mocks.effects.map((effect) => effect());
  return {
    documentEvents,
    browserWindow,
    cleanup: () => cleanups.forEach((cleanup) => { if (typeof cleanup === "function") cleanup(); })
  };
}

describe("CalendarBoard date refresh", () => {
  it("refreshes the server-rendered date at UTC midnight while left open and again the next day", () => {
    vi.setSystemTime(new Date("2026-09-08T23:59:59.000Z"));
    const { cleanup } = mountRefreshEffects();
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(86_400_000);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["visibilitychange", "focus"])("refreshes a new date after returning via %s without duplicate same-day refreshes", (event) => {
    const { documentEvents, browserWindow, cleanup } = mountRefreshEffects();
    const target = event === "focus" ? browserWindow : documentEvents;
    target.dispatchEvent(new Event(event));
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-09-14T08:00:00.000Z"));
    target.dispatchEvent(new Event(event));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    target.dispatchEvent(new Event(event));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    cleanup();
    vi.setSystemTime(new Date("2026-09-15T08:00:00.000Z"));
    target.dispatchEvent(new Event(event));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes immediately if the page date became stale before the effect mounted", () => {
    vi.setSystemTime(new Date("2026-09-14T08:00:00.000Z"));
    const { cleanup } = mountRefreshEffects();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
