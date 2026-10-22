import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FlaskConical } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { inputClass } from "@/components/ui/Field";
import { useAgent } from "@/features/agent/AgentProvider";
import { DEMO_PROMPT } from "@/lib/agent";
import { ApiError, api } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { qk, useContacts, useContactsById, useInvoices } from "@/lib/queries";

/**
 * Rehearsal helper for the demo video. Clearly labelled, only shown with VITE_ENABLE_DEMO=true, and it calls
 * the real backend: /api/contacts, the agent, and the backend's own /dev routes (ENABLE_DEV_ROUTES=true).
 */
export function DemoPanel() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section aria-label="Demo helper" className="rounded-[var(--radius-card)] border border-dashed border-warning/60 bg-warning-soft/40">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <FlaskConical aria-hidden className="size-4 text-warning" />
        <span className="flex-1">
          <span className="font-semibold">Demo helper</span>
          <span className="ml-2 text-[13px] text-muted">For rehearsals: not part of the product. Uses the backend's test routes.</span>
        </span>
        <ChevronDown aria-hidden className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={panelId} className="grid gap-4 border-t border-warning/30 p-4 md:grid-cols-2 xl:grid-cols-4">
          <SeedContacts />
          <SendPrompt />
          <SimulatePayment />
          <RunChase />
          <p className="text-xs text-muted md:col-span-2 xl:col-span-4">
            Payout completion (“Submitted to PayPal” → “Paid out”) arrives through a PayPal webhook. The mock backend has no simulator for it, so in mock
            mode payouts honestly stay at “Submitted to PayPal”.
          </p>
        </div>
      )}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface p-3">
      <p className="text-[13px] font-semibold">
        <span className="mr-1 text-muted">{n}.</span>
        {title}
      </p>
      {children}
    </div>
  );
}

function devError(e: unknown): string {
  if (e instanceof ApiError && e.status === 404 && e.code === "not_found" && /Not Found/i.test(e.detail))
    return "The backend's demo routes are off (ENABLE_DEV_ROUTES=false).";
  return e instanceof ApiError ? e.friendly : "That didn't work.";
}

function SeedContacts() {
  const qc = useQueryClient();
  const toast = useToast();
  const contacts = useContacts();
  const [sarahEmail, setSarahEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const have = new Set((contacts.data ?? []).map((c) => c.email.toLowerCase()));
  const hasSarah = (contacts.data ?? []).some((c) => c.aliases.some((a) => a.toLowerCase() === "my editor"));

  const run = async () => {
    setBusy(true);
    const wanted = [
      ...(have.has("john@example.com") ? [] : [{ name: "John Doe", email: "john@example.com", role: "client" as const, aliases: [] }]),
      ...(hasSarah || !sarahEmail.trim() ? [] : [{ name: "Sarah", email: sarahEmail.trim(), role: "contractor" as const, aliases: ["my editor"] }]),
    ];
    let added = 0;
    for (const c of wanted) {
      try {
        await api.createContact(c);
        added++;
      } catch (e) {
        if (!(e instanceof ApiError && e.isConflict)) toast.error(`Couldn't add ${c.name}`, devError(e));
      }
    }
    await qc.invalidateQueries({ queryKey: qk.contacts });
    setBusy(false);
    if (added) toast.success(`Added ${added} demo contact${added === 1 ? "" : "s"}`);
    else if (!wanted.length) toast.info("Demo contacts are already set up");
  };

  return (
    <Step n={1} title="Add demo contacts">
      <p className="text-[13px] text-muted">John Doe (client){hasSarah ? " and Sarah are" : " is"} set up via the real contacts API.</p>
      {!hasSarah && (
        <TextField label="Sarah's PayPal email" type="email" placeholder="sarah@personal.example.com" value={sarahEmail} onChange={(e) => setSarahEmail(e.target.value)} hint="Use a PayPal sandbox personal account." />
      )}
      <Button size="sm" loading={busy} onClick={run}>
        Add contacts
      </Button>
    </Step>
  );
}

function SendPrompt() {
  const { send, busy } = useAgent();
  return (
    <Step n={2} title="Send Kwame's request">
      <p className="text-[13px] text-muted">Runs the real agent: a PayPal invoice for John and a locked 20% payout for Sarah.</p>
      <Button size="sm" variant="primary" disabled={busy} onClick={() => void send(DEMO_PROMPT)}>
        Send demo prompt
      </Button>
    </Step>
  );
}

function SimulatePayment() {
  const toast = useToast();
  const qc = useQueryClient();
  const invoices = useInvoices();
  const contacts = useContactsById();
  const sent = (invoices.data ?? []).filter((i) => i.status === "sent");
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const selectId = useId();
  const target = choice || sent[0]?.id || "";

  const run = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.dev.simulatePaid(target);
      void qc.invalidateQueries({ queryKey: qk.invoices });
      void qc.invalidateQueries({ queryKey: qk.actions });
      setChoice("");
    } catch (e) {
      toast.error("Couldn't simulate the payment", devError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Step n={3} title="Simulate the client paying">
      <p className="text-[13px] text-muted">Runs the same code as PayPal's INVOICE.PAID webhook. Watch the dashboard update live.</p>
      {sent.length === 0 ? (
        <p className="text-[13px] text-muted">No invoices are awaiting payment.</p>
      ) : (
        <>
          <label htmlFor={selectId} className="sr-only">
            Invoice to mark as paid
          </label>
          <select id={selectId} className={`${inputClass} h-9`} value={target} onChange={(e) => setChoice(e.target.value)}>
            {sent.map((i) => (
              <option key={i.id} value={i.id}>
                {contacts.get(i.contact_id)?.name ?? "Client"}: {formatMoney(i.amount_minor, i.currency)}, {i.description}
              </option>
            ))}
          </select>
        </>
      )}
      <Button size="sm" loading={busy} disabled={!target} onClick={run}>
        Mark as paid (simulated)
      </Button>
    </Step>
  );
}

function RunChase() {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { created } = await api.dev.runChase();
      void qc.invalidateQueries({ queryKey: qk.actions });
      if (created) toast.success(`Drafted ${created} reminder${created === 1 ? "" : "s"} for your review`);
      else toast.info("No overdue invoices need a reminder right now");
    } catch (e) {
      toast.error("Couldn't run the overdue check", devError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Step n={4} title="Run the overdue check">
      <p className="text-[13px] text-muted">Runs the daily job now: drafts a reminder for each overdue invoice, for your approval.</p>
      <Button size="sm" loading={busy} onClick={run}>
        Check overdue invoices
      </Button>
    </Step>
  );
}
