# PaySasa AI: 3-minute demo script

Judges are not required to watch past 3:00, so this runs about 2:45. Record at 1440×900, light mode, with a
fresh sandbox account. Each beat names the judging criterion it serves.

**Before recording**
- The backend `/health` says `"paypal":"sandbox"`. Don't use the dev routes: the payment in the video must be a real
  sandbox payment, so judges see PayPal's webhook do the work.
- The PayPal sandbox app has a webhook pointing at `https://paysasa.onrender.com/webhooks/paypal`, subscribed to
  `INVOICING.INVOICE.PAID`, `INVOICING.INVOICE.CANCELLED`, `PAYMENT.PAYOUTSBATCH.SUCCESS` and
  `PAYMENT.PAYOUTSBATCH.DENIED`, and its ID is set as `PAYPAL_WEBHOOK_ID` on Render.
- The demo user's default currency is **USD** (Settings). PayPal can't invoice in KES, so a KES default makes the
  invoice fail.
- Sarah's contact email is a PayPal **sandbox personal** account email, and you know the login for the sandbox
  personal account that pays Daniel's invoice.
- Rehearse the whole run once on the day of recording, end to end, before you press record.
- The demo user is signed out, and contacts Daniel Carter and Sarah ("my editor") exist.
- `VITE_AG_GRID_LICENSE_KEY` and `VITE_AG_STUDIO_LICENSE_KEY` are set, so there are no trial watermarks.
- The "Your payment cycle" tracker is visible. Use Settings → "Show the getting-started checklist again" if you hid it.

| Time | Screen | Say (roughly) | Criterion |
|---|---|---|---|
| 0:00-0:20 | Landing page | "Kwame designs videos in Nairobi for clients in the US, UK and South Africa, and gives his editor Sarah 20% of each job. Invoicing abroad, chasing payment and paying Sarah is all manual. PaySasa does it from one sentence, and never moves money without his approval." | Impact, Presentation |
| 0:20-0:30 | Open the live demo → sign in | "This is PayPal's sandbox; no real money moves." | Presentation |
| 0:30-1:05 | Dashboard + agent panel. Tap **Kwame's request**. | "He types what he'd say to an assistant." Let the **step trace** play: "It found Daniel, sent a PayPal invoice, found 'my editor', and scheduled Sarah's 20%, locked." Point at the two **action cards** and the tracker moving to step 3. | Tech (PayPal + AI), Innovation |
| 1:05-1:25 | Invoices grid (AG Grid) | "The invoice is live under **Awaiting payment**, grouped by status with totals per currency." Open **Payouts & actions**: "Sarah's $240 is locked until Daniel pays." | Design, AG Grid |
| 1:25-1:45 | Pay the invoice on the PayPal sandbox (invoice drawer → **View on PayPal sandbox**, sign in as a sandbox personal account) | "Daniel pays. PayPal's webhook updates PaySasa, and the dashboard updates live, with no reload." Point at the row flash, the toast and the **Needs your approval** badge. | Tech, Design |
| 1:45-2:15 | Click the badge → **Review payout** | "This is the guardrail. It says exactly what will happen: $240 USD to Sarah via PayPal, triggered by Daniel's payment, proposed by the agent." Click **Approve**: "Submitted to PayPal, with a batch ID. It only says Paid out once PayPal confirms." | Impact, Design, Agentic commerce |
| 2:15-2:40 | **Insights** (AG Studio). Toggle sample history if the account is new. | "Kwame can build his own dashboards: cash flow, receivables aging, payouts by collaborator. Our custom **approval queue** and **payout pipeline** widgets put the guardrail right in the dashboard." Click **Customise** and drag one widget. | AG Studio prize, Design |
| 2:40-2:50 | The tracker shows 6 of 6 | "Invoice, payment, approval, payout: one sentence, every money movement approved by a human." | Presentation |

**Fallbacks**
- If the LLM is slow, keep talking over the live step trace; it shows progress while the agent works.
- If realtime is down, the app refreshes every 15 seconds, and the connection chip says so honestly.
- If the webhook doesn't arrive within about 30 seconds, check the Render logs for "rejected PayPal webhook" (wrong
  `PAYPAL_WEBHOOK_ID`) or "unknown invoice" (the invoice was created by a different backend). Don't fake the payment
  on camera.

**Submitting on Devpost (deadline Nov 12, 2026, 12:00pm PST)**
- Video: under 3:00, uploaded to YouTube as **Public**, with no copyrighted music or third-party trademarks you don't
  have permission for.
- Tools: name **Anthropic Claude** (tool use, agent loop and reminder drafts), **PayPal Invoicing, Payouts and
  Webhooks** (sandbox), **AG Grid Enterprise + AG Studio**, **Render** and **Supabase**, and say how each is used.
- Testing instructions: the live URL, the demo login (email **and** password), and a note that it runs on the PayPal
  sandbox, so no real money moves.
- Repository: `https://github.com/LancemDev/paysasa` (public, MIT). Make sure the About section has a description and
  the live demo URL.
- Sponsor prizes: enter **AG Grid** and **Render** only; we don't use APIMatic, Bryntum or Channel3.
- Every team member must be at least the age of majority where they live (18 in Kenya).
