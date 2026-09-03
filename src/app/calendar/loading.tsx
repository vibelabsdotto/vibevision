export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-24 animate-pulse rounded-[20px] border border-border bg-surface" />
      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <div className="rounded-[20px] border border-border bg-surface p-4 sm:p-5">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <div className="h-4 animate-pulse rounded bg-surface-2" key={index} />
            ))}
            {Array.from({ length: 35 }).map((_, index) => (
              <div className="h-24 animate-pulse rounded-[12px] bg-surface-2" key={index} />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-[20px] border border-border bg-surface p-4">
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="h-14 animate-pulse rounded-[12px] bg-surface-2" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
