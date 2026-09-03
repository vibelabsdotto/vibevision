import { completeTacticAction } from "@/app/actions";
import { TacticStepper } from "@/app/components/tactic-stepper";
import { ProgressBar } from "@/app/components/ui";
import { formatAmount, type TodayTacticProgress } from "@/app/core";

type ExecutionStyle = "toggle" | "occurrence" | "volume";

function executionStyleOf(tactic: TodayTacticProgress): ExecutionStyle {
  const provided = (tactic as Partial<Record<"executionStyle", unknown>>).executionStyle;
  if (provided === "toggle" || provided === "occurrence" || provided === "volume") return provided;
  return tactic.trackingType === "boolean" ? "toggle" : "volume";
}

function weekPoolOf(tactic: TodayTacticProgress): { remaining: number; target: number } {
  const row = tactic as TodayTacticProgress & Partial<Record<"weekRemaining" | "weekTarget", unknown>>;
  const remaining = typeof row.weekRemaining === "number" ? row.weekRemaining : tactic.todayRemaining;
  const target = typeof row.weekTarget === "number" ? row.weekTarget : tactic.planned;
  return { remaining, target };
}

export function TacticDayCard({ tactic }: { tactic: TodayTacticProgress }) {
  const style = executionStyleOf(tactic);
  // todayTarget is null for occurrence rows once core lands; never render it there.
  const todayTarget = tactic.todayTarget ?? 0;

  if (style === "occurrence") {
    const pool = weekPoolOf(tactic);
    return (
      <div className="rounded-[16px] border border-border bg-surface-2/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{tactic.tacticTitle}</p>
            <p className="mt-1 text-sm text-ink-3">
              {tactic.todayLabel} · {tactic.goalTitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <TacticStepper tacticId={tactic.tacticId} unit={tactic.unit} />
          </div>
        </div>
        <p className="mt-2 text-sm text-ink-3">
          {formatAmount(pool.remaining)} von {formatAmount(pool.target)} offen
          {(tactic.scheduled ?? 0) > 0 ? ` · ${tactic.scheduled} scheduled` : ""}
        </p>
      </div>
    );
  }

  const isToggle = style === "toggle";
  return (
    <div className="rounded-[16px] border border-border bg-surface-2/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{tactic.tacticTitle}</p>
          <p className="mt-1 text-sm text-ink-3">
            {tactic.todayLabel} · {tactic.goalTitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isToggle ? (
            <form action={completeTacticAction}>
              <input name="tacticId" type="hidden" value={tactic.tacticId} />
              <button
                aria-label={tactic.isTodayComplete ? `Mark ${tactic.tacticTitle} done again` : `Mark ${tactic.tacticTitle} done`}
                className="inline-flex h-7 items-center justify-center rounded-[8px] bg-teal px-3 text-xs font-semibold text-white transition hover:opacity-90 active:scale-95"
                type="submit"
              >
                Done
              </button>
            </form>
          ) : (
            <TacticStepper tacticId={tactic.tacticId} unit={tactic.unit} />
          )}
          {isToggle ? null : (
            <span className="text-sm text-ink-2">
              {formatAmount(tactic.todayActual)}/{formatAmount(todayTarget)} {tactic.unit}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar
          tone={tactic.isTodayComplete ? "teal" : "coral"}
          value={Math.min(Math.max(todayTarget > 0 ? tactic.todayActual / todayTarget : 0, 0), 1)}
        />
      </div>
      <p className="mt-2 text-sm text-ink-3">
        {tactic.isTodayComplete ? "Done for today." : `${formatAmount(tactic.todayRemaining)} ${tactic.unit} left today.`}
      </p>
    </div>
  );
}
