import { readFileSync } from "node:fs";
import vm from "node:vm";

import { beforeEach, describe, expect, it, vi } from "vitest";

class TestBadRequestError extends Error {}

type HookEvent = {
  app: FakeApp;
  record: FakeRecord;
  next: ReturnType<typeof vi.fn>;
};
type Hook = (event: HookEvent) => void;
type Operation = "create" | "update" | "delete";

class FakeRecord {
  id: string;
  private readonly values: Record<string, unknown>;

  constructor(id: string, values: Record<string, unknown>) {
    this.id = id;
    this.values = { ...values };
  }

  get(name: string) {
    return this.values[name];
  }

  set(name: string, value: unknown) {
    this.values[name] = value;
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

type RecordStore = Record<string, FakeRecord[]>;

class FakeApp {
  readonly transactionCalls = vi.fn();
  transactionApp: FakeApp;

  constructor(private readonly store: RecordStore, transactionApp?: FakeApp) {
    this.transactionApp = transactionApp ?? this;
  }

  runInTransaction(callback: (txApp: FakeApp) => void) {
    this.transactionCalls();
    return callback(this.transactionApp);
  }

  findRecordById(collection: string, id: string) {
    const record = (this.store[collection] ?? []).find((item) => item.id === id);
    if (!record) throw new Error(`${collection}/${id} not found`);
    return record;
  }

  findRecordsByFilter(
    collection: string,
    _filter: string,
    _sort: string,
    _limit: number,
    _offset: number,
    params: Record<string, unknown>
  ) {
    return (this.store[collection] ?? []).filter((record) => {
      const cycle = params.cycle ?? params.c;
      const tactic = params.tactic ?? params.t;
      const week = params.week ?? params.w;
      const date = params.date ?? params.d;
      const id = params.id;
      if (cycle !== undefined && record.getString("cycle") !== String(cycle)) return false;
      if (tactic !== undefined && record.getString("tactic") !== String(tactic)) return false;
      if (week !== undefined && record.getInt("weekNumber") !== Number(week)) return false;
      if (date !== undefined) {
        if (collection === "cycle_weeks") {
          if (record.getString("startDate") > String(date) || record.getString("endDate") < String(date)) return false;
        } else if (record.getString("date") !== String(date)) {
          return false;
        }
      }
      if (id !== undefined && record.id === String(id)) return false;
      return true;
    });
  }
}

const hooks: Record<Operation, Record<string, Hook[]>> = {
  create: {},
  update: {},
  delete: {}
};

function register(operation: Operation, handler: Hook, collections: string[]) {
  // PocketBase serializes execute handlers into isolated JSVM runtimes. Recreate
  // that boundary so tests cannot accidentally rely on module-scope helpers.
  const isolated = vm.runInNewContext(`(${handler.toString()})`, {
    BadRequestError: TestBadRequestError
  }) as Hook;
  for (const collection of collections) {
    (hooks[operation][collection] ??= []).push(isolated);
  }
}

function record(id: string, values: Record<string, unknown>) {
  return new FakeRecord(id, values);
}

function fixture(options: {
  executionStyle?: string;
  trackingType?: string;
  recurrenceType?: string;
  targetValue?: number;
  recurrenceCount?: number;
  plannedTarget?: number | null;
  blocks?: FakeRecord[];
  entries?: FakeRecord[];
} = {}) {
  const tactic = record("t1", {
    goal: "g1",
    trackingType: options.trackingType ?? "duration",
    recurrenceType: options.recurrenceType ?? "times_per_week",
    recurrenceCount: options.recurrenceCount ?? 1,
    targetValue: options.targetValue ?? 10,
    targetPerWeek: options.targetValue ?? 10,
    targetPerDay: 0,
    type: "weekly_count",
    unit: "hours",
    executionStyle: options.executionStyle ?? "volume"
  });
  const schedules =
    options.plannedTarget === undefined
      ? []
      : [
          record("s4", {
            tactic: "t1",
            weekNumber: 4,
            plannedTarget: options.plannedTarget,
            required: true
          })
        ];
  const store: RecordStore = {
    goals: [record("g1", { cycle: "c1" })],
    tactics: [tactic],
    cycle_weeks: [
      record("w4", {
        cycle: "c1",
        weekNumber: 4,
        startDate: "2026-04-20",
        endDate: "2026-04-26"
      })
    ],
    tactic_schedules: schedules,
    tactic_calendar_blocks: options.blocks ?? [],
    tactic_entries: options.entries ?? []
  };
  const tx = new FakeApp(store);
  const root = new FakeApp(store, tx);
  return { root, tx, store, tactic };
}

function invoke(hook: Hook, app: FakeApp, input: FakeRecord) {
  let appAtNext: FakeApp | null = null;
  const event: HookEvent = {
    app,
    record: input,
    next: vi.fn(() => {
      appAtNext = event.app;
    })
  };
  const run = () => hook(event);
  return { event, run, next: event.next, appAtNext: () => appAtNext };
}

function calendarBlock(values: Record<string, unknown> = {}) {
  return record(String(values.id ?? "new-block"), {
    tactic: "t1",
    cycle: "c1",
    weekNumber: 4,
    date: "2026-04-22",
    plannedValue: 1,
    ...values
  });
}

function entry(values: Record<string, unknown> = {}) {
  return record(String(values.id ?? "new-entry"), {
    tactic: "t1",
    cycle: "c1",
    weekNumber: 4,
    date: "2026-04-22",
    value: 1,
    completed: false,
    ...values
  });
}

beforeEach(() => {
  for (const operation of Object.keys(hooks) as Operation[]) hooks[operation] = {};
  const source = readFileSync("backend/pocketbase/hooks/main.pb.js", "utf8");
  vm.runInNewContext(source, {
    BadRequestError: TestBadRequestError,
    onRecordCreateExecute: (handler: Hook, ...collections: string[]) => register("create", handler, collections),
    onRecordUpdateExecute: (handler: Hook, ...collections: string[]) => register("update", handler, collections),
    onRecordDeleteExecute: (handler: Hook, ...collections: string[]) => register("delete", handler, collections),
    routerAdd: vi.fn()
  });
});

describe("PocketBase calendar invariants", () => {
  it("executes validation and persistence in one explicit transaction", () => {
    const { root, tx } = fixture();
    const call = invoke(hooks.create.tactic_calendar_blocks[0], root, calendarBlock());

    call.run();

    expect(root.transactionCalls).toHaveBeenCalledOnce();
    expect(call.appAtNext()).toBe(tx);
    expect(call.event.app).toBe(root);
  });

  it("derives the cycle and week bucket from the tactic and date", () => {
    const { root } = fixture();
    const call = invoke(
      hooks.create.tactic_calendar_blocks[0],
      root,
      calendarBlock({ cycle: "forged-cycle", weekNumber: 99 })
    );

    expect(call.run).toThrow("Calendar block cycle does not match its tactic");
    expect(call.event.app).toBe(root);
  });

  it("derives occurrence semantics when executionStyle is absent", () => {
    const { root, tactic } = fixture({
      executionStyle: "",
      trackingType: "boolean",
      recurrenceType: "times_per_week",
      targetValue: 1,
      recurrenceCount: 5
    });
    tactic.set("executionStyle", "");
    const call = invoke(
      hooks.create.tactic_calendar_blocks[0],
      root,
      calendarBlock({ plannedValue: 1.5 })
    );

    expect(call.run).toThrow("Occurrence block size must be a whole number");
  });

  it("rejects a recognized executionStyle that contradicts the tactic plan", () => {
    const { root } = fixture({
      executionStyle: "occurrence",
      trackingType: "quantity",
      recurrenceType: "times_per_week",
      targetValue: 1.5
    });
    const call = invoke(hooks.create.tactic_calendar_blocks[0], root, calendarBlock());

    expect(call.run).toThrow("Invalid execution style for tactic");
  });

  it("normalizes plannedValue before persisting", () => {
    const { root } = fixture();
    const block = calendarBlock({ plannedValue: 0.123456789 });
    const call = invoke(hooks.create.tactic_calendar_blocks[0], root, block);

    call.run();

    expect(block.getFloat("plannedValue")).toBe(0.123457);
    expect(call.next).toHaveBeenCalledOnce();
  });

  it("uses the target-week plannedTarget override", () => {
    const { root } = fixture({
      plannedTarget: 5,
      blocks: [calendarBlock({ id: "existing", plannedValue: 4 })]
    });
    const call = invoke(
      hooks.create.tactic_calendar_blocks[0],
      root,
      calendarBlock({ plannedValue: 2 })
    );

    expect(call.run).toThrow("Only 1 hours remain to schedule this week");
  });

  it("excludes the current calendar record from update aggregation", () => {
    const existing = calendarBlock({ id: "existing", plannedValue: 8 });
    const { root } = fixture({ blocks: [existing] });
    const call = invoke(
      hooks.update.tactic_calendar_blocks[0],
      root,
      calendarBlock({ id: "existing", plannedValue: 8 })
    );

    expect(call.run).not.toThrow();
    expect(call.next).toHaveBeenCalledOnce();
  });
});

describe("PocketBase daily entry invariants", () => {
  it("registers create, update, and delete execute hooks", () => {
    expect(hooks.create.tactic_entries).toHaveLength(1);
    expect(hooks.update.tactic_entries).toHaveLength(1);
    expect(hooks.delete.tactic_entries).toHaveLength(1);
  });

  it("executes entry validation and persistence in one explicit transaction", () => {
    const scheduled = calendarBlock({ id: "block", plannedValue: 2 });
    const { root, tx } = fixture({ blocks: [scheduled] });
    const call = invoke(hooks.create.tactic_entries[0], root, entry());

    call.run();

    expect(root.transactionCalls).toHaveBeenCalledOnce();
    expect(call.appAtNext()).toBe(tx);
    expect(call.event.app).toBe(root);
  });

  it("rejects concurrent-equivalent writes beyond the scheduled daily target", () => {
    const scheduled = calendarBlock({ id: "block", plannedValue: 2 });
    const existing = entry({ id: "first", value: 1.5 });
    const { root } = fixture({ blocks: [scheduled], entries: [existing] });
    const call = invoke(hooks.create.tactic_entries[0], root, entry({ value: 1 }));

    expect(call.run).toThrow("Only 0.5 hours remain for this date");
  });

  it("rejects a forged entry cycle or week bucket", () => {
    const scheduled = calendarBlock({ id: "block", plannedValue: 2 });
    const { root } = fixture({ blocks: [scheduled] });
    const call = invoke(
      hooks.create.tactic_entries[0],
      root,
      entry({ cycle: "forged-cycle", weekNumber: 99 })
    );

    expect(call.run).toThrow("Tactic entry cycle does not match its tactic");
  });

  it("prevents a volume decrement from taking daily progress below zero", () => {
    const scheduled = calendarBlock({ id: "block", plannedValue: 2 });
    const { root } = fixture({ blocks: [scheduled] });
    const call = invoke(hooks.create.tactic_entries[0], root, entry({ value: -1 }));

    expect(call.run).toThrow("Tactic progress cannot be negative for this date");
  });

  it("allows one-unit occurrence decrements by updating a multi-value row", () => {
    const scheduled = calendarBlock({ id: "block", plannedValue: 3 });
    const existing = entry({ id: "existing", value: 3 });
    const { root } = fixture({
      executionStyle: "occurrence",
      trackingType: "boolean",
      recurrenceType: "times_per_week",
      targetValue: 1,
      recurrenceCount: 3,
      blocks: [scheduled],
      entries: [existing]
    });
    const call = invoke(
      hooks.update.tactic_entries[0],
      root,
      entry({ id: "existing", value: 2 })
    );

    expect(call.run).not.toThrow();
    expect(call.next).toHaveBeenCalledOnce();
  });

  it("rejects deleting a negative row when that would exceed the daily target", () => {
    const scheduled = calendarBlock({ id: "block", plannedValue: 2 });
    const positive = entry({ id: "positive", value: 3 });
    const negative = entry({ id: "negative", value: -1 });
    const { root } = fixture({ blocks: [scheduled], entries: [positive, negative] });
    const call = invoke(hooks.delete.tactic_entries[0], root, negative);

    expect(call.run).toThrow("Negative tactic entries cannot be deleted directly");
  });

  it("uses recurring daily targets when no calendar block exists", () => {
    const { root } = fixture({
      trackingType: "quantity",
      recurrenceType: "daily",
      targetValue: 1
    });
    const first = invoke(hooks.create.tactic_entries[0], root, entry({ value: 1 }));

    expect(first.run).not.toThrow();
    expect(first.next).toHaveBeenCalledOnce();

    const existing = entry({ id: "existing", value: 1 });
    const secondFixture = fixture({
      trackingType: "quantity",
      recurrenceType: "daily",
      targetValue: 1,
      entries: [existing]
    });
    const second = invoke(hooks.create.tactic_entries[0], secondFixture.root, entry({ value: 1 }));
    expect(second.run).toThrow("Only 0 hours remain for this date");
  });
});
