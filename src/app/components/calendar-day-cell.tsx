"use client";

import { useDroppable } from "@dnd-kit/core";

import { CalendarBlockCard, type CalendarBlockWithTitle } from "@/app/components/calendar-block-card";

export function CalendarDayCell({
  dateISO,
  dayNumber,
  weekday,
  isToday,
  outOfCycle,
  blocks,
  onDelete
}: {
  dateISO: string;
  dayNumber: number;
  weekday: string;
  isToday: boolean;
  outOfCycle: boolean;
  blocks: CalendarBlockWithTitle[];
  onDelete: (blockId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateISO, disabled: outOfCycle });
  const sorted = [...blocks].sort(
    (a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99") || a.id.localeCompare(b.id)
  );

  return (
    <div
      aria-current={isToday ? "date" : undefined}
      aria-label={`Schedule for ${dateISO}`}
      className={`flex min-h-24 flex-col gap-1.5 rounded-[12px] border p-1.5 transition sm:min-h-28 ${
        isOver
          ? "border-teal bg-teal/5"
          : outOfCycle
            ? "border-dashed border-border bg-surface-2/30"
            : "border-border bg-surface-2/40"
      }`}
      ref={setNodeRef}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">{weekday}</span>
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
            isToday ? "bg-teal font-semibold text-white" : outOfCycle ? "text-ink-3" : "text-ink-2"
          }`}
        >
          {dayNumber}
        </span>
      </div>
      {sorted.map((block) => (
        <CalendarBlockCard block={block} key={block.id} onDelete={onDelete} variant="scheduled" />
      ))}
    </div>
  );
}
