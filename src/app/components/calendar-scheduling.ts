const AMOUNT_SCALE = 1_000_000;

type VisibleCalendarBlock = {
  tacticId: string;
  date: string;
  plannedValue: number;
};

type CalendarSchedulingInput = {
  tacticId: string;
  date: string;
  weekTarget: number;
  blocks: VisibleCalendarBlock[];
};

function normalizeAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * AMOUNT_SCALE) / AMOUNT_SCALE;
}

function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfIsoWeek(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

export function getSchedulingForCalendarDate({
  tacticId,
  date,
  weekTarget,
  blocks
}: CalendarSchedulingInput): { scheduled: number; remaining: number } {
  const weekStart = startOfIsoWeek(date);
  const weekEnd = addDaysISO(weekStart, 6);
  const target = normalizeAmount(Math.max(weekTarget, 0));
  const scheduled = normalizeAmount(
    blocks.reduce((sum, block) => {
      if (block.tacticId !== tacticId || block.date < weekStart || block.date > weekEnd) return sum;
      const value = Number(block.plannedValue);
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0)
  );

  return {
    scheduled,
    remaining: normalizeAmount(Math.max(target - scheduled, 0))
  };
}

export function getRemainingForCalendarDate(input: CalendarSchedulingInput): number {
  return getSchedulingForCalendarDate(input).remaining;
}
