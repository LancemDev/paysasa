# PaySasa AI frontend: final report

Branch: `frontend`. Scope: frontend only. `backend/` is owned by a teammate and was not modified.

## What was built

- **Workspace layout:** dashboard in the main area with a persistent agent panel on the right. On mobile, the agent
  opens as a full-screen sheet from a sticky "Ask PaySasa" button and the grids become grouped card lists. Tested
  down to 360px with no horizontal page scroll.
- **Agent panel:**
  - Prompt chips plus a one-tap Kwame demo prompt.
  - A live step trace, streamed from realtime `activity_log` rows while the request runs, then rebuilt from
    `agent_runs.tool_calls`.
  - Structured action cards (invoice sent, payout scheduled, contact added) that follow the live row status.
  - Quick replies for clarifying questions.
  - Stop, retry, input kept on error, and conversation history restored from `agent_runs`.
- **AG Grid dashboard** (Invoices, Payouts & actions, Activity):
  - Row grouping by status or stage, with group and grand totals **per currency** from a custom aggFunc.
  - Text, number, date and set filters, quick search, a column-visibility menu, and pinned columns.
  - Status cell renderers that always show icon plus text.
  - Live updates via `applyTransaction` with cell flash, so there are no reloads or scroll jumps.
  - Row click opens the invoice drawer. Locked payouts are visually distinct and link to their parent invoice.
- **Invoice drawer:** status and relative due date, client, line item, amount, PayPal ID (copyable, with a sandbox link
  in sandbox mode), linked payouts and reminders, a timeline from `activity_log`, and the agent request that created it.
- **Approvals:**
  - A header badge and an approvals queue.
  - The modal states the consequence ("This will send $240.00 USD to Sarah via PayPal") and shows recipient, amount,
    fees note, triggering invoice and proposer.
  - Second confirmation at or above a configurable threshold.
  - Reject with a reason.
  - Double-submit guard (a ref, not just a disabled button). 409s are reconciled against the server.
  - A network error or 500 re-reads the row: it shows "Waiting for PayPal" if the payout is `executing`, and offers
    a safe retry only if nothing changed.
  - Money is never shown as sent before `succeeded`.
- **Reminders (follow-ups):** an editable draft (1-500 characters) with Send (approve with the edited message) and
  Discard (reject).
- **Auth and onboarding:** Supabase sign-in, sign-up, password reset and update; protected routes; a session-expiry
  message; a first-run checklist (server reachable, PayPal mode, add a payee, try the demo); and an always-visible
  test-mode banner.
- **Payees:** list and add, with role, PayPal-email hint and nicknames. **Settings:** profile (read only), approval
  threshold, theme (system, light or dark), environment info.
- **Demo helper:** clearly labelled and env-gated. It adds demo contacts via `/api/contacts`, sends the demo prompt
  through the real agent, marks an invoice paid via `/dev/simulate-paid`, and runs the overdue check via `/dev/run-chase`.
- **Resilience:** global toasts with polite and assertive live regions, inline form errors, error boundaries per
  region, a realtime indicator (Live, Connecting, Refreshing every 15s, Offline) with polling fallback, friendly
  error mapping (raw errors are never shown), and a config-error screen when env vars are missing.

## Hackathon requirement mapping

| Requirement | How the frontend meets it |
|---|---|
| **PayPal integration** | The UI covers PayPal Invoicing (invoice cards and IDs, sandbox links), the Payouts approval flow (batch ID, Submitted vs Paid out), webhook-driven state (paid and unlocked updates arrive live), and PayPal invoice reminders. |
| **AI** | The agent panel shows a transparent step trace from real tool calls, structured action cards, clarification quick replies, and reminder drafts written by the model that need approval. |
| **AG Grid** | Grouping, per-currency aggregation, grand totals, filters, quick filter, column visibility, pinning, custom cell renderers, transactions with cell flashing, and a theme built on the app's design tokens (light and dark). Enterprise modules are registered and lazy-loaded. |
| **Render** | `frontend/render.yaml` defines a static site with an SPA rewrite and asset caching. Steps are in `frontend/README.md`. |
| **Working demo** | The Kwame story passes end to end in Playwright on desktop and mobile. The Demo helper makes the live recording repeatable. |

## Verification done

- `npm test`: 36 Vitest tests pass, covering the approval flow (double submit, conflict, unknown outcome, executing,
  second confirmation, reject, reminder edit), money formatting (USD, GBP, EUR, KES, ZAR, NGN, exactness, per-currency
  totals), status mapping, agent parsing and action cards.
- `npm run e2e`: the Kwame happy path passes on desktop (1440px) and mobile (Pixel 7); axe WCAG 2.1 A/AA reports
  0 violations on sign-in, dashboard and the approval dialog in light and dark mode; and there's no horizontal
  scroll at 360px. These run against an in-browser fake of the documented backend and Supabase contracts.
