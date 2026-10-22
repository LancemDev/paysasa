import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4", className)} />;
}

export function SkeletonRows({ rows = 6, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="hidden h-4 w-20 sm:block" />
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function FullPageSkeleton() {
  return (
    <div role="status" aria-label="Loading PaySasa" className="flex min-h-full flex-col">
      <div className="h-14 border-b border-border bg-surface" />
      <div className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Skeleton className="mb-6 h-7 w-48" />
        <SkeletonRows rows={8} />
      </div>
    </div>
  );
}
