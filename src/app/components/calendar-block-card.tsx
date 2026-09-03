"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, X } from "lucide-react";

export type CalendarBlockWithTitle = {
  id: string;
  tacticId: string;
  cycleId: string;
  weekNumber: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  plannedValue: number;
  note: string | null;
  tacticTitle: string;
  goalTitle: string;
  trackingType?: string | null;
  executionStyle?: string | null;
};

export type BacklogTactic = {
  tacticId: string;
  title: string;
  goalTitle: string | null;
  trackingType: string | null;
  executionStyle?: string | null;
  unit: string | null;
};

type ExecutionStyle = "toggle" | "occurrence" | "volume";

function executionStyleOf(input: { executionStyle?: string | null; trackingType?: string | null }): ExecutionStyle {
  const provided = input.executionStyle;
  if (provided === "toggle" || provided === "occurrence" || provided === "volume") return provided;
  return input.trackingType === "boolean" ? "toggle" : "volume";
}

function formatMeta(block: Pick<CalendarBlockWithTitle, "startTime" | "endTime" | "durationMinutes" | "plannedValue">): string | null {
  const parts: string[] = [];
  if (block.startTime) {
    parts.push(block.endTime ? `${block.startTime}–${block.endTime}` : block.startTime);
  }
  if (block.durationMinutes != null) {
    parts.push(`${block.durationMinutes}m`);
  }
  if (Number.isFinite(block.plannedValue) && block.plannedValue > 0) {
    parts.push(`×${block.plannedValue}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

type CardProps =
  | { variant: "scheduled"; block: CalendarBlockWithTitle; onDelete: (blockId: string) => void }
  | { variant: "backlog"; item: BacklogTactic };

export function CalendarBlockCard(props: CardProps) {
  const dragId = props.variant === "scheduled" ? props.block.id : `new:${props.item.tacticId}`;
  const title = props.variant === "scheduled" ? props.block.tacticTitle : props.item.title;
  const meta = props.variant === "scheduled" ? formatMeta(props.block) : props.item.goalTitle;
  // Toggles can't be scheduled anymore; if one is rendered anyway, keep it inert (no drag handle).
  const isToggle =
    props.variant === "scheduled" ? executionStyleOf(props.block) === "toggle" : executionStyleOf(props.item) === "toggle";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId, disabled: isToggle });

  return (
    <div
      className={`flex items-start gap-1.5 rounded-[10px] border border-border bg-surface-2/60 px-2 py-1.5 text-left ${
        isDragging ? "opacity-40 ring-2 ring-teal/50" : ""
      }`}
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
    >
      {isToggle ? null : (
        <span
          aria-label={`Drag ${title}`}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-ink-3 transition hover:text-ink active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-ink">{title}</span>
        {meta ? <span className="block truncate font-mono text-[10px] tracking-wide text-ink-3">{meta}</span> : null}
      </span>
      {props.variant === "scheduled" ? (
        <button
          aria-label={`Delete ${props.block.tacticTitle} block`}
          className="shrink-0 rounded p-1 text-ink-3 transition hover:bg-error/10 hover:text-error"
          onClick={() => props.onDelete(props.block.id)}
          type="button"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}