- `npm run build` succeeds. The initial JS is about 160 kB gzip, plus about 55 kB for Supabase. AG Grid (about 300 kB
  gzip) loads lazily only when a grid renders.

**Not verified in this session:**
- The app was **not run against the real backend and Supabase**, because there were no credentials here.
- **Supabase Realtime is not exercised by the automated tests.** The fake has no websocket, which does test the
  polling fallback.
- **Lighthouse scores were not measured.**

Please run the QA checklist below against the real stack.

## Known gaps (backend-dependent): requests for the backend teammate

| # | Gap | UI behaviour today | Smallest backend change |
|---|---|---|---|
| G1 | The real PayPal adapter (`app/paypal/`) doesn't exist yet | Banner says "Test mode: PayPal is simulated" when `VITE_PAYPAL_MODE=mock` | Implement the adapter; then set `VITE_PAYPAL_MODE=sandbox` |
| G2 | The backend doesn't report its adapter or dev-route status | The frontend reads `VITE_PAYPAL_MODE`, which must be kept in sync by hand | `/health` returns `paypal_adapter`, `paypal_env`, `dev_routes` |
| G3 | The PayPal payer link isn't stored | The PayPal ID is shown and copyable; in sandbox mode the link is built from the ID | `invoices.payer_view_url` column, set on send |
| G4 | A payout can't reach `succeeded` without a real webhook | The mock demo ends at "Submitted to PayPal", stated honestly | `POST /dev/simulate-payout/{id}` |
| G5 | `/dev/*` routes have no auth or owner check | The Demo helper is env-gated in the UI | Require login and check ownership; disable after recording |
| G6 | No structured "needs clarification" signal | A heuristic (reply ends in "?" and nothing was written) produces quick replies | Optional `ask_user` tool with options |
| G7 | No profile endpoint | Settings shows the profile read only | `GET`/`PUT /api/profile` |
| G9 | Can't create an overdue invoice for the demo | The reminder flow can only be demoed with an aged invoice | `POST /dev/seed-demo` |
| G10 | Failed and stuck-`executing` payouts can't be retried | The UI explains this and says not to re-approve | A retry endpoint with a new idempotency key |

**Other limits:**
- No invoice edit or cancel, because the agent sends invoices immediately.
- No KES equivalent, because there are no FX rates.
- No "viewed" step in the timeline, because PayPal doesn't report it.
- Without a licence key, AG Grid Enterprise shows a trial watermark. **Get a key from the AG Grid sponsor before
  recording**, or the watermark will appear in the video.

## Cut or simplified (quality over scope)
- **Streaming replies:** the backend can't stream, so the live step trace replaces token streaming. "Stop" stops
  waiting; it can't cancel work the server has already started, and the UI says so.
- **Invoice Confirm/Edit/Cancel cards:** replaced by post-hoc confirmation cards, because the backend sends immediately.
- **Contact edit/delete and profile editing:** the backend has no endpoints for them.

## Manual QA checklist (run against the real stack before recording)

Setup:
- [ ] The backend is running with `PAYPAL_ADAPTER` matching `VITE_PAYPAL_MODE`, `ENABLE_DEV_ROUTES=true`, and `CORS_ORIGIN` including the frontend URL.
- [ ] The migration and seed have been run, and the demo user can sign in.
- [ ] `VITE_AG_GRID_LICENSE_KEY` is set, so there's no watermark.

Auth and first run:
- [ ] Wrong password shows a friendly error. Sign-in lands on the Dashboard with the test-mode banner visible.
- [ ] The connection indicator shows **Live** within a few seconds. If it shows "Refreshing every 15s", realtime isn't reaching the browser: check the Supabase realtime publication and RLS.
- [ ] The Get started checklist shows "server connected". The Payees page lists Daniel Carter and Sarah ("my editor").

The Kwame story:
- [ ] Tap "Kwame's request". Steps appear while it runs, the reply arrives, and the invoice and payout cards render with **Awaiting payment** and **Locked**.
- [ ] The Invoices grid shows the row under **Awaiting payment** with a flash, and the totals read $1,200.00.
- [ ] The Payouts tab shows the payout under **Locked until paid**, and the trigger link opens the invoice drawer.
- [ ] Demo helper → Mark as paid. **Without reloading**, the invoice flashes into **Paid**, the toast "Daniel Carter paid $1,200.00" appears, and the header shows **Needs your approval (1)**.
- [ ] The approval modal shows "$240.00 USD to Sarah", her email, "Triggered by" with the Paid badge, and "Proposed by" with the original prompt.
- [ ] Double-clicking Approve sends one request (check the network tab). The modal shows **Submitted to PayPal** with the batch ID.
- [ ] Re-opening the same payout shows its current state, not the approve button.

