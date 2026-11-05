import { ArrowRight, FileText, Lock, UserPlus, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ActionCardModel } from "@/lib/agent";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatMoneyWithCode } from "@/lib/money";
import { useActions, useContactsById, useInvoicesById } from "@/lib/queries";
import { actionStatusDisplay, invoiceDisplayStatus, invoiceRef, invoiceStatusDisplay } from "@/lib/status";
import { useWorkspace } from "@/lib/workspace";

/**
 * Structured cards for what the agent did. They read the live rows from the cache, so an invoice card flips
 * to "Paid" and a payout card to "Needs approval" as soon as realtime delivers the change.
 */
export function ActionCards({ cards }: { cards: ActionCardModel[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {cards.map((c) =>
        c.kind === "invoice" ? (
          <InvoiceCard key={c.key} card={c} />
        ) : c.kind === "payout" ? (
          <PayoutCard key={c.key} card={c} />
        ) : (
          <ContactCard key={c.key} card={c} />
        ),
      )}
    </div>
  );
}

function Card({ icon, title, badge, children, footer }: { icon: ReactNode; title: string; badge?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <article className="animate-in overflow-hidden rounded-2xl border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <span aria-hidden className="text-muted">
          {icon}
        </span>
        <h4 className="flex-1 text-[13px] font-semibold">{title}</h4>
        {badge}
      </header>
      <div className="px-3 py-2.5 text-[13px]">{children}</div>
      {footer && <footer className="flex flex-wrap gap-2 border-t border-border px-3 py-2">{footer}</footer>}
    </article>
  );
}

function InvoiceCard({ card }: { card: Extract<ActionCardModel, { kind: "invoice" }> }) {
  const invoices = useInvoicesById();
  const contacts = useContactsById();
  const { openInvoice } = useWorkspace();
  const live = invoices.get(card.invoiceId);
  const r = card.result;
  const client = live ? contacts.get(live.contact_id) : undefined;
  const status = live ? invoiceStatusDisplay(invoiceDisplayStatus(live)) : invoiceStatusDisplay("awaiting");
  const amount = live ? formatMoneyWithCode(live.amount_minor, live.currency) : `${r.amount} ${r.currency}`;
  return (
    <Card
      icon={<FileText className="size-4" />}
      title="Invoice sent via PayPal"
      badge={<StatusBadge size="sm" status={status} />}
      footer={
        <Button size="sm" variant="secondary" onClick={() => openInvoice(card.invoiceId)} icon={<ArrowRight aria-hidden className="size-3.5" />}>
          Open invoice
        </Button>
      }
    >
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1">
        <dt className="text-muted">Client</dt>
        <dd>
          {client?.name ?? r.contact}
          {client && <span className="block break-all text-muted">{client.email}</span>}
        </dd>
        <dt className="text-muted">Item</dt>
        <dd>1 × {live?.description ?? "Invoice item"}</dd>
        <dt className="text-muted">Amount</dt>
        <dd className="tabular font-semibold">{amount}</dd>
        <dt className="text-muted">Due</dt>
        <dd>{formatDate(live?.due_date ?? r.due_date)}</dd>
        {live?.paypal_invoice_id && (
          <>
            <dt className="text-muted">PayPal ID</dt>
            <dd className="font-mono text-xs break-all">{invoiceRef(live)}</dd>
          </>
        )}
      </dl>
    </Card>
  );
}

function PayoutCard({ card }: { card: Extract<ActionCardModel, { kind: "payout" }> }) {
  const { data: actions } = useActions();
  const invoices = useInvoicesById();
  const contacts = useContactsById();
  const { openApproval, openInvoice } = useWorkspace();
  const live = actions?.find((a) => a.id === card.actionId);
  const r = card.result;
  const status = actionStatusDisplay(live?.status ?? r.status, "payout");
  const trigger = live?.trigger_invoice_id ? invoices.get(live.trigger_invoice_id) : undefined;
  const client = trigger ? contacts.get(trigger.contact_id) : undefined;
  const payee = live?.payee_contact_id ? contacts.get(live.payee_contact_id) : undefined;
  const awaiting = live?.status === "awaiting_approval";
  const locked = (live?.status ?? r.status) === "locked";

  return (
    <Card
      icon={<Wallet className="size-4" />}
      title={awaiting ? "Payout ready for your approval" : "Payout scheduled"}
      badge={<StatusBadge size="sm" status={status} />}
      footer={
        <>
          {awaiting && (
            <Button size="sm" variant="primary" onClick={() => openApproval(card.actionId)}>
              Review and approve
            </Button>
          )}
          {trigger && (
            <Button size="sm" variant="ghost" onClick={() => openInvoice(trigger.id)}>
              View invoice
            </Button>
          )}
        </>
      }
    >
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1">
        <dt className="text-muted">Recipient</dt>
        <dd>{payee?.name ?? r.payee}</dd>
        <dt className="text-muted">Amount</dt>
        <dd className="tabular font-semibold">
          {live?.amount_minor != null ? formatMoneyWithCode(live.amount_minor, live.currency) : r.amount}
          {live?.split_percent != null && <span className="font-normal text-muted"> ({Number(live.split_percent)}%)</span>}
        </dd>
        <dt className="text-muted">Trigger</dt>
        <dd>
          {locked ? (
            <span className="inline-flex items-start gap-1">
              <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Unlocks when {client ? `${client.name}'s` : "the"} invoice{trigger ? ` (${formatMoney(trigger.amount_minor, trigger.currency)})` : ""} is paid
            </span>
          ) : trigger?.status === "paid" ? (
            `${client?.name ?? "Client"} paid on ${formatDate(trigger.paid_at)}`
          ) : (
            "Linked invoice"
          )}
        </dd>
      </dl>
      <p className="mt-2 text-muted">Nothing is sent until you approve it.</p>
    </Card>
  );
}

function ContactCard({ card }: { card: Extract<ActionCardModel, { kind: "contact" }> }) {
  const c = card.result.contact;
  return (
    <Card icon={<UserPlus className="size-4" />} title="Contact added">
      <p>
        {c.name} <span className="text-muted">({c.role})</span>
      </p>
      <p className="break-all text-muted">{c.email}</p>
    </Card>
  );
}
