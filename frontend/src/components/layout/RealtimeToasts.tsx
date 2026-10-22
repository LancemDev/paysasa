import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/money";
import { useContactsById } from "@/lib/queries";
import { useRealtimeEvents } from "@/lib/realtime";

/** Announces the moments that matter (paid, unlocked, paid out, failed) as they arrive from realtime. */
export function RealtimeToasts() {
  const toast = useToast();
  const contacts = useContactsById();
  useRealtimeEvents((e) => {
    if (e.table === "invoices" && e.row.status === "paid" && e.previous && e.previous.status !== "paid") {
      const who = contacts.get(e.row.contact_id)?.name ?? "Your client";
      toast.success(`${who} paid ${formatMoney(e.row.amount_minor, e.row.currency)}`, e.row.description);
    }
    if (e.table === "pending_actions" && e.previous && e.previous.status !== e.row.status) {
      const a = e.row;
      if (a.status === "awaiting_approval" && e.previous.status === "locked") toast.info("A payout unlocked and needs your approval", a.summary);
      if (a.status === "succeeded" && a.type === "payout") toast.success("Payout completed by PayPal", a.summary);
      if (a.status === "failed") toast.error(a.type === "payout" ? "A payout failed" : "A reminder failed", a.summary);
    }
    if (e.table === "pending_actions" && !e.previous && e.row.type === "invoice_reminder" && e.row.status === "awaiting_approval") {
      toast.info("A reminder draft is ready for your review", e.row.summary);
    }
  });
  return null;
}
