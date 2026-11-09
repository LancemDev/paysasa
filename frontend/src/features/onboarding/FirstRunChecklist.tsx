import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import { useT } from "@/lib/i18n";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useAgent } from "@/features/agent/AgentProvider";
import { DEMO_PROMPT } from "@/lib/agent";
import { api } from "@/lib/api";
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
  const t = useT();
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
      title: t("cycle.connect"),
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
      title: t("cycle.invoice"),
      done: invoices.some((i) => i.status === "sent" || i.status === "paid"),
      next: (
        <Button size="sm" variant="primary" onClick={() => prefill(DEMO_PROMPT)}>
          {t("dash.fillKwame")}
        </Button>
      ),
    },
    {
      title: t("cycle.payout"),
      done: payouts.length > 0,
      next: t("cycle.nextPayout"),
    },
    {
      title: t("cycle.paid"),
      done: invoices.some((i) => i.status === "paid" && payouts.some((p) => p.trigger_invoice_id === i.id)),
      next: t("cycle.nextWait"),
    },
    {
      title: t("cycle.approved"),
      done: payouts.some((a) => ["executing", "submitted", "succeeded"].includes(a.status)),
      next: awaiting ? (
        <Button size="sm" variant="primary" onClick={() => openApproval(awaiting.id)}>
          {t("cycle.review")}
        </Button>
      ) : (
        t("cycle.ready")
      ),
    },
    {
      title: t("cycle.sent"),
      done: payouts.some((a) => a.status === "submitted" || a.status === "succeeded"),
      next: t("cycle.processing"),
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  const allDone = current === -1;

  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section data-tour="cycle" aria-labelledby="cycle-h" className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-4">
        <h2 id="cycle-h" className="flex-1 text-[14px] font-semibold">
          {t("dash.cycle")}{" "}
          <span className="font-normal text-muted">
            ({doneCount} {t("cycle.of")} {steps.length})
          </span>
        </h2>
        <button type="button" aria-label="Hide payment cycle" onClick={() => update({ onboardingDismissed: true })} className="rounded-lg p-1 text-muted hover:bg-surface-2">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <ol className="grid grid-cols-3 gap-y-4 px-3 pt-4 pb-4 sm:grid-cols-6">
        {steps.map((s, i) => (
          <li key={s.title} aria-current={i === current ? "step" : undefined} className="flex flex-col items-center gap-2 text-center">
            <div className="flex w-full items-center">
              <Connector hidden={i === 0} done={i > 0 && steps[i - 1].done} />
              <span
                className={cn(
                  "relative grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold transition-colors duration-300",
                  s.done ? "border-forest bg-forest text-lime dark:border-lime dark:bg-lime dark:text-ink-on-lime" : i === current ? "border-forest bg-surface text-fg dark:border-lime" : "border-border bg-surface-2 text-subtle",
                )}
              >
                {i === current && <span aria-hidden className="absolute -inset-1.5 rounded-full bg-lime/40 blur-[3px] dark:bg-lime/20" />}
                <span className="relative">{s.done ? <Check aria-hidden className="size-4" /> : i + 1}</span>
              </span>
              <Connector hidden={i === steps.length - 1} done={s.done} />
            </div>
            <span className={cn("text-[12.5px]", i === current ? "font-semibold" : s.done ? "text-fg" : "text-muted")}>
              {s.title}
              <span className="sr-only">{s.done ? " (done)" : i === current ? " (current step)" : " (not started)"}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-border bg-surface-2 px-5 py-2.5 text-[13px]" aria-live="polite">
        {allDone ? (
          <span className="flex items-center gap-2">
            <Check aria-hidden className="size-4 text-success" /> {t("cycle.done")}
          </span>
        ) : (
          <>
            <span className="font-semibold">{t("dash.next")}:</span> {steps[current].next}
          </>
        )}
      </div>
    </section>
  );
}

function Connector({ hidden, done }: { hidden: boolean; done: boolean }) {
  return (
    <span className={cn("relative h-[2px] flex-1 overflow-hidden rounded-full bg-transparent sm:bg-border", hidden && "invisible")}>
      <motion.span
        className="absolute inset-0 hidden origin-left bg-forest sm:block dark:bg-lime"
        initial={false}
        animate={{ scaleX: done ? 1 : 0 }}
        transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
      />
    </span>
  );
}
