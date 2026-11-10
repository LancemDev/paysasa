# Backend fixes from the pre-submission audit

Audit date: Nov 10, 2026. Lance allowed backend edits **only to fix these issues**. The full backend suite passes
(109 tests: the original 101 plus 8 new ones).

## Done on `fix/submission-readiness`

| Issue | Fix | Files | Tests |
|---|---|---|---|
| KES invoices fail at PayPal (KES isn't a PayPal REST currency) | New `PAYPAL_CURRENCIES` (USD, EUR, GBP, CAD, AUD, CHF) and `check_paypal_currency`. `send_invoice` refuses KES with a clear message **before** creating a row or calling PayPal. The tool schema and system prompt only offer PayPal currencies, and the prompt tells the model to ask when the default isn't billable. `PATCH /api/profile` only accepts PayPal currencies. KES stays available for display and formatting. | `app/money.py`, `app/agent/tools.py`, `app/agent/run.py`, `app/agent/prompt.py`, `app/profile/router.py` | `test_kes_invoice_is_refused_before_paypal`, `test_profile_currency_must_be_paypal_billable`, `test_paypal_currency`, updated `test_unsupported_currency_is_refused` |
| Demo and existing profiles were moved to KES by `0002` | New migration `0003_paypal_billable_default.sql`: default back to USD, KES profiles moved to USD. Safe to re-run. | `supabase/migrations/0003_paypal_billable_default.sql` | Applied 0001 → 0002 → 0003 twice on a scratch database |
| Payouts on one invoice could add up to more than the invoice, and the same payout could be queued twice | `schedule_payout` sums the invoice's payouts that can still move money (not rejected, cancelled or failed) while the invoice row is locked, and refuses an over-allocation (saying how much is left) or an exact duplicate (same payee and amount) | `app/agent/tools.py` | `test_payouts_cannot_exceed_invoice_in_total` |
| A refund didn't stop payouts | `INVOICING.INVOICE.REFUNDED` cancels that invoice's `locked` and `awaiting_approval` payouts and logs the refund. Payouts already submitted can't be recalled and are left alone. Adds the `awaiting_approval → cancelled` transition for payouts. | `app/webhooks/handlers.py`, `app/webhooks/router.py`, `app/transitions.py` | `test_refund_cancels_payouts_not_yet_sent` |
| A batch "success" hid an unclaimed or returned payout | `PAYMENT.PAYOUTS-ITEM.{BLOCKED, CANCELED, DENIED, FAILED, REFUNDED, RETURNED, UNCLAIMED}`: a `submitted` payout becomes `failed` with the reason; a `succeeded` one keeps its status but gets a `payout.item_problem` activity entry; an `executing` one asks PayPal to redeliver | `app/webhooks/handlers.py`, `app/webhooks/router.py` | `test_unclaimed_payout_item_marks_payout_failed`, `test_payout_item_problem_after_success_is_logged`, `test_payout_item_before_submit_is_retried_and_success_item_ignored` |
| Blueprint didn't match production; `/dev/*` has no auth | `render.yaml` now says `PAYPAL_ADAPTER=real` and `ENABLE_DEV_ROUTES=false`, matching what's live | `backend/render.yaml` | — |

## To do by hand (no code)

1. **Run `0003_paypal_billable_default.sql`** in the Supabase SQL editor for the production project.
2. **PayPal sandbox webhook:** subscribe it to the new events too: `INVOICING.INVOICE.REFUNDED` and the seven
   `PAYMENT.PAYOUTS-ITEM.*` events listed above. Confirm `PAYPAL_WEBHOOK_ID` is set on the `paysasa-api` service.
3. **Deploy** the backend after merging, then run the full demo once in the sandbox.

## Deliberately not changed

- **Re-checking the invoice with PayPal before every payout.** The seeded "Needs you" payouts (Priya $375 and
  Elena $180) sit on placeholder invoice IDs (`DEMO-INV-1006`, `DEMO-INV-1009`) that PayPal has never seen, so the
  check would make them fail when judges approve them. Worth doing after the hackathon, together with the seed.
- **Requiring the invoice amount to appear in the user's message.** It would wrongly block normal follow-ups (giving
  an email after the amount was in an earlier message) and amounts like "$1.2k" or Kiswahili number words.
- **Passing `temperature` to Claude, rate limiting, recovering payouts stuck in `executing`.** Lower risk, and
  outside the agreed scope.
- `MAX_AMOUNT_MINOR` ignoring currency mattered mainly for KES; with KES no longer billable, it now applies only to
  currencies of similar value.
