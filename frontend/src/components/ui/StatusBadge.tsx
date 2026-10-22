import { AlertCircle, Ban, Check, Clock, Hourglass, Loader2, Lock, Pencil, Send, X, type LucideIcon } from "lucide-react";
import type { StatusDisplay, StatusIcon, Tone } from "@/lib/status";
import { cn } from "./cn";

const ICONS: Record<StatusIcon, LucideIcon> = {
  check: Check,
  clock: Clock,
  alert: AlertCircle,
  pencil: Pencil,
  ban: Ban,
  x: X,
  lock: Lock,
  hourglass: Hourglass,
  loader: Loader2,
  send: Send,
};

const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-2 text-muted",
  locked: "bg-locked-soft text-locked",
};

/** Status is always icon + text + colour, never colour alone. */
export function StatusBadge({ status, className, size = "md" }: { status: StatusDisplay; className?: string; size?: "sm" | "md" }) {
  const Icon = ICONS[status.icon];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-0.5 text-[13px]",
        TONES[status.tone],
        className,
      )}
    >
      <Icon aria-hidden className={cn("size-3.5 shrink-0", status.icon === "loader" && "animate-spin")} />
      {status.label}
    </span>
  );
}
