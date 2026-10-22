import { Radio, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { useConnectionStatus } from "@/lib/realtime";

const COPY = {
  live: { label: "Live", title: "Updates arrive in real time", icon: Radio, cls: "text-success" },
  connecting: { label: "Connecting", title: "Connecting to live updates", icon: RefreshCw, cls: "text-muted" },
  polling: { label: "Refreshing every 15s", title: "Live updates unavailable; checking for changes every 15 seconds", icon: RefreshCw, cls: "text-warning" },
  offline: { label: "Offline", title: "You're offline. Showing the last data we loaded.", icon: WifiOff, cls: "text-danger" },
};

export function ConnectionIndicator() {
  const status = useConnectionStatus();
  const c = COPY[status];
  const Icon = c.icon;
  return (
    <span role="status" title={c.title} className={cn("inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium", c.cls)}>
      <Icon aria-hidden className={cn("size-3.5", status === "connecting" && "animate-spin")} />
      <span className="hidden sm:inline">{c.label}</span>
      <span className="sr-only sm:hidden">{c.title}</span>
    </span>
  );
}
