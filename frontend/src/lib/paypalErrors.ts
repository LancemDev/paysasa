/** Backend stores PayPal failures as "CODE: message". Turn the common ones into plain language. */
const KNOWN: Record<string, string> = {
  INSUFFICIENT_FUNDS: "Your PayPal balance is too low to cover this payout.",
  RECEIVER_UNREGISTERED: "The recipient's email isn't linked to a PayPal account yet.",
  RECEIVER_ACCOUNT_LOCKED: "The recipient's PayPal account can't receive money right now.",
  DUPLICATE_REQUEST_ID: "PayPal has already received this exact payout request, so it wasn't sent twice.",
  CURRENCY_NOT_SUPPORTED_FOR_RECEIVER: "The recipient's PayPal account can't receive this currency.",
  NO_PAYPAL_INVOICE: "This invoice was never sent through PayPal, so there's nothing to remind.",
  INVOICE_NOT_FOUND_IN_PAYPAL: "PayPal couldn't find this invoice. It may have been created in a different PayPal mode or removed from PayPal.",
  INVALID_RESOURCE_ID: "PayPal couldn't find the related record.",
  RESOURCE_NOT_FOUND: "PayPal couldn't find the related record.",
};

export function plainPayPalError(error: string | null | undefined): string {
  if (!error) return "PayPal didn't give a reason.";
  const m = /^([A-Z0-9_]+):\s*(.*)$/s.exec(error.trim());
  if (!m) return error;
  return KNOWN[m[1]] ?? (m[2] || "PayPal didn't give a reason.");
}
