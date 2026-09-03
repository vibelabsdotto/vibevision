import { eveningAction, morningAction } from "@/app/actions";
import { buttonClasses, inputClasses } from "@/app/components/ui";
import type { DailyLog } from "@/app/core";

export function DailyCheckin({ log }: { log: DailyLog | null }) {
  return (
    <div>
      <p className="mt-4 text-sm text-ink-2">
        Morning: {log?.morningDone ? "logged" : "pending"} • Evening: {log?.eveningDone ? "logged" : "pending"}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <form action={morningAction} className="rounded-[16px] border border-border bg-surface-2/50 p-5">
          <p className="eyebrow">Morning</p>
          <label className="mt-3 block text-sm text-ink-2">
            One thing
            <input className={`${inputClasses} mt-2`} defaultValue={log?.oneThing ?? undefined} name="oneThing" placeholder="What is the one thing today?" />
          </label>
          <label className="mt-3 block text-sm text-ink-2">
            Stress 1–10
            <input className={`${inputClasses} mt-2`} defaultValue={log?.stressLevel ?? undefined} max={10} min={1} name="stress" type="number" />
          </label>
          <button className={`${buttonClasses} mt-4 w-full`} type="submit">
            Log morning
          </button>
        </form>
        <form action={eveningAction} className="rounded-[16px] border border-border bg-surface-2/50 p-5">
          <p className="eyebrow">Evening</p>
          <label className="mt-3 block text-sm text-ink-2">
            Agency 1–10
            <input className={`${inputClasses} mt-2`} defaultValue={log?.agencyScore ?? undefined} max={10} min={1} name="agency" type="number" />
          </label>
          <label className="mt-3 block text-sm text-ink-2">
            Stress 1–10
            <input className={`${inputClasses} mt-2`} defaultValue={log?.stressLevel ?? undefined} max={10} min={1} name="stress" type="number" />
          </label>
          <label className="mt-3 block text-sm text-ink-2">
            Wins
            <input className={`${inputClasses} mt-2`} defaultValue={log?.privateVictories ?? undefined} name="wins" placeholder="Private victories" />
          </label>
          <label className="mt-3 block text-sm text-ink-2">
            Avoidance
            <input className={`${inputClasses} mt-2`} defaultValue={log?.avoidanceTrigger ?? undefined} name="avoidance" placeholder="What did you avoid?" />
          </label>
          <label className="mt-3 block text-sm text-ink-2">
            Deep work minutes
            <input className={`${inputClasses} mt-2`} defaultValue={log?.deepWorkMinutes ?? undefined} min={0} name="deepWorkMinutes" type="number" />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
            <input defaultChecked={log?.comfortZoneDone ?? false} name="comfortZoneDone" type="checkbox" /> Comfort zone done
          </label>
          <button className={`${buttonClasses} mt-4 w-full`} type="submit">
            Log evening
          </button>
        </form>
      </div>
    </div>
  );
}
