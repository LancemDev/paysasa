import type { ReactNode } from "react";

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && <div className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <div className="max-w-md text-muted">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-4 flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4 text-sm sm:flex-row sm:items-center">
      <p className="flex-1 text-fg">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium text-danger underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}
