import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FlaskConical } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
 * It floats in the corner so it never pushes the real product down the page.
 */
export function DemoDock() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const done = () => setOpen(false);
  return (
    <section ref={ref} aria-label="Demo helper" className="fixed bottom-[5.5rem] left-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-start gap-2 md:bottom-4 md:left-4">
      {open && (
        <div id={panelId} className="pop-in max-h-[min(70dvh,640px)] w-[min(380px,calc(100vw-1.5rem))] overflow-y-auto rounded-[var(--radius-sheet)] border border-dashed border-warning/50 bg-surface p-3 shadow-float [transform-origin:bottom_left]">
          <p className="px-1 pb-2 text-[12.5px] text-muted">For rehearsals: not part of the product. Uses the backend's test routes.</p>
          <div className="flex flex-col gap-2">
            <SeedContacts />
            <SendPrompt onDone={done} />
            <SimulatePayment onDone={done} />
            <RunChase />
          </div>
          <p className="mt-2 px-1 text-xs text-muted">
            Payout completion (“Submitted to PayPal” → “Paid out”) arrives through a PayPal webhook. The mock backend has no simulator for it, so in mock
            mode payouts honestly stay at “Submitted to PayPal”.
          </p>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-dashed border-warning/60 bg-warning-soft px-3.5 text-[13px] font-semibold text-warning shadow-2"
      >
        <FlaskConical aria-hidden className="size-4" />
        Demo helper
        <ChevronDown aria-hidden className={`size-4 transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-2 p-3">
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
      ...(have.has("daniel.carter@example.com") ? [] : [{ name: "Daniel Carter", email: "daniel.carter@example.com", role: "client" as const, aliases: [] }]),
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
      <p className="text-[13px] text-muted">Daniel Carter (client){hasSarah ? " and Sarah are" : " is"} set up via the real contacts API.</p>
      {!hasSarah && (
        <TextField label="Sarah's PayPal email" type="email" placeholder="sarah@personal.example.com" value={sarahEmail} onChange={(e) => setSarahEmail(e.target.value)} hint="Use a PayPal sandbox personal account." />
      )}
      <Button size="sm" loading={busy} onClick={run}>
        Add contacts
      </Button>
    </Step>
  );
}

function SendPrompt({ onDone }: { onDone: () => void }) {
  const { send, busy, setSheetOpen } = useAgent();
  return (
    <Step n={2} title="Send Kwame's request">
      <p className="text-[13px] text-muted">Runs the real agent: a PayPal invoice for Daniel and a locked 20% payout for Sarah.</p>
      <Button size="sm" variant="primary" disabled={busy} onClick={() => {
          onDone();
          setSheetOpen(true);
          void send(DEMO_PROMPT);
        }}
      >
        Send demo prompt
      </Button>
    </Step>
  );
}

function SimulatePayment({ onDone }: { onDone: () => void }) {
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
      onDone();
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
