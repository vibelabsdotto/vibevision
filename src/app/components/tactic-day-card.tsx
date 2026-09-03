import { addEntryAction, stepEntryAction } from "@/app/actions";
import { ProgressBar, buttonClasses, inputClasses, outlineButtonClasses } from "@/app/components/ui";
import type { TodayTacticProgress } from "@/app/core";

export function TacticDayCard({ tactic }: { tactic: TodayTacticProgress }) {
  return (
    <div className="rounded-[16px] border border-border bg-surface-2/50 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <strong className="font-display text-lg font-bold tracking-tight">{tactic.tacticTitle}</strong>
          <p className="mt-1 text-sm text-ink-3">{tactic.goalTitle}</p>
        </div>
        <div className="text-sm text-ink-3">{tactic.isTodayComplete ? "Done for today" : `${tactic.todayRemaining} remaining today`}</div>
      </div>
      <p className="mt-3 text-sm text-ink-3">{tactic.todayLabel}</p>
      <p className="mt-1 text-sm text-ink-2">
        Today: {tactic.todayActual}/{tactic.todayTarget} {tactic.unit} • Week: {tactic.actual}/{tactic.planned} {tactic.unit}
      </p>
      <div className="mt-4">
        <ProgressBar tone={tactic.isTodayComplete ? "teal" : "coral"} value={tactic.todayTarget > 0 ? tactic.todayActual / tactic.todayTarget : 0} />
      </div>
      {tactic.scheduledBlocks.length ? (
        <p className="mt-3 text-sm text-ink-3">Blocks: {tactic.scheduledBlocks.map((block) => block.startTime ?? "Any time").join(", ")}</p>
      ) : null}

      {tactic.trackingType === "boolean" ? (
        <form action={addEntryAction} className="mt-4">
          <input name="tacticId" type="hidden" value={tactic.tacticId} />
          <input name="mode" type="hidden" value="complete" />
          <button className={buttonClasses} type="submit">
            {tactic.isTodayComplete ? "Mark again" : "Complete today's occurrence"}
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <form action={stepEntryAction}>
              <input name="tacticId" type="hidden" value={tactic.tacticId} />
              <input name="delta" type="hidden" value="-1" />
              <button aria-label={`Subtract 1 ${tactic.unit}`} className={outlineButtonClasses} type="submit">
                −
              </button>
            </form>
            <form action={stepEntryAction}>
              <input name="tacticId" type="hidden" value={tactic.tacticId} />
              <input name="delta" type="hidden" value="1" />
              <button aria-label={`Add 1 ${tactic.unit}`} className={outlineButtonClasses} type="submit">
                +
              </button>
            </form>
            <span className="text-sm text-ink-3">Quick ±1 {tactic.unit}</span>
          </div>
          <form action={addEntryAction} className="flex flex-col gap-2 sm:flex-row">
            <input name="tacticId" type="hidden" value={tactic.tacticId} />
            <input name="mode" type="hidden" value="progress" />
            <input
              aria-label={`Add ${tactic.unit}`}
              className={inputClasses}
              defaultValue={tactic.todayRemaining > 0 ? Math.min(tactic.todayRemaining, 1) : 1}
              min="0"
              name="value"
              step="0.1"
              type="number"
            />
            <input aria-label="Note" className={inputClasses} name="note" placeholder="Optional context" />
            <button className={buttonClasses} type="submit">
              {tactic.isTodayComplete ? "Add extra progress" : "Log today's progress"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
