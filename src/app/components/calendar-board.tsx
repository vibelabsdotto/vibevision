"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { addBlockAction, deleteBlockAction, moveBlockAction } from "@/app/actions";
import {
  CalendarBlockCard,
  type BacklogTactic,
  type CalendarBlockWithTitle
} from "@/app/components/calendar-block-card";
import { CalendarDayCell } from "@/app/components/calendar-day-cell";
import { getRemainingForCalendarDate } from "@/app/components/calendar-scheduling";
import { addDays, parseDate, startOfIsoWeek, toDateString, todayDateString } from "@/app/lib/format";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarBoard({
  cycleStart,
  cycleEnd,
  cycleWeeks,
  today,
  blocks,
  backlog
}: {
  cycleStart: string;
  cycleEnd: string;
  cycleWeeks: Array<{ weekNumber: number; startDate: string; endDate: string }>;
  today: string;
  blocks: CalendarBlockWithTitle[];
  backlog: BacklogTactic[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [blockValues, setBlockValues] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let refreshedDate = today;
    let timer: ReturnType<typeof setTimeout>;

    function refreshDate() {
      const currentDate = todayDateString();
      if (currentDate !== refreshedDate) {
        refreshedDate = currentDate;
        // App Router refresh re-renders the page and re-fetches server data.
        router.refresh();
      }
      clearTimeout(timer);
      // The application uses UTC dates, including in the browser.
      const nextMidnight = addDays(parseDate(currentDate), 1).getTime();
      timer = setTimeout(refreshDate, Math.max(nextMidnight - Date.now(), 1));
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") refreshDate();
    }

    refreshDate();
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, today]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  const weekDays = useMemo(() => {
    const monday = startOfIsoWeek(parseDate(today));
    return WEEKDAY_HEADERS.map((_, index) => toDateString(addDays(monday, index)));
  }, [today]);
  const currentWeek = today >= cycleStart && today <= cycleEnd
    ? cycleWeeks.find((week) => today >= week.startDate && today <= week.endDate)
    : undefined;
  const activeBacklog = currentWeek ? backlog.filter((item) => {
    const style = item.executionStyle || (item.trackingType === "boolean" ? "toggle" : "volume");
    return style !== "toggle" && item.weekTarget > 0;
  }) : [];
  const currentBlocks = useMemo(() => currentWeek ? blocks.filter((block) =>
    block.weekNumber === currentWeek.weekNumber && weekDays.includes(block.date)
  ) : [], [blocks, currentWeek, weekDays]);
  const blocksByDate = useMemo(() => {
    const map = new Map<string, CalendarBlockWithTitle[]>();
    for (const block of currentBlocks) {
      const list = map.get(block.date) ?? [];
      list.push(block);
      map.set(block.date, list);
    }
    return map;
  }, [currentBlocks]);

  function canScheduleDate(date: string) {
    return Boolean(currentWeek && weekDays.includes(date) &&
      date >= cycleStart && date <= cycleEnd &&
      date >= currentWeek.startDate && date <= currentWeek.endDate);
  }

  function runAction(task: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not update the calendar");
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || !canScheduleDate(overId)) return;
    const activeId = String(event.active.id);
    if (activeId.startsWith("new:")) {
      const tacticId = activeId.slice("new:".length);
      const item = activeBacklog.find((entry) => entry.tacticId === tacticId);
      if (!item) return;
      const plannedValue = Number(
        blockValues[tacticId] ?? (item.executionStyle === "occurrence" ? 1 : item.weekTarget)
      );
      if (!Number.isFinite(plannedValue) || plannedValue <= 0) {
        setError("Choose a block size greater than 0 before scheduling");
        return;
      }
      const remaining = getRemainingForCalendarDate({
        tacticId,
        date: overId,
        weekTarget: item.weekTarget,
        blocks: currentBlocks
      });
      if (plannedValue > remaining) {
        setError(`Only ${remaining} ${item.unit ?? "units"} remain to schedule this week`);
        return;
      }
      runAction(() => addBlockAction({ tacticId, date: overId, plannedValue }));
      return;
    }
    const block = currentBlocks.find((entry) => entry.id === activeId);
    if (!block || block.date === overId) return;
    runAction(() => moveBlockAction({ blockId: activeId, toDate: overId }));
  }

  function handleDelete(blockId: string) {
    if (!currentBlocks.some((block) => block.id === blockId)) return;
    runAction(() => deleteBlockAction({ blockId }));
  }

  return (
    <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold tracking-tight text-ink">
            {currentWeek ? `Week ${currentWeek.weekNumber} of 12` : "Current week"}
          </h3>
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">
            {weekDays[0]} → {weekDays[6]}
          </p>
        </div>
        {!currentWeek ? (
          <p className="rounded-[12px] border border-border bg-surface px-4 py-2.5 text-sm text-ink-3">
            No current cycle week. Today is not in a week of the active cycle, so scheduling is unavailable.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-[12px] border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}
        {isPending ? (
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">Saving…</p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
          <section aria-label="Current week">
            <div className={isPending ? "pointer-events-none opacity-60" : undefined}>
              <div className="grid grid-cols-7 gap-2 max-sm:grid-cols-1">
                {weekDays.map((dateISO, index) => (
                  <CalendarDayCell
                    blocks={blocksByDate.get(dateISO) ?? []}
                    dateISO={dateISO}
                    dayNumber={parseDate(dateISO).getUTCDate()}
                    weekday={WEEKDAY_HEADERS[index]}
                    isToday={dateISO === today}
                    key={dateISO}
                    onDelete={handleDelete}
                    outOfCycle={!canScheduleDate(dateISO)}
                  />
                ))}
              </div>
            </div>
          </section>

          <aside
            aria-label="Tactics to schedule"
            className="h-fit rounded-[20px] border border-border bg-surface p-4"
          >
            <p className="eyebrow">Tactics</p>
            <p className="mt-1 text-sm text-ink-3">
              {activeBacklog.length
                ? `Set a block size, then drag the tactic onto a day (${activeBacklog.length}). Progress is measured in tactic units.`
                : "No active tactics to schedule this week."}
            </p>
            <div className="mt-3 space-y-2">
              {activeBacklog.map((item) => (
                <CalendarBlockCard
                  blockValue={
                    blockValues[item.tacticId] ??
                    String(item.executionStyle === "occurrence" ? 1 : item.weekTarget)
                  }
                  item={item}
                  key={item.tacticId}
                  onBlockValueChange={(value) =>
                    setBlockValues((current) => ({ ...current, [item.tacticId]: value }))
                  }
                  variant="backlog"
                />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </DndContext>
  );
}
