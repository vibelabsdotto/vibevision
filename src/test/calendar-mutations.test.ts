import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  blocks: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; data: Record<string, unknown> }>,
  deletes: [] as string[]
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
        if (name === "tactics") {
          return { getOne: () => Promise.resolve(tactic) };
        }
        if (name === "tactic_calendar_blocks") {
          return {
            getOne(id: string) {
              const block = store.blocks.find((item) => item.id === id);
              return block ? Promise.resolve(block) : Promise.reject(new Error("not found"));
            },
            getFullList({ filter }: { filter: string }) {
              const params = JSON.parse(filter) as { t?: string; d?: string; c?: string; w?: number };
              return Promise.resolve(
                store.blocks.filter(
                  (block) =>
                    (params.t === undefined || block.tactic === params.t) &&
                    (params.d === undefined || block.date === params.d) &&
                    (params.c === undefined || block.cycle === params.c) &&
                    (params.w === undefined || block.weekNumber === params.w)
                )
              );
            },
            update(id: string, data: Record<string, unknown>) {
              store.updates.push({ id, data });
              const current = store.blocks.find((item) => item.id === id);
              if (!current) return Promise.reject(new Error("not found"));
              Object.assign(current, data);
              return Promise.resolve(current);
            },
            delete(id: string) {
              store.deletes.push(id);
              return Promise.resolve(true);
            }
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      }
    }
  };
});

import { moveTacticCalendarBlock, updateTacticCalendarBlock } from "@/app/core";

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

describe("calendar block moves", () => {
  beforeEach(() => {
    store.blocks = [];
    store.updates = [];
    store.deletes = [];
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

  it("rejects a cross-week move that exceeds the destination week target", async () => {
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

  it("rejects an update that increases a block beyond the weekly target", async () => {
    store.blocks = [
      block("source", "2026-04-13", 1, 1),
      block("other", "2026-04-14", 1, 8)
    ];

    await expect(
      updateTacticCalendarBlock("source", { plannedValue: 3 })
    ).rejects.toThrow("Only 2 hours remain to schedule this week");
    expect(store.updates).toEqual([]);
  });
});
