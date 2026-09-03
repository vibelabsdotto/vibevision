import { stepEntryAction } from "@/app/actions";

const miniButtonClasses =
  "inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-border bg-surface text-sm font-semibold text-ink transition hover:border-teal hover:text-teal active:scale-95";

export function TacticStepper({ tacticId, unit }: { tacticId: string; unit?: string | null }) {
  const suffix = unit ? ` ${unit}` : "";
  return (
    <div className="flex items-center gap-1">
      <form action={stepEntryAction}>
        <input name="tacticId" type="hidden" value={tacticId} />
        <input name="delta" type="hidden" value="-1" />
        <button aria-label={`Subtract 1${suffix}`} className={miniButtonClasses} type="submit">
          −
        </button>
      </form>
      <form action={stepEntryAction}>
        <input name="tacticId" type="hidden" value={tacticId} />
        <input name="delta" type="hidden" value="1" />
        <button aria-label={`Add 1${suffix}`} className={miniButtonClasses} type="submit">
          +
        </button>
      </form>
    </div>
  );
}
