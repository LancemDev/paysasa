import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICON = { success: CheckCircle2, error: XCircle, info: Info };
const TONE = { success: "text-success", error: "text-danger", info: "text-info" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-3), { id, tone, title, description }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 5000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push("success", t, d),
      error: (t, d) => push("error", t, d),
      info: (t, d) => push("info", t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Two live regions: errors interrupt (assertive), everything else waits (polite). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-3 lg:bottom-4 lg:items-end lg:pr-4">
        <div aria-live="polite" className="contents">
          {items.filter((t) => t.tone !== "error").map((t) => <ToastView key={t.id} item={t} onDismiss={dismiss} />)}
        </div>
        <div aria-live="assertive" className="contents">
          {items.filter((t) => t.tone === "error").map((t) => <ToastView key={t.id} item={t} onDismiss={dismiss} />)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const Icon = ICON[item.tone];
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className="animate-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-2"
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", TONE[item.tone])} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{item.title}</p>
        {item.description && <p className="mt-0.5 text-[13px] text-muted">{item.description}</p>}
      </div>
      <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(item.id)} className="rounded p-1 text-muted hover:bg-surface-2">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
