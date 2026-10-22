import { ArrowRight, Check, Hourglass, Lock, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { formatTotals, totalsByCurrency } from "@/lib/money";
import type { PendingAction } from "@/types/api";
import { useInsightsData } from "./insightsContext";

const STAGES: { key: string; label: string; hint: string; match: (a: PendingAction) => boolean; icon: LucideIcon; tone: string }[] = [
  { key: "locked", label: "Locked", hint: "Waiting for the client to pay", match: (a) => a.status === "locked", icon: Lock, tone: "bg-locked-soft text-locked" },
  { key: "approval", label: "Needs approval", hint: "Client paid; waiting for you", match: (a) => a.status === "awaiting_approval", icon: Hourglass, tone: "bg-warning-soft text-warning" },
  { key: "paypal", label: "With PayPal", hint: "Approved; PayPal is processing", match: (a) => a.status === "executing" || a.status === "submitted", icon: Send, tone: "bg-info-soft text-info" },
  { key: "done", label: "Paid out", hint: "PayPal confirmed", match: (a) => a.status === "succeeded", icon: Check, tone: "bg-success-soft text-success" },
];

/**
 * Custom AG Studio widget: the payout guardrail as a pipeline. Every payout passes through a human approval
 * between "Locked" and "With PayPal". Totals are per currency, never summed across currencies.
 */
export function PipelineWidget() {
  const { actions } = useInsightsData();
  const payouts = actions.filter((a) => a.type === "payout");
  const closed = payouts.filter((a) => ["failed", "rejected", "cancelled"].includes(a.status)).length;
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-1">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Payout stages">
        {STAGES.map((s, i) => {
          const items = payouts.filter(s.match);
          const Icon = s.icon;
          return (
            <li key={s.key} className="relative flex items-start gap-2 rounded-[var(--radius-card)] border border-border p-3">
              <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full", s.tone)}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">
                  {s.label} <span className="font-normal text-muted">({items.length})</span>
                </p>
                <p className="tabular text-[15px] font-semibold break-words">{formatTotals(totalsByCurrency(items)) || "-"}</p>
                <p className="text-xs text-muted">{s.hint}</p>
              </div>
              {i < STAGES.length - 1 && (
                <ArrowRight aria-hidden className="absolute top-1/2 -right-3 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-surface text-muted md:block" />
              )}
            </li>
          );
        })}
      </ol>
      {closed > 0 && <p className="text-xs text-muted">{closed} payout{closed === 1 ? " was" : "s were"} rejected, cancelled or failed.</p>}
    </div>
  );
}
