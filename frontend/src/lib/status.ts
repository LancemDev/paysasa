import type { ActionStatus, ActionType, Invoice, InvoiceStatus, PendingAction } from "@/types/api";
import { daysOverdue } from "./dates";

export type Tone = "success" | "info" | "warning" | "danger" | "muted" | "locked";
export type StatusIcon =
  | "check"
  | "clock"
  | "alert"
  | "pencil"
  | "ban"
  | "x"
  | "lock"
  | "hourglass"
  | "loader"
  | "send";

export interface StatusDisplay {
  key: string;
  label: string;
  tone: Tone;
  icon: StatusIcon;
  /** Lower sorts first; used for group order. */
  order: number;
}

// --- Invoices ----------------------------------------------------------------

/** "overdue" is derived (sent + due_date before today), exactly like the backend's list_invoices. */
export type InvoiceDisplayStatus = "overdue" | "awaiting" | "paid" | "draft" | "failed" | "cancelled";

const INVOICE_DISPLAY: Record<InvoiceDisplayStatus, StatusDisplay> = {
  overdue: { key: "overdue", label: "Overdue", tone: "danger", icon: "alert", order: 0 },
  awaiting: { key: "awaiting", label: "Awaiting payment", tone: "info", icon: "clock", order: 1 },
  paid: { key: "paid", label: "Paid", tone: "success", icon: "check", order: 2 },
  draft: { key: "draft", label: "Draft", tone: "muted", icon: "pencil", order: 3 },
  failed: { key: "failed", label: "Failed to send", tone: "danger", icon: "x", order: 4 },
  cancelled: { key: "cancelled", label: "Cancelled", tone: "muted", icon: "ban", order: 5 },
};

export function invoiceDisplayStatus(
  invoice: Pick<Invoice, "status" | "due_date">,
  now: Date = new Date(),
): InvoiceDisplayStatus {
  const s: InvoiceStatus = invoice.status;
  if (s === "sent") return daysOverdue(invoice.due_date, now) > 0 ? "overdue" : "awaiting";
  return s;
}

export function invoiceStatusDisplay(status: InvoiceDisplayStatus): StatusDisplay {
  return INVOICE_DISPLAY[status];
}

export const INVOICE_GROUP_ORDER = Object.values(INVOICE_DISPLAY)
  .sort((a, b) => a.order - b.order)
  .map((d) => d.label);

// --- Pending actions -----------------------------------------------------------

export function actionStatusDisplay(status: ActionStatus, type: ActionType = "payout"): StatusDisplay {
  const payout = type === "payout";
  switch (status) {
    case "awaiting_approval":
      return { key: status, label: payout ? "Needs approval" : "Review reminder", tone: "warning", icon: "hourglass", order: 0 };
    case "locked":
      return { key: status, label: "Locked", tone: "locked", icon: "lock", order: 1 };
    case "executing":
      return { key: status, label: payout ? "Sending to PayPal" : "Sending reminder", tone: "info", icon: "loader", order: 2 };
    case "submitted":
      // PayPal accepted the batch; the money has NOT necessarily arrived yet.
      return { key: status, label: "Submitted to PayPal", tone: "info", icon: "send", order: 3 };
    case "succeeded":
      return { key: status, label: payout ? "Paid out" : "Reminder sent", tone: "success", icon: "check", order: 4 };
    case "failed":
      return { key: status, label: "Failed", tone: "danger", icon: "x", order: 5 };
    case "rejected":
      return { key: status, label: payout ? "Rejected" : "Discarded", tone: "muted", icon: "ban", order: 6 };
    case "cancelled":
      return { key: status, label: "Cancelled", tone: "muted", icon: "ban", order: 7 };
  }
}

export type ActionStage = "needs_approval" | "locked" | "processing" | "completed" | "closed";

export const ACTION_STAGES: Record<ActionStage, { label: string; order: number }> = {
  needs_approval: { label: "Needs your approval", order: 0 },
  locked: { label: "Locked until paid", order: 1 },
  processing: { label: "With PayPal", order: 2 },
  completed: { label: "Completed", order: 3 },
  closed: { label: "Rejected or cancelled", order: 4 },
};

export function actionStage(status: ActionStatus): ActionStage {
  switch (status) {
    case "awaiting_approval":
      return "needs_approval";
    case "locked":
      return "locked";
    case "executing":
    case "submitted":
      return "processing";
    case "succeeded":
      return "completed";
    default:
      return "closed";
  }
}

export const needsApproval = (a: Pick<PendingAction, "status">) => a.status === "awaiting_approval";

/** Only a confirmed PayPal success counts as money sent. Never infer it from approve() returning 200. */
export const isMoneySent = (a: Pick<PendingAction, "type" | "status">) => a.type === "payout" && a.status === "succeeded";

/** Short human reference for an invoice: PayPal's id when there is one, else a short local id. */
export function invoiceRef(invoice: Pick<Invoice, "id" | "paypal_invoice_id">): string {
  return invoice.paypal_invoice_id ?? `#${invoice.id.slice(0, 8)}`;
}
