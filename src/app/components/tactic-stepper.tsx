import { stepEntryAction } from "@/app/actions";
import { formatAmount, getTacticStepDelta } from "@/app/core";

const miniButtonClasses =
  "inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-border bg-surface text-sm font-semibold text-ink transition hover:border-teal hover:text-teal active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-ink disabled:active:scale-100";

export function TacticStepper({
  tacticId,
  todayActual,
  todayTarget,
  unit
}: {
  tacticId: string;
  todayActual: number;
  todayTarget: number;
  unit?: string | null;
}) {
  const suffix = unit ? ` ${unit}` : "";
  const decreaseDelta = getTacticStepDelta({ direction: "decrease", todayActual, todayTarget });
  const increaseDelta = getTacticStepDelta({ direction: "increase", todayActual, todayTarget });
  return (
    <div className="flex items-center gap-1">
      <form action={stepEntryAction}>
        <input name="tacticId" type="hidden" value={tacticId} />
        <input name="delta" type="hidden" value={formatAmount(decreaseDelta)} />
        <button
          aria-label={`Subtract ${formatAmount(Math.abs(decreaseDelta))}${suffix}`}
          className={miniButtonClasses}
          disabled={decreaseDelta === 0}
          type="submit"
        >
          −
        </button>
      </form>
      <form action={stepEntryAction}>
        <input name="tacticId" type="hidden" value={tacticId} />
        <input name="delta" type="hidden" value={formatAmount(increaseDelta)} />
        <button
          aria-label={`Add ${formatAmount(increaseDelta)}${suffix}`}
          className={miniButtonClasses}
          disabled={increaseDelta === 0}
          type="submit"
        >
          +
        </button>
      </form>
    </div>
  );
}