Edge cases:
- [ ] Send "Invoice Mary $50", which has no email. The agent asks for the email, the input is focused and the placeholder asks for it.
- [ ] Send "Invoice Daniel 500 KES". The agent explains the supported currencies, and no invoice is created.
- [ ] Stop the backend and send a message. A friendly error appears, the input is kept, and Try again works after a restart.
- [ ] Go offline in DevTools. The indicator shows Offline, sending is disabled, and the data stays on screen.
- [ ] Settings: set the threshold to 100.00. Approving a $240 payout then asks for a second confirmation.
- [ ] Reject a payout with a reason. It moves to "Rejected or cancelled" and the activity log shows the reason.
- [ ] Demo helper → Run overdue check (needs an overdue invoice). The reminder draft appears; edit it and send it, or discard it.
- [ ] Mobile (real phone or DevTools at 360px): Ask PaySasa opens as a sheet, cards replace grids, and there's no sideways scroll.
- [ ] Toggle dark mode (OS or Settings). The grids, badges and modal stay readable.

---

# Round 2: optimising for the hackathon judging

Sources: the hackathon page, PayPal's announcement, AG Grid's partner post, and the official PayPal + AG Studio
boilerplate. Devpost blocks automated fetches, so the judging details below come from a participant's copy of the
rules (aaravbodla/PAYPAL-AI-HACKATHON). **Confirm them on Devpost.**

**How it's judged:**
- **Stage 1 (pass/fail):** the project fits the theme and meaningfully uses PayPal and AI.
- **Stage 2:** five equally weighted criteria: Technological Implementation, Design, Potential Impact,
  Innovation, Presentation. Ties break in that order.
- **Award limit:** at most one Grand Prize or Honorable Mention, **plus one** sponsor prize.

**The AG sponsor prize is "Best Use of AG Studio"** ($5k / $2k / 3×$1k), not plain AG Grid. AG Grid's guidance
emphasises dashboard polish, custom widgets, theming and layout, and agents that build dashboards.

## What changed in this round

| Criterion / prize | Change |
|---|---|
| **AG Studio prize** | New **Insights** page: a self-serve AG Studio dashboard over live PaySasa data, a three-page default report, two **custom widgets** (a live approval queue that opens the real approval modal, and a payout guardrail pipeline), a theme built from our tokens, save and customise, and per-currency fields so no widget can mix currencies. |
| **Design** (complete, coherent product) | Public **landing page** covering problem, audience, value, the six-step loop, guardrails and the stack. A **"Your payment cycle"** tracker shows the story from live data with one next action. A personal greeting with a one-line status. The theme is applied before first paint, so there's no flash. |
| **Presentation / Best Demo Delivery** | `docs/demo-script.md`: a timed 2:50 script mapped to the criteria. An optional judge sign-in hint (`VITE_DEMO_LOGIN_HINT`). A labelled sample-history toggle so Insights isn't empty on a fresh account. |
| **Potential impact** | The landing page names the audience (African freelancers billing abroad) and the concrete problem. |
| **Tech implementation** | The AG Studio data model has unit tests. E2E now covers landing → sign-in. axe covers the landing and Insights pages. Studio is lazy-loaded and prefetched on intent. |

**Verified:** 42 unit/component tests pass. Playwright passes: the Kwame story on desktop and mobile, axe WCAG
A/AA (light and dark) on landing, sign-in, dashboard, the approval dialog and Insights (our own UI; AG's internals
are excluded), and no sideways scroll at 360px. I checked the screenshots of Insights, the landing page and the
dashboard visually.

**Bundle:** the first load is unchanged at about 160 kB gzip. AG Studio is about 1.1 MB gzip, loaded only on
Insights.

## Submission blockers and asks

1. **The repo has no LICENSE file.** The rules require an open-source licence that's visible in the repo's About
   area. This is the team's decision (MIT is common), so I haven't added one.
2. **Licence keys:** request the AG Studio 45-day trial from the partner, and an AG Grid key. Without them the
   demo video shows watermarks.
3. **Demo video:** YouTube, public, under 3:00. Use `docs/demo-script.md`.
4. **A hosted demo URL plus sandbox test credentials,** or clear run instructions. Render static site steps are
   in `frontend/README.md`.

## Backend requests (owned by the backend teammate)

Everything from round 1 (G1-G10) still applies. One new item:

- **AG Studio AI assistant ("agents that build dashboards"):** add `POST /api/ai/studio`, which forwards a request
  to the LLM with the server-held key, streams the response back, and requires auth and rate limits. AG Studio's
  assistant then connects to it through an `AgLlmAdapter`, the AG-UI-style event protocol in
  `ag-studio/dist/types/api/ai`. I didn't build the frontend adapter, because without an endpoint it can't be
  tested end to end. It's the single biggest remaining lever for the AG Studio prize.

## Note on `morluto/rea`

The `rea` repository linked in the request is "Reverse Engineer Anything": an MCP server and CLI for taking apart
binaries and apps. It contains no frontend or UX guidance, and its setup registers itself into the user's agent
configuration. I didn't install or use it. The best-practice sources used instead were the hackathon's official
materials and AG Grid's AG Studio docs and boilerplate (read for API usage only; the boilerplate has no licence,
so no code was copied).
