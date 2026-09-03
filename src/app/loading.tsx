export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-40 animate-pulse rounded-[20px] border border-border bg-surface" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-32 animate-pulse rounded-[20px] border border-border bg-surface" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[20px] border border-border bg-surface" />
      <div className="h-64 animate-pulse rounded-[20px] border border-border bg-surface" />
    </div>
  );
}