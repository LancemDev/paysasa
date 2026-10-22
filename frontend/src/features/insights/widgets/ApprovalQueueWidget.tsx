import { ShieldCheck } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { formatMoneyWithCode } from "@/lib/money";
import { useWorkspace } from "@/lib/workspace";
import { useInsightsData } from "./insightsContext";

/**
 * Custom AG Studio widget: the human-in-the-loop queue, live. "Review" opens PaySasa's real approval modal,
 * so a dashboard built in Studio can still never move money without an explicit approval.
 */
export function ApprovalQueueWidget() {
  const { actions, contacts, invoices, sample } = useInsightsData();
  const { openApproval } = useWorkspace();
  const name = new Map(contacts.map((c) => [c.id, c.name]));
  const inv = new Map(invoices.map((i) => [i.id, i]));
  const pending = actions.filter((a) => a.status === "awaiting_approval").sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  if (pending.length === 0)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-[13px] text-muted">
        <ShieldCheck aria-hidden className="size-6 text-success" />
        Nothing needs your approval. Payouts unlock here when clients pay.
      </div>
    );

  return (
    <ul className="flex h-full flex-col gap-2 overflow-y-auto p-1" aria-label="Payouts and reminders awaiting approval">
      {pending.map((a) => {
        const invoice = a.trigger_invoice_id ? inv.get(a.trigger_invoice_id) : undefined;
        const isPayout = a.type === "payout";
        return (
          <li key={a.id} className="rounded-[var(--radius-card)] border border-border p-2.5">
            <p className="text-[13px] font-semibold">
              {isPayout ? (
                <>
                  Send <span className="tabular">{formatMoneyWithCode(a.amount_minor ?? 0, a.currency)}</span> to{" "}
                  {(a.payee_contact_id && name.get(a.payee_contact_id)) || "payee"}
                </>
              ) : (
                a.summary
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {invoice ? `${name.get(invoice.contact_id) ?? "Client"} paid “${invoice.description}”` : "Linked invoice"} · {formatDateTime(a.updated_at)}
            </p>
            {sample ? (
              <p className="mt-2 text-xs text-muted">Sample row: approvals only work on your live data.</p>
            ) : (
              <button
                type="button"
                onClick={() => openApproval(a.id)}
                className="mt-2 h-8 rounded-[var(--radius-input)] bg-accent px-3 text-[13px] font-medium text-accent-fg hover:bg-accent-hover"
              >
                Review {isPayout ? "payout" : "reminder"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
