import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useAgent } from "@/features/agent/AgentProvider";
import { DEMO_PROMPT } from "@/lib/agent";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { useActions, useContacts, useInvoices } from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import { useWorkspace } from "@/lib/workspace";

interface Step {
  title: string;
  done: boolean;
  /** Shown only on the current (first unfinished) step. */
  next: ReactNode;
}

/**
 * "Your payment cycle": the user story as a live progress tracker, derived from real data. It shows one next
 * action at a time, which doubles as first-run onboarding and as the spine of the demo.
 */
export function FirstRunChecklist() {
  const [settings, update] = useSettings();
  const { prefill } = useAgent();
  const { openApproval } = useWorkspace();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, retry: 1, staleTime: 60_000 });
  const contacts = useContacts().data ?? [];
  const invoices = useInvoices().data ?? [];
  const actions = useActions().data ?? [];
  if (settings.onboardingDismissed) return null;

  const payouts = actions.filter((a) => a.type === "payout");
  const awaiting = payouts.find((a) => a.status === "awaiting_approval");
  const steps: Step[] = [
    {
      title: "Connect",
      done: health.isSuccess && contacts.some((c) => c.role === "contractor"),
      next: health.isError ? (
        <>
          PaySasa's server isn't reachable.{" "}
          <button type="button" className="text-accent underline" onClick={() => health.refetch()}>
            Check again
          </button>
        </>
      ) : (
        <>
          Add someone you pay on the{" "}
          <Link className="text-accent underline" to="/payees">
            Payees
          </Link>{" "}
          page, e.g. Sarah, “my editor”.
        </>
      ),
    },
    {
      title: "Invoice sent",
      done: invoices.some((i) => i.status === "sent" || i.status === "paid"),
      next: (
        <Button size="sm" variant="primary" onClick={() => prefill(DEMO_PROMPT)}>
          Fill in Kwame's request
        </Button>
      ),
    },
    {
      title: "Payout scheduled",
      done: payouts.length > 0,
      next: "Ask PaySasa to pay a collaborator a share once the invoice is paid.",
    },
    {
      title: "Client paid",
      done: invoices.some((i) => i.status === "paid" && payouts.some((p) => p.trigger_invoice_id === i.id)),
      next: env.enableDemo ? "Waiting for the client. In the demo, use Demo helper → Mark as paid." : "Waiting for your client to pay through PayPal.",
    },
    {
      title: "You approved",
      done: payouts.some((a) => ["executing", "submitted", "succeeded"].includes(a.status)),
      next: awaiting ? (
        <Button size="sm" variant="primary" onClick={() => openApproval(awaiting.id)}>
          Review the payout
        </Button>
      ) : (
        "A payout is ready for your approval."
      ),
    },
    {
      title: "Sent via PayPal",
      done: payouts.some((a) => a.status === "submitted" || a.status === "succeeded"),
      next: "PayPal is processing the payout.",
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  const allDone = current === -1;

  return (
    <section aria-labelledby="cycle-h" className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-1">
      <div className="flex items-start gap-2">
        <h2 id="cycle-h" className="flex-1 font-semibold">
          Your payment cycle{" "}
          <span className="font-normal text-muted">
            ({steps.filter((s) => s.done).length} of {steps.length})
          </span>
        </h2>
        <button type="button" aria-label="Hide payment cycle" onClick={() => update({ onboardingDismissed: true })} className="rounded p-1 text-muted hover:bg-surface-2">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-y-3 sm:grid-cols-6">
        {steps.map((s, i) => (
          <li key={s.title} aria-current={i === current ? "step" : undefined} className="flex flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "invisible" : steps[i - 1].done ? "bg-accent" : "bg-border")} />
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold",
                  s.done ? "border-accent bg-accent text-accent-fg" : i === current ? "border-accent text-accent" : "border-border text-muted",
                )}
              >
                {s.done ? <Check aria-hidden className="size-4" /> : i + 1}
              </span>
              <span className={cn("h-0.5 flex-1", i === steps.length - 1 ? "invisible" : s.done ? "bg-accent" : "bg-border")} />
            </div>
            <span className={cn("text-xs", i === current ? "font-semibold" : "text-muted")}>
              {s.title}
              <span className="sr-only">{s.done ? " (done)" : i === current ? " (current step)" : " (not started)"}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex min-h-9 flex-wrap items-center gap-2 rounded-[var(--radius-input)] bg-surface-2 px-3 py-2 text-[13px]" aria-live="polite">
        {allDone ? (
          <span className="flex items-center gap-2">
            <Check aria-hidden className="size-4 text-success" /> Full cycle complete: invoiced, paid, approved and sent via PayPal.
          </span>
        ) : (
          <>
            <span className="font-semibold">Next:</span> {steps[current].next}
          </>
        )}
      </div>
    </section>
  );
}
