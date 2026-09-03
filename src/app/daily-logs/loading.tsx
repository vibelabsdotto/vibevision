export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-16 animate-pulse rounded-[20px] border border-border bg-surface" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="h-44 animate-pulse rounded-[20px] border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}
