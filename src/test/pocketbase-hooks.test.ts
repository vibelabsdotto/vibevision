import { readFileSync } from "node:fs";
import vm from "node:vm";

import { beforeEach, describe, expect, it, vi } from "vitest";

class TestBadRequestError extends Error {}

type Hook = (event: {
  app: {
    findRecordById: (collection: string, id: string) => FakeRecord;
    findRecordsByFilter: (
      collection: string,
      filter: string,
      sort: string,
      limit: number,
      offset: number,
      params: Record<string, unknown>
    ) => FakeRecord[];
  };
  record: FakeRecord;
  next: () => void;
}) => void;

class FakeRecord {
  id: string;
  private readonly values: Record<string, unknown>;

  constructor(id: string, values: Record<string, unknown>) {
    this.id = id;
    this.values = values;
  }

  getString(name: string) {
    return String(this.values[name] ?? "");
  }

  getInt(name: string) {
    return Number(this.values[name] ?? 0);
  }

  getFloat(name: string) {
    return Number(this.values[name] ?? 0);
  }

  getBool(name: string) {
    return Boolean(this.values[name]);
  }
}

describe("PocketBase calendar cap hooks", () => {
  const createHooks: Hook[] = [];
  const updateHooks: Hook[] = [];

  beforeEach(() => {
    createHooks.length = 0;
    updateHooks.length = 0;
    const source = readFileSync("backend/pocketbase/hooks/main.pb.js", "utf8");
    vm.runInNewContext(source, {
      BadRequestError: TestBadRequestError,
      onRecordCreateExecute: (handler: Hook, ...collections: string[]) => {
        if (collections.includes("tactic_calendar_blocks")) createHooks.push(handler);
      },
      onRecordUpdateExecute: (handler: Hook, ...collections: string[]) => {
        if (collections.includes("tactic_calendar_blocks")) updateHooks.push(handler);
      },
      routerAdd: vi.fn()
    });
  });

  function eventFor({
    requested,
    existing,
    executionStyle = "volume",
    targetValue = 10,
    recordId = "new-block"
  }: {
    requested: number;
    existing: number[];
    executionStyle?: string;
    targetValue?: number;
    recordId?: string;
  }) {
    const next = vi.fn();
    const record = new FakeRecord(recordId, {
      tactic: "t1",
      weekNumber: 4,
      plannedValue: requested
    });
    const tactic = new FakeRecord("t1", {
      trackingType: "duration",
      recurrenceType: "times_per_week",
      recurrenceCount: 1,
      targetValue,
      targetPerWeek: targetValue,
      targetPerDay: 0,
      type: "weekly_count",
      unit: "hours",
      executionStyle
    });
    const blocks = existing.map(
      (plannedValue, index) =>
        new FakeRecord(`existing-${index}`, { tactic: "t1", weekNumber: 4, plannedValue })
    );
    return {
      next,
      event: {
        app: {
          findRecordById: () => tactic,
          findRecordsByFilter: () => blocks
        },
        record,
        next
      }
    };
  }

  it("registers create and update execute hooks at the transactional persistence boundary", () => {
    expect(createHooks).toHaveLength(1);
    expect(updateHooks).toHaveLength(1);
  });

  it("rejects an aggregate weekly overschedule", () => {
    const { event } = eventFor({ requested: 3, existing: [8] });
    expect(() => createHooks[0](event)).toThrow("Only 2 hours remain to schedule this week");
  });

  it("accepts an exact decimal allocation", () => {
    const { event, next } = eventFor({ requested: 0.2, existing: [0.1], targetValue: 0.3 });
    expect(() => createHooks[0](event)).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });

  it("excludes the current record from an update aggregate", () => {
    const { event, next } = eventFor({ requested: 8, existing: [8], recordId: "existing-0" });
    expect(() => updateHooks[0](event)).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });

  it("enforces explicit occurrence values", () => {
    const { event } = eventFor({ requested: 1.5, existing: [], executionStyle: "occurrence", targetValue: 5 });
    expect(() => updateHooks[0](event)).toThrow("Occurrence block size must be a whole number");
  });
});
