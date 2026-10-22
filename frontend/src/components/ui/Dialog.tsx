import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Prevent closing via Esc/outside click (e.g. while a payout request is in flight). */
  locked?: boolean;
}

const overlay = "fixed inset-0 z-50 bg-black/40 animate-in";

export function Modal({ open, onOpenChange, title, description, children, locked, className }: BaseProps & { className?: string }) {
  return (
    <RD.Root open={open} onOpenChange={(o) => (!locked || o) && onOpenChange(o)}>
      <RD.Portal>
        <RD.Overlay className={overlay} />
        <RD.Content
          onEscapeKeyDown={(e) => locked && e.preventDefault()}
          onPointerDownOutside={(e) => locked && e.preventDefault()}
          className={cn(
            "animate-in fixed z-50 flex max-h-[92dvh] flex-col overflow-hidden bg-surface shadow-2",
            "inset-x-0 bottom-0 rounded-t-[var(--radius-sheet)] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-sheet)]",
            className,
          )}
        >
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <RD.Title className="text-lg font-semibold">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-0.5 text-muted">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">Dialog</RD.Description>
              )}
            </div>
            {!locked && (
              <RD.Close aria-label="Close" className="-mr-1 rounded p-1.5 text-muted hover:bg-surface-2">
                <X aria-hidden className="size-5" />
              </RD.Close>
            )}
          </header>
          <div className="overflow-y-auto">{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** Right-side drawer on desktop, full-screen sheet on mobile. */
export function Drawer({ open, onOpenChange, title, description, children, wide }: BaseProps & { wide?: boolean }) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className={overlay} />
        <RD.Content
          className={cn(
            "slide-in-right fixed inset-0 z-50 flex flex-col bg-surface shadow-2 sm:inset-y-0 sm:right-0 sm:left-auto sm:border-l sm:border-border",
            wide ? "sm:w-[34rem]" : "sm:w-[28rem]",
          )}
        >
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <RD.Title className="text-lg font-semibold">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-0.5 text-muted">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">Details</RD.Description>
              )}
            </div>
            <RD.Close aria-label="Close" className="-mr-1 rounded p-1.5 text-muted hover:bg-surface-2">
              <X aria-hidden className="size-5" />
            </RD.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
