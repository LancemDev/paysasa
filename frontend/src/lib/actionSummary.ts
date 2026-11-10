import type { Invoice, PendingAction } from "@/types/api";
import { daysOverdue } from "./dates";
import { formatMoney } from "./money";

/**
 * Rebuild an action's summary from live rows, so it follows the display currency and current overdue
 * count. The stored summary is a snapshot in the currency the action was created in.
 */
export function actionSummary(
  action: PendingAction,
  { payeeName, clientName, invoice }: { payeeName?: string | null; clientName?: string | null; invoice?: Invoice },
): string {
  if (action.type === "payout" && action.amount_minor != null && action.currency) {
    const amount = formatMoney(action.amount_minor, action.currency);
    return `Payout ${payeeName ?? "payee"} ${amount}${action.status === "locked" ? " upon settlement" : ""}`;
  }
  if (action.type === "invoice_reminder" && invoice) {
    const amount = formatMoney(invoice.amount_minor, invoice.currency);
    const days = daysOverdue(invoice.due_date);
    return `Remind ${clientName ?? "client"}: ${amount}${days > 0 ? ` is ${days} day${days === 1 ? "" : "s"} overdue` : ""}`;
  }
  return action.summary;
}
