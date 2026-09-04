import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  blocks: [] as Array<Record<string, unknown>>,
  entries: [] as Array<Record<string, unknown>>,
  schedules: [] as Array<Record<string, unknown>>,
  creates: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; data: Record<string, unknown> }>,
  deletes: [] as string[],
  entryUpdates: [] as Array<{ id: string; data: Record<string, unknown> }>,
  entryDeletes: [] as string[]
}));

vi.mock("@/app/lib/pb", () => {
  const tactic = {
    id: "t1",
    goal: "g1",
    title: "Development",
    type: "weekly_count",
    trackingType: "duration",
    recurrenceType: "times_per_week",
    recurrenceCount: 1,
    targetValue: 10,
    unit: "hours",
    executionStyle: "volume",
    targetPerWeek: 10,
    targetPerDay: null,
    scoringWeight: 1,
    startsWeek: 1,
    endsWeek: 12,
    active: true,
    sortOrder: 0
  };

  const notFound = () => Object.assign(new Error("not found"), { status: 404 });

  return {
    pb: {
      filter: (_template: string, params: Record<string, unknown>) => JSON.stringify(params),
      collection(name: string) {
        if (name === "cycle_weeks") {
          return {
            getFirstListItem(filter: string) {
              const { d } = JSON.parse(filter) as { d: string };
              return Promise.resolve({ weekNumber: d < "2026-04-20" ? 1 : 2 });
            }
          };
        }
        if (name === "goals") {
          return { getOne: () => Promise.resolve({ id: "g1", cycle: "c1" }) };
        }
        if (name === "tactics") {
          return {
            getOne: () => Promise.resolve(tactic),
            getFullList: () =>
              Promise.resolve([
                { ...tactic, expand: { goal: { id: "g1", title: "Goal", sortOrder: 0 } } }
              ])
          };
        }
        if (name === "tactic_schedules") {
          return {
            getFirstListItem(filter: string) {
              const params = JSON.parse(filter) as { t: string; w: number };
              const schedule = store.schedules.find(
                (item) => item.tactic === params.t && item.weekNumber === params.w
              );
              return schedule ? Promise.resolve(schedule) : Promise.reject(notFound());
            },
            getFullList() {
              return Promise.resolve(store.schedules);
            }
          };
        }
        if (name === "tactic_calendar_blocks") {
          return {
            getOne(id: string) {
              const block = store.blocks.find((item) => item.id === id);
              return block ? Promise.resolve(block) : Promise.reject(notFound());
            },
            getFullList({ filter }: { filter: string }) {
              const params = JSON.parse(filter) as {
                t?: string;
                d?: string;
                c?: string;
                w?: number;
                f?: string;
              };
              return Promise.resolve(
                store.blocks.filter((block) => {
                  if (params.f !== undefined) {
                    return (
                      (params.c === undefined || block.cycle === params.c) &&
                      String(block.date) >= params.f &&
                      String(block.date) <= String(params.t)
                    );
                  }
                  return (
                    (params.t === undefined || block.tactic === params.t) &&
                    (params.d === undefined || block.date === params.d) &&
                    (params.c === undefined || block.cycle === params.c) &&
                    (params.w === undefined || block.weekNumber === params.w)
                  );
                })
              );
            },
            create(data: Record<string, unknown>) {
              const created = { id: `created-${store.creates.length + 1}`, ...data };
              store.creates.push(data);
              store.blocks.push(created);
              return Promise.resolve(created);
            },
            update(id: string, data: Record<string, unknown>) {
              store.updates.push({ id, data });
              const current = store.blocks.find((item) => item.id === id);
              if (!current) return Promise.reject(notFound());
              Object.assign(current, data);
              return Promise.resolve(current);
            },
            delete(id: string) {
              store.deletes.push(id);
              store.blocks = store.blocks.filter((item) => item.id !== id);
              return Promise.resolve(true);
            }
          };
        }
        if (name === "tactic_entries") {
          return {
            getFullList({ filter }: { filter: string }) {
              const params = JSON.parse(filter) as { t: string; d: string };
              return Promise.resolve(
                store.entries
                  .filter((entry) => entry.tactic === params.t && entry.date === params.d)
                  .sort((left, right) => String(right.created).localeCompare(String(left.created)))
              );
            },
            update(id: string, data: Record<string, unknown>) {
              store.entryUpdates.push({ id, data });
              const current = store.entries.find((item) => item.id === id);
              if (!current) return Promise.reject(notFound());
              Object.assign(current, data);
              return Promise.resolve(current);
            },
            delete(id: string) {
              store.entryDeletes.push(id);
              store.entries = store.entries.filter((item) => item.id !== id);
              return Promise.resolve(true);
            }
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      }
    }
  };
});

import {
  addTacticCalendarBlock,
  listSchedulingState,
  moveTacticCalendarBlock,
  undoLatestTacticEntry,
  updateTacticCalendarBlock
} from "@/app/core";

function block(id: string, date: string, weekNumber: number, plannedValue: number) {
  return {
    id,
    tactic: "t1",
    cycle: "c1",
    weekNumber,
    date,
    startTime: "",
    endTime: "",
    durationMinutes: "",
    plannedValue,
    note: ""
  };
}

function schedule(weekNumber: number, plannedTarget: number) {
  return {
    id: `schedule-${weekNumber}`,
    tactic: "t1",
    weekNumber,
    plannedTarget,
    required: true
  };
}

describe("calendar block mutations", () => {
  beforeEach(() => {
    store.blocks = [];
    store.entries = [];
    store.schedules = [];
    store.creates = [];
    store.updates = [];
    store.deletes = [];
    store.entryUpdates = [];
    store.entryDeletes = [];
  });

  it("preserves both quantities when moving onto an occupied day", async () => {
    store.blocks = [
      block("source", "2026-04-13", 1, 2),
      block("target", "2026-04-15", 1, 3),
      block("other", "2026-04-16", 1, 5)
    ];

    const result = await moveTacticCalendarBlock({ blockId: "source", toDate: "2026-04-15" });

    expect(result.action).toBe("moved");
    expect(store.updates).toEqual([
      { id: "source", data: { weekNumber: 1, date: "2026-04-15" } }
    ]);
    expect(store.deletes).toEqual([]);
    expect(store.blocks.filter((item) => item.date === "2026-04-15").map((item) => item.plannedValue)).toEqual([2, 3]);
  });

  it("rejects a cross-week move that exceeds the destination week base target", async () => {
    store.blocks = [
      block("source", "2026-04-13", 1, 2),
      block("destination", "2026-04-21", 2, 9)
    ];

    await expect(
      moveTacticCalendarBlock({ blockId: "source", toDate: "2026-04-22" })
    ).rejects.toThrow("Only 1 hours remain to schedule this week");
    expect(store.updates).toEqual([]);
    expect(store.deletes).toEqual([]);
  });

  it("rejects an update that increases a block beyond the weekly base target", async () => {
    store.blocks = [
      block("source", "2026-04-13", 1, 1),
      block("other", "2026-04-14", 1, 8)
    ];

    await expect(
      updateTacticCalendarBlock("source", { plannedValue: 3 })
    ).rejects.toThrow("Only 2 hours remain to schedule this week");
    expect(store.updates).toEqual([]);
  });

  it("rejects an add above a lowered schedule target", async () => {
    store.schedules = [schedule(1, 5)];

    await expect(
      addTacticCalendarBlock({ tacticId: "t1", date: "2026-04-15", plannedValue: 6 })
    ).rejects.toThrow("Only 5 hours remain to schedule this week");
    expect(store.creates).toEqual([]);
  });

  it("treats an explicit zero schedule target as authoritative", async () => {
    store.schedules = [schedule(1, 0)];

    await expect(
      addTacticCalendarBlock({ tacticId: "t1", date: "2026-04-15", plannedValue: 1 })
    ).rejects.toThrow("Only 0 hours remain to schedule this week");
    expect(store.creates).toEqual([]);
  });

  it("rejects an update above a lowered schedule target", async () => {
    store.schedules = [schedule(1, 5)];
    store.blocks = [
      block("source", "2026-04-13", 1, 1),
      block("other", "2026-04-14", 1, 2)
    ];

    await expect(
      updateTacticCalendarBlock("source", { plannedValue: 4 })
    ).rejects.toThrow("Only 3 hours remain to schedule this week");
    expect(store.updates).toEqual([]);
  });

  it("rejects a move above the lowered destination-week schedule target", async () => {
    store.schedules = [schedule(2, 5)];
    store.blocks = [
      block("source", "2026-04-13", 1, 2),
      block("destination", "2026-04-21", 2, 4)
    ];

    await expect(
      moveTacticCalendarBlock({ blockId: "source", toDate: "2026-04-22" })
    ).rejects.toThrow("Only 1 hours remain to schedule this week");
    expect(store.updates).toEqual([]);
  });

  it("permits an add above the base target when the schedule target is raised", async () => {
    store.schedules = [schedule(1, 15)];

    const created = await addTacticCalendarBlock({
      tacticId: "t1",
      date: "2026-04-15",
      plannedValue: 12
    });

    expect(created.plannedValue).toBe(12);
    expect(store.creates).toHaveLength(1);
  });

  it("reports effective and per-week schedule targets in scheduling state", async () => {
    store.schedules = [schedule(1, 5), schedule(2, 12)];
    store.blocks = [block("scheduled", "2026-04-15", 1, 2)];

    const [item] = await listSchedulingState("c1", "2026-04-13", "2026-04-19");

    expect(item.baseWeekTarget).toBe(10);
    expect(item.weekTarget).toBe(5);
    expect(item.weekTargets).toEqual({ 1: 5, 2: 12 });
    expect(item.scheduled).toBe(2);
    expect(item.remaining).toBe(3);
  });
});

describe("occurrence minus", () => {
  beforeEach(() => {
    store.entries = [];
    store.entryUpdates = [];
    store.entryDeletes = [];
  });

  it("decrements the latest occurrence row by one when its value is greater than one", async () => {
    store.entries = [
      { id: "older", tactic: "t1", date: "2026-04-15", value: 1, created: "2026-04-15 08:00:00" },
      { id: "latest", tactic: "t1", date: "2026-04-15", value: 3, created: "2026-04-15 09:00:00" }
    ];

    const result = await undoLatestTacticEntry("t1", "2026-04-15");

    expect(result).toBe("latest");
    expect(store.entryUpdates).toEqual([{ id: "latest", data: { value: 2 } }]);
    expect(store.entryDeletes).toEqual([]);
    expect(store.entries.find((entry) => entry.id === "latest")?.value).toBe(2);
  });

  it("deletes the latest occurrence row when its value is one", async () => {
    store.entries = [
      { id: "older", tactic: "t1", date: "2026-04-15", value: 2, created: "2026-04-15 08:00:00" },
      { id: "latest", tactic: "t1", date: "2026-04-15", value: 1, created: "2026-04-15 09:00:00" }
    ];

    const result = await undoLatestTacticEntry("t1", "2026-04-15");

    expect(result).toBe("latest");
    expect(store.entryUpdates).toEqual([]);
    expect(store.entryDeletes).toEqual(["latest"]);
    expect(store.entries.map((entry) => entry.id)).toEqual(["older"]);
  });
});
