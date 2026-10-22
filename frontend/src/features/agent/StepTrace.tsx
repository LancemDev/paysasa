import { Check, CircleAlert, Loader2 } from "lucide-react";
import type { AgentStep } from "@/lib/agent";
import { cn } from "@/components/ui/cn";

/** Transparent record of what the agent did, one line per tool call. */
export function StepTrace({ steps, running }: { steps: AgentStep[]; running: boolean }) {
  const all: AgentStep[] = [
    { id: "understood", label: running && steps.length === 0 ? "Reading your request" : "Understood request", status: running && steps.length === 0 ? "running" : "done" },
    ...steps,
    ...(running && steps.length > 0 ? [{ id: "working", label: "Working…", status: "running" as const }] : []),
  ];
  return (
    <ol aria-label="What PaySasa did" className="flex flex-col gap-1.5 text-[13px]">
      {all.map((s) => (
        <li key={s.id} className="animate-in flex items-start gap-2">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
              s.status === "done" && "bg-success-soft text-success",
              s.status === "error" && "bg-danger-soft text-danger",
              s.status === "running" && "text-info",
            )}
          >
            {s.status === "done" ? <Check className="size-3" /> : s.status === "error" ? <CircleAlert className="size-3" /> : <Loader2 className="size-3.5 animate-spin" />}
          </span>
          <span className="min-w-0">
            <span className={cn(s.status === "error" && "text-danger")}>{s.label}</span>
            <span className="sr-only">{s.status === "done" ? " (done)" : s.status === "error" ? " (failed)" : " (in progress)"}</span>
            {s.detail && <span className="block break-words text-muted">{s.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
