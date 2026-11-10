import type { ActivityLogEntry, Contact, Invoice, PendingAction } from "@/types/api";
import { actionSummary } from "@/lib/actionSummary";
import { daysOverdue } from "@/lib/dates";
import {
  ACTION_STAGES,
  actionStage,
  actionStatusDisplay,
  invoiceDisplayStatus,
  invoiceRef,
  invoiceStatusDisplay,
  type InvoiceDisplayStatus,
  type StatusDisplay,
} from "@/lib/status";

export interface InvoiceRow {
  id: string;
  invoice: Invoice;
  status: InvoiceDisplayStatus;
  statusDisplay: StatusDisplay;
  /** Group key, e.g. "Awaiting payment" */
  statusLabel: string;
  clientName: string;
  clientEmail: string;
  description: string;
  amount_minor: number;
  currency: string;
  dueDate: string | null;
  daysOverdue: number;
  ref: string;
  payoutsSummary: string;
  openApprovals: number;
  created_at: string;
}

export function buildInvoiceRows(invoices: Invoice[], contacts: Map<string, Contact>, actions: PendingAction[], now = new Date()): InvoiceRow[] {
  const byInvoice = new Map<string, PendingAction[]>();
  for (const a of actions) {
    if (!a.trigger_invoice_id) continue;
    const list = byInvoice.get(a.trigger_invoice_id) ?? [];
    list.push(a);
    byInvoice.set(a.trigger_invoice_id, list);
  }
  return invoices.map((inv) => {
    const status = invoiceDisplayStatus(inv, now);
    const display = invoiceStatusDisplay(status);
    const contact = contacts.get(inv.contact_id);
    const linked = (byInvoice.get(inv.id) ?? []).filter((a) => a.type === "payout");
    return {
      id: inv.id,
      invoice: inv,
      status,
      statusDisplay: display,
      statusLabel: display.label,
      clientName: contact?.name ?? "Unknown client",
      clientEmail: contact?.email ?? "",
      description: inv.description,
      amount_minor: inv.amount_minor,
      currency: inv.currency.trim(),
      dueDate: inv.due_date,
      daysOverdue: status === "overdue" ? daysOverdue(inv.due_date, now) : 0,
      ref: invoiceRef(inv),
      payoutsSummary: linked.map((a) => `${contactName(contacts, a.payee_contact_id)}: ${actionStatusDisplay(a.status).label}`).join(", "),
      openApprovals: (byInvoice.get(inv.id) ?? []).filter((a) => a.status === "awaiting_approval").length,
      created_at: inv.created_at,
    };
  });
}

export interface ActionRow {
  id: string;
  action: PendingAction;
  typeLabel: string;
  statusDisplay: StatusDisplay;
  stageLabel: string;
  stageOrder: number;
  summary: string;
  payeeName: string;
  amount_minor: number | null;
  currency: string | null;
  triggerInvoiceId: string | null;
  triggerLabel: string;
  triggerPaid: boolean;
  created_at: string;
}

export function buildActionRows(actions: PendingAction[], contacts: Map<string, Contact>, invoices: Map<string, Invoice>): ActionRow[] {
  return actions.map((a) => {
    const stage = ACTION_STAGES[actionStage(a.status)];
    const inv = a.trigger_invoice_id ? invoices.get(a.trigger_invoice_id) : undefined;
    const client = inv ? contacts.get(inv.contact_id)?.name : undefined;
    const payeeName = a.type === "payout" ? contactName(contacts, a.payee_contact_id) : (client ?? "Client");
    const ref = inv ? invoiceRef(inv) : "";
    let triggerLabel = "";
    if (inv) {
      if (a.status === "locked") triggerLabel = `Unlocks when ${ref} (${client ?? "client"}) is paid`;
      else triggerLabel = `${ref} · ${client ?? "client"}`;
    }
    return {
      id: a.id,
      action: a,
      typeLabel: a.type === "payout" ? "Payout" : "Reminder",
      statusDisplay: actionStatusDisplay(a.status, a.type),
      stageLabel: stage.label,
      stageOrder: stage.order,
      summary: actionSummary(a, { payeeName, clientName: client, invoice: inv }),
      payeeName,
      amount_minor: a.type === "payout" ? a.amount_minor : (inv?.amount_minor ?? null),
      currency: (a.type === "payout" ? a.currency : inv?.currency)?.trim() ?? null,
      triggerInvoiceId: a.trigger_invoice_id,
      triggerLabel,
      triggerPaid: inv?.status === "paid",
      created_at: a.created_at,
    };
  });
}

export interface ActivityRow {
  id: number;
  entry: ActivityLogEntry;
  actorLabel: string;
  message: string;
  event: string;
  created_at: string;
}

const ACTORS: Record<string, string> = { agent: "PaySasa agent", user: "You", paypal: "PayPal", system: "System" };

export function buildActivityRows(entries: ActivityLogEntry[]): ActivityRow[] {
  return entries.map((e) => ({
    id: e.id,
    entry: e,
    actorLabel: ACTORS[e.actor] ?? e.actor,
    message: e.message,
    event: e.event,
    created_at: e.created_at,
  }));
}

function contactName(contacts: Map<string, Contact>, id: string | null): string {
  return (id && contacts.get(id)?.name) || "Unknown";
}
