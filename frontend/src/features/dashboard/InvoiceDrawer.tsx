import { Check, Copy, ExternalLink, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Dialog";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/components/ui/cn";
import { dueLabel, formatDate, formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { formatMoney, formatMoneyWithCode } from "@/lib/money";
import { useActions, useActivity, useAgentRun, useContactsById, useInvoices } from "@/lib/queries";
import { actionStatusDisplay, invoiceDisplayStatus, invoiceRef, invoiceStatusDisplay } from "@/lib/status";
import { useWorkspace } from "@/lib/workspace";
import type { Invoice } from "@/types/api";

export function InvoiceDrawer() {
  const { invoiceId, closeInvoice } = useWorkspace();
  const invoices = useInvoices();
  const invoice = invoices.data?.find((i) => i.id === invoiceId);
  const contacts = useContactsById();
  const client = invoice ? contacts.get(invoice.contact_id) : undefined;

  return (
    <Drawer
      open={!!invoiceId}
      onOpenChange={(o) => !o && closeInvoice()}
      title={invoice ? `${client?.name ?? "Invoice"}: ${formatMoney(invoice.amount_minor, invoice.currency)}` : "Invoice"}
      description={invoice?.description}
      wide
    >
      <ErrorBoundary region="invoice details">
        {invoices.isLoading ? (
          <div className="flex flex-col gap-3 p-5" role="status" aria-label="Loading invoice">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        ) : invoice ? (
          <InvoiceDetail invoice={invoice} />
        ) : (
          <p className="p-5 text-muted">We couldn't find this invoice. It may belong to another account.</p>
        )}
      </ErrorBoundary>
    </Drawer>
  );
}

function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const contacts = useContactsById();
  const { data: actions } = useActions();
  const { data: activity } = useActivity();
  const { data: run } = useAgentRun(invoice.agent_run_id);
  const { openApproval } = useWorkspace();
  const client = contacts.get(invoice.contact_id);
  const status = invoiceDisplayStatus(invoice);
  const linked = (actions ?? []).filter((a) => a.trigger_invoice_id === invoice.id);

  const timeline = useMemo(() => {
    const events = (activity ?? [])
      .filter((e) => e.entity_id === invoice.id || linked.some((a) => a.id === e.entity_id))
      .map((e) => ({ key: `a${e.id}`, at: e.created_at, label: e.message }));
    if (events.length === 0) {
      // Activity may be paged out; fall back to the invoice's own timestamps.
      events.push({ key: "created", at: invoice.created_at, label: "Created by PaySasa" });
      if (invoice.sent_at) events.push({ key: "sent", at: invoice.sent_at, label: `Sent to ${client?.email ?? "client"} via PayPal` });
      if (invoice.paid_at) events.push({ key: "paid", at: invoice.paid_at, label: "Paid" });
    }
    return events.sort((a, b) => a.at.localeCompare(b.at));
  }, [activity, invoice, linked, client]);

  return (
    <div className="flex flex-col gap-6 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={invoiceStatusDisplay(status)} />
        {invoice.status === "sent" && invoice.due_date && <span className={cn("text-[13px]", status === "overdue" ? "font-medium text-danger" : "text-muted")}>{dueLabel(invoice.due_date)}</span>}
      </div>

      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
        <dt className="text-muted">Client</dt>
        <dd>
          {client?.name ?? "Unknown"}
          <span className="block break-all text-[13px] text-muted">{client?.email}</span>
        </dd>
        <dt className="text-muted">Line item</dt>
        <dd>1 × {invoice.description}</dd>
        <dt className="text-muted">Amount</dt>
        <dd className="tabular font-semibold">{formatMoneyWithCode(invoice.amount_minor, invoice.currency)}</dd>
        <dt className="text-muted">Due date</dt>
        <dd>{invoice.due_date ? formatDate(invoice.due_date) : "-"}</dd>
        <dt className="text-muted">PayPal</dt>
        <dd>
          <PayPalRef invoice={invoice} />
        </dd>
        {invoice.last_reminder_at && (
          <>
            <dt className="text-muted">Last reminder</dt>
            <dd>{formatDateTime(invoice.last_reminder_at)}</dd>
          </>
        )}
        {invoice.error && (
          <>
            <dt className="text-muted">Problem</dt>
            <dd className="text-danger">{invoice.error.replace(/^[A-Z_]+:\s*/, "")}</dd>
          </>
        )}
      </dl>

      <section aria-labelledby="linked-h">
        <h3 id="linked-h" className="mb-2 font-semibold">
          Linked payouts and reminders
        </h3>
        {linked.length === 0 ? (
          <p className="text-muted">None. Ask PaySasa to pay a collaborator when this invoice is paid.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {linked.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-medium">
                    {a.status === "locked" && <Lock aria-hidden className="size-3.5" />}
                    {a.summary}
                  </p>
                  {a.type === "payout" && a.amount_minor != null && <p className="text-[13px] text-muted tabular">{formatMoneyWithCode(a.amount_minor, a.currency)}</p>}
                </div>
                <StatusBadge size="sm" status={actionStatusDisplay(a.status, a.type)} />
                {a.status === "awaiting_approval" && (
                  <Button size="sm" variant="primary" onClick={() => openApproval(a.id)}>
                    Review
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="timeline-h">
        <h3 id="timeline-h" className="mb-2 font-semibold">
          Timeline
        </h3>
        <ol className="relative ml-2 border-l border-border">
          {timeline.map((e) => (
            <li key={e.key} className="ml-4 pb-4 last:pb-0">
              <span aria-hidden className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-surface bg-accent" />
              <p>{e.label}</p>
              <time dateTime={e.at} className="text-[13px] text-muted">
                {formatDateTime(e.at)}
              </time>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">PayPal doesn't report when a client views an invoice, so "viewed" isn't shown.</p>
      </section>

      {invoice.agent_run_id && (
        <section aria-labelledby="agent-h">
          <h3 id="agent-h" className="mb-2 font-semibold">
            Created by the agent
          </h3>
          {run ? (
            <blockquote className="rounded-[var(--radius-card)] border-l-4 border-accent bg-surface-2 p-3 text-[13px]">
              “{run.user_message}”
              <footer className="mt-1 text-muted">You asked, {formatDateTime(run.created_at)}</footer>
            </blockquote>
          ) : (
            <Skeleton className="h-14" />
          )}
        </section>
      )}
    </div>
  );
}

function PayPalRef({ invoice }: { invoice: Invoice }) {
  const [copied, setCopied] = useState(false);
  if (!invoice.paypal_invoice_id) return <span className="text-muted">Not sent through PayPal</span>;
  const id = invoiceRef(invoice);
  // The backend doesn't store PayPal's payer link; in sandbox mode the public invoice URL follows this pattern.
  const href = env.paypalMode === "sandbox" ? `https://www.sandbox.paypal.com/invoice/p/#${encodeURIComponent(invoice.paypal_invoice_id)}` : null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <code className="text-[13px] break-all">{id}</code>
      <button
        type="button"
        aria-label="Copy PayPal invoice ID"
        className="rounded p-1 text-muted hover:bg-surface-2"
        onClick={() => {
          void navigator.clipboard?.writeText(invoice.paypal_invoice_id!).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check aria-hidden className="size-4 text-success" /> : <Copy aria-hidden className="size-4" />}
      </button>
      {copied && <span role="status" className="text-xs text-success">Copied</span>}
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-accent underline-offset-2 hover:underline">
          View on PayPal sandbox <ExternalLink aria-hidden className="size-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </span>
  );
}
