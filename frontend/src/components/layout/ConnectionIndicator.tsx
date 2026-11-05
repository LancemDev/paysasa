import { Radio, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { useConnectionStatus } from "@/lib/realtime";
import { useT, type MsgKey } from "@/lib/i18n";

const COPY = {
  live: { label: "Live", title: "Updates arrive in real time", icon: Radio, cls: "text-success" },
  connecting: { label: "Connecting", title: "Connecting to live updates", icon: RefreshCw, cls: "text-muted" },
  polling: { label: "Refreshing every 15s", title: "Live updates unavailable; checking for changes every 15 seconds", icon: RefreshCw, cls: "text-muted" },
  offline: { label: "Offline", title: "You're offline. Showing the last data we loaded.", icon: WifiOff, cls: "text-danger" },
};

export function ConnectionIndicator() {
  const status = useConnectionStatus();
  const c = COPY[status];
  const t = useT();
  const Icon = c.icon;
  return (
    <span role="status" title={c.title} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-xs font-medium", c.cls)}>
      <Icon aria-hidden className={cn("size-3.5", status === "connecting" && "animate-spin")} />
      <span className="hidden sm:inline">{t(`conn.${status}` as MsgKey)}</span>
      <span className="sr-only sm:hidden">{c.title}</span>
    </span>
  );
}
