# PaySasa AI: 3-minute demo script

Judges are not required to watch past 3:00, so this runs about 2:45. Record at 1440×900, light mode, with a
fresh sandbox account. Each beat names the judging criterion it serves.

**Before recording**
- The backend is running, and `ENABLE_DEV_ROUTES=true` for "Mark as paid".
- The demo user is signed out, and contacts Daniel Carter and Sarah ("my editor") exist.
- `VITE_AG_GRID_LICENSE_KEY` and `VITE_AG_STUDIO_LICENSE_KEY` are set, so there are no trial watermarks.
- The "Your payment cycle" tracker is visible. Use Settings → "Show the getting-started checklist again" if you hid it.

| Time | Screen | Say (roughly) | Criterion |
|---|---|---|---|
| 0:00-0:20 | Landing page | "Kwame designs videos in Nairobi for clients in the US, UK and South Africa, and gives his editor Sarah 20% of each job. Invoicing abroad, chasing payment and paying Sarah is all manual. PaySasa does it from one sentence, and never moves money without his approval." | Impact, Presentation |
| 0:20-0:30 | Open the live demo → sign in | "This is PayPal's sandbox; no real money moves." Point at the banner. | Presentation |
| 0:30-1:05 | Dashboard + agent panel. Tap **Kwame's request**. | "He types what he'd say to an assistant." Let the **step trace** play: "It found Daniel, sent a PayPal invoice, found 'my editor', and scheduled Sarah's 20%, locked." Point at the two **action cards** and the tracker moving to step 3. | Tech (PayPal + AI), Innovation |
| 1:05-1:25 | Invoices grid (AG Grid) | "The invoice is live under **Awaiting payment**, grouped by status with totals per currency." Open **Payouts & actions**: "Sarah's $240 is locked until Daniel pays." | Design, AG Grid |
| 1:25-1:45 | Demo helper → **Mark as paid** (or pay the invoice in the PayPal sandbox) | "Daniel pays. PayPal's webhook updates PaySasa, and the dashboard updates live, with no reload." Point at the row flash, the toast and the **Needs your approval** badge. | Tech, Design |
| 1:45-2:15 | Click the badge → **Review payout** | "This is the guardrail. It says exactly what will happen: $240 USD to Sarah via PayPal, triggered by Daniel's payment, proposed by the agent." Click **Approve**: "Submitted to PayPal, with a batch ID. It only says Paid out once PayPal confirms." | Impact, Design, Agentic commerce |
| 2:15-2:40 | **Insights** (AG Studio). Toggle sample history if the account is new. | "Kwame can build his own dashboards: cash flow, receivables aging, payouts by collaborator. Our custom **approval queue** and **payout pipeline** widgets put the guardrail right in the dashboard." Click **Customise** and drag one widget. | AG Studio prize, Design |
| 2:40-2:50 | The tracker shows 6 of 6 | "Invoice, payment, approval, payout: one sentence, every money movement approved by a human." | Presentation |

**Fallbacks**
- If the LLM is slow, keep talking over the live step trace; it shows progress while the agent works.
- If realtime is down, the app refreshes every 15 seconds, and the connection chip says so honestly.
