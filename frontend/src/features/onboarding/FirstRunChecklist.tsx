import { useQuery } from "@tanstack/react-query";
import { Check, Circle, Loader2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useAgent } from "@/features/agent/AgentProvider";
import { DEMO_PROMPT } from "@/lib/agent";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { useContacts, useInvoices } from "@/lib/queries";
import { useSettings } from "@/lib/settings";

type State = "done" | "todo" | "checking" | "failed";

/** Guided first run: is the backend up, which PayPal mode, add a payee, try the demo prompt. */
export function FirstRunChecklist() {
  const [settings, update] = useSettings();
  const { prefill } = useAgent();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, retry: 1, staleTime: 60_000 });
  const contacts = useContacts();
  const invoices = useInvoices();
  if (settings.onboardingDismissed) return null;

  const hasPayee = (contacts.data ?? []).some((c) => c.role === "contractor");
  const hasInvoice = (invoices.data ?? []).length > 0;
  const steps: { state: State; title: string; body: ReactNode }[] = [
    {
      state: health.isLoading ? "checking" : health.isSuccess ? "done" : "failed",
      title: health.isError ? "PaySasa server isn't reachable" : "PaySasa server connected",
      body: health.isError ? (
        <>
          Check that the backend is running and <code>VITE_API_BASE_URL</code> is right.{" "}
          <button type="button" className="text-accent underline" onClick={() => health.refetch()}>
            Check again
          </button>
        </>
      ) : (
        "Invoices, approvals and the assistant are available."
      ),
    },
    {
      state: "done",
      title: env.paypalMode === "sandbox" ? "PayPal sandbox mode" : "Mock PayPal mode",
      body:
        env.paypalMode === "sandbox"
          ? "Invoices and payouts use PayPal's sandbox. No real money moves."
          : "PayPal calls are simulated by the backend. No real money moves.",
    },
    {
      state: hasPayee ? "done" : "todo",
      title: "Add a payee",
      body: hasPayee ? (
        "You have someone to pay."
      ) : (
        <>
          Add a contractor (e.g. Sarah, “my editor”) on the{" "}
          <Link className="text-accent underline" to="/payees">
            Payees
          </Link>{" "}
          page.
        </>
      ),
    },
    {
      state: hasInvoice ? "done" : "todo",
      title: "Try the demo prompt",
      body: hasInvoice ? (
        "Your first invoice is out."
      ) : (
        <Button size="sm" variant="primary" className="mt-1" onClick={() => prefill(DEMO_PROMPT)}>
          Fill in Kwame's request
        </Button>
      ),
    },
  ];
  const done = steps.filter((s) => s.state === "done").length;

  return (
    <section aria-labelledby="onboard-h" className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-1">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 id="onboard-h" className="font-semibold">
            Get started <span className="font-normal text-muted">({done} of {steps.length} done)</span>
          </h2>
        </div>
        <button type="button" aria-label="Hide getting started" onClick={() => update({ onboardingDismissed: true })} className="rounded p-1 text-muted hover:bg-surface-2">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <li key={s.title} className="flex gap-2">
            <StepIcon state={s.state} />
            <div className="min-w-0 text-[13px]">
              <p className={cn("font-medium", s.state === "failed" && "text-danger")}>{s.title}</p>
              <div className="text-muted">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepIcon({ state }: { state: State }) {
  const label = { done: "Done", todo: "To do", checking: "Checking", failed: "Needs attention" }[state];
  return (
    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", state === "done" && "bg-success-soft text-success", state === "failed" && "bg-danger-soft text-danger", state === "todo" && "text-muted")}>
      {state === "done" ? <Check aria-hidden className="size-3.5" /> : state === "checking" ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : state === "failed" ? <X aria-hidden className="size-3.5" /> : <Circle aria-hidden className="size-4" />}
      <span className="sr-only">{label}</span>
    </span>
  );
}
