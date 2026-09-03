"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { addBlockAction, deleteBlockAction, moveBlockAction } from "@/app/actions";
import {
  CalendarBlockCard,
  type BacklogTactic,
  type CalendarBlockWithTitle
} from "@/app/components/calendar-block-card";
import { CalendarDayCell } from "@/app/components/calendar-day-cell";
import { useIsMobile } from "@/lib/hooks/use-mobile";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  let current = from;
  while (current <= to) {
    days.push(current);
    current = addDaysISO(current, 1);
  }
  return days;
}

export function CalendarBoard({
  cycleStart,
  cycleEnd,
  monthKey,
  prevMonthKey,
  nextMonthKey,
  gridStart,
  gridEnd,
  monthStart,
  monthEnd,
  today,
  blocks,
  backlog
}: {
  cycleId: string;
  cycleStart: string;
  cycleEnd: string;
  monthKey: string;
  prevMonthKey: string;
  nextMonthKey: string;
  gridStart: string;
  gridEnd: string;
  monthStart: string;
  monthEnd: string;
  today: string;
  blocks: CalendarBlockWithTitle[];
  backlog: BacklogTactic[];
}) {
  const isMobile = useIsMobile();
  const [viewOverride, setViewOverride] = useState<"month" | "week" | null>(null);
  const view = viewOverride ?? (isMobile ? "week" : "month");
  const [weekOffset, setWeekOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  const blocksByDate = useMemo(() => {
    const map = new Map<string, CalendarBlockWithTitle[]>();
    for (const block of blocks) {
      const list = map.get(block.date) ?? [];
      list.push(block);
      map.set(block.date, list);
    }
    return map;
  }, [blocks]);

  const allDays = useMemo(() => eachDay(gridStart, gridEnd), [gridStart, gridEnd]);

  const anchorDate = today >= gridStart && today <= gridEnd ? today : gridStart;
  const anchorMonday = useMemo(() => {
    const date = parseISO(anchorDate);
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - weekday + 1 + weekOffset * 7);
    return toISO(date);
  }, [anchorDate, weekOffset]);
  const weekDays = useMemo(() => {
    const days = eachDay(anchorMonday, addDaysISO(anchorMonday, 6));
    return days.filter((day) => day >= gridStart && day <= gridEnd);
  }, [anchorMonday, gridStart, gridEnd]);
  const canStepBack = addDaysISO(anchorMonday, -7) >= gridStart || anchorMonday > gridStart;
  const canStepForward = addDaysISO(anchorMonday, 7) <= gridEnd;

  function runAction(task: () => Promise<unknown>) {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await task();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not update the calendar");
        }
      })();
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : null;
    // Dropped outside any day: a cancelled drag, nothing to do.
    if (!overId) return;
    const activeId = String(event.active.id);
    if (activeId.startsWith("new:")) {
      const tacticId = activeId.slice("new:".length);
      const item = backlog.find((entry) => entry.tacticId === tacticId);
      const style = item?.executionStyle ?? (item?.trackingType === "boolean" ? "toggle" : undefined);
      if (style === "toggle") {
        setError("Toggles can't be scheduled");
        return;
      }
      runAction(() => addBlockAction({ tacticId, date: overId }));
      return;
    }
    const block = blocks.find((entry) => entry.id === activeId);
    // Same-day drop: nothing changed. Drops outside the cycle throw
    // server-side ("not inside the cycle") and surface in the error line.
    if (!block || block.date === overId) return;
    runAction(() => moveBlockAction({ blockId: activeId, toDate: overId }));
  }

  function handleDelete(blockId: string) {
    runAction(() => deleteBlockAction({ blockId }));
  }

  function renderDay(dateISO: string) {
    return (
      <CalendarDayCell
        blocks={blocksByDate.get(dateISO) ?? []}
        dateISO={dateISO}
        dayNumber={parseISO(dateISO).getUTCDate()}
        dimmed={dateISO < monthStart || dateISO > monthEnd}
        isToday={dateISO === today}
        key={dateISO}
        onDelete={handleDelete}
        outOfCycle={dateISO < cycleStart || dateISO > cycleEnd}
      />
    );
  }

  return (
    <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              aria-label="Previous month"
              className="rounded-[10px] border border-border px-3 py-1.5 text-sm text-ink-2 transition hover:border-teal hover:text-teal"
              href={`/calendar?month=${prevMonthKey}`}
              prefetch={false}
            >
              ←
            </Link>
            <Link
              className="rounded-[10px] border border-border px-3 py-1.5 text-sm text-ink-2 transition hover:border-teal hover:text-teal"
              href="/calendar"
              prefetch={false}
            >
              Today
            </Link>
            <Link
              aria-label="Next month"
              className="rounded-[10px] border border-border px-3 py-1.5 text-sm text-ink-2 transition hover:border-teal hover:text-teal"
              href={`/calendar?month=${nextMonthKey}`}
              prefetch={false}
            >
              →
            </Link>
            <h3 className="ml-2 font-display text-lg font-bold tracking-tight text-ink">
              {monthLabel(monthKey)}
            </h3>
          </div>
          <div
            className="flex overflow-hidden rounded-[10px] border border-border"
            role="group"
            aria-label="Calendar view"
          >
            {(["month", "week"] as const).map((option) => (
              <button
                aria-pressed={view === option}
                className={`px-3 py-1.5 text-sm capitalize transition ${
                  view === option ? "bg-teal font-semibold text-white" : "text-ink-2 hover:text-ink"
                }`}
                key={option}
                onClick={() => setViewOverride(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="rounded-[12px] border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}
        {isPending ? (
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">Saving…</p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
          <section aria-label={view === "month" ? "Month view" : "Week view"}>
            {view === "month" ? (
              <div className={isPending ? "pointer-events-none opacity-60" : undefined}>
                <div className="mb-2 grid grid-cols-7 gap-2">
                  {WEEKDAY_HEADERS.map((day) => (
                    <p
                      className="text-center font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3"
                      key={day}
                    >
                      {day}
                    </p>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">{allDays.map(renderDay)}</div>
              </div>
            ) : (
              <div className={isPending ? "pointer-events-none opacity-60" : undefined}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    className="rounded-[10px] border border-border px-3 py-1.5 text-sm text-ink-2 transition hover:border-teal hover:text-teal disabled:opacity-40"
                    disabled={!canStepBack}
                    onClick={() => setWeekOffset((offset) => offset - 1)}
                    type="button"
                  >
                    ← Prev week
                  </button>
                  <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">
                    {weekDays[0]} → {weekDays[weekDays.length - 1]}
                  </p>
                  <button
                    className="rounded-[10px] border border-border px-3 py-1.5 text-sm text-ink-2 transition hover:border-teal hover:text-teal disabled:opacity-40"
                    disabled={!canStepForward}
                    onClick={() => setWeekOffset((offset) => offset + 1)}
                    type="button"
                  >
                    Next week →
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-2 max-sm:grid-cols-1">{weekDays.map(renderDay)}</div>
              </div>
            )}
          </section>

          <aside
            aria-label="Tactics to schedule"
            className="h-fit rounded-[20px] border border-border bg-surface p-4"
          >
            <p className="eyebrow">Tactics</p>
            <p className="mt-1 text-sm text-ink-3">
              {backlog.length
                ? `Drag a tactic onto a day to schedule it (${backlog.length}). Scheduled ones stay here, marked.`
                : "No active tactics."}
            </p>
            <div className="mt-3 space-y-2">
              {backlog.map((item) => (
                <CalendarBlockCard item={item} key={item.tacticId} variant="backlog" />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </DndContext>
  );
}
