# PaySasa AI: UX plan (Phase 1)

Built on the real backend contract in `docs/frontend-analysis.md`. Backend gaps are handled in the UI (the backend is
owned by another teammate). The workarounds are marked **[workaround]**.

## 1. Screens and navigation

| Route | Screen | Notes |
|---|---|---|
| `/sign-in`, `/sign-up`, `/reset-password`, `/update-password` | Auth | Supabase email + password. Public. |
| `/` | Workspace: Dashboard (main) + Agent panel (right) | Protected. Tabs: **Invoices · Payouts & actions · Activity**. |
| `/?invoice=<id>` | Invoice detail drawer over the dashboard | Deep-linkable, closes with Esc. |
| `/approvals` | Approvals queue | Also reachable from the "Needs your approval (n)" header badge. |
| `/payees` | Contacts / payees | List + add (the backend has no edit/delete). |
| `/settings` | Settings | Profile (read only **[workaround: no profile endpoint]**), second-confirm threshold, theme, sign out. |

**Header:** logo · nav (Dashboard, Approvals [count], Payees, Settings) · realtime indicator · avatar menu.
A persistent **"Test mode: no real money moves"** banner sits above the header (wording set by `VITE_PAYPAL_MODE`:
`mock` or `sandbox`) **[workaround: the backend doesn't report its adapter]**.

**Mobile (<1024px):** single column, with the agent as a full-screen sheet opened from a sticky bottom "Ask PaySasa"
button. Below 768px, grids become card lists and the nav becomes a bottom-safe top menu.

## 2. Primary flow (Kwame story), state by state

```
[1] Empty dashboard
    Invoices tab: "No invoices yet. Ask PaySasa to bill a client."  [Try the demo prompt]
    Agent panel: greeting + chips: Invoice a client · Who hasn't paid? · Pay my editor · ★ Demo: Kwame's request

[2] User taps the demo chip -> prompt fills the input (editable) -> Send
    Input disabled, Stop button shown, user bubble appears.
    Step trace (live from realtime activity_log, agent.* events):
      ✓ Understood request
      ✓ Found contact "Daniel Carter"
      ✓ Sent $1,200.00 invoice to Daniel Carter
      ✓ Found contact "my editor" -> Sarah
      ✓ Scheduled payout: Sarah $240.00 upon settlement
      … Writing reply
    If realtime is down, the trace is filled in from agent_runs.tool_calls once the response arrives.

[3] Response arrives
    Reply text (aria-live) + action cards built from tool_calls:
      ┌ Invoice sent ───────────────────────── ✓ Sent ┐
      │ Daniel Carter · Q3 Video Campaign                   │
      │ $1,200.00 USD · Due 5 Nov 2026                 │
      │ [Open invoice]                                 │
      └────────────────────────────────────────────────┘
      ┌ Payout scheduled ──────────────────── 🔒 Locked ┐
      │ Sarah · $240.00 USD (20%)                       │
      │ Unlocks when Daniel Carter's invoice is paid,        │
      │ then needs your approval.                       │
      │ [View in Payouts]                               │
      └─────────────────────────────────────────────────┘
    Dashboard rows flash in (AG Grid transaction): Invoice in "Awaiting payment"; payout in Payouts, locked.

[4] Client pays on PayPal (the INVOICE.PAID webhook updates the backend)
    Invoice row flashes, moves to "Paid" group. Toast: "Daniel Carter paid $1,200.00".
    Payout row: 🔒 Locked -> ⏳ Needs approval. Header badge: Needs your approval (1).

[5] Kwame opens the approval (badge, row, or card)
    Modal: "This will send $240.00 USD to Sarah via PayPal."
      Recipient: Sarah <email> · Amount · Trigger: Daniel Carter invoice (Paid) · Proposed by: PaySasa agent,
      from "Send an invoice to Daniel…" · Fees: deducted by PayPal if any (not shown by PayPal in advance)
      [Reject…] [Approve and send]
    Above the threshold: a second step, "Type the amount to confirm" or a second "Yes, send $X" button.

[6] Approve clicked -> button shows spinner + "Sending to PayPal…" (disabled, double-submit guarded)
    -> 200 submitted: "Submitted to PayPal" (batch ID shown), NOT "sent".
    -> realtime succeeded: "Paid out ✓", toast. (Demo: no backend way to reach succeeded with the mock;
       the UI shows submitted honestly.)
    -> 200 failed: plain-language reason; no retry possible (backend terminal), suggest contacting support.
    -> 409: refetch; "This was already handled" with the current status.
    -> network error/500: refetch the row; if executing: "Waiting for PayPal to confirm. Don't approve again."
```

## 3. State matrix

| Component | Loading | Empty | Populated | Error | Offline / disconnected | Success |
|---|---|---|---|---|---|---|
| Invoices grid | skeleton rows (8) | teaching empty state + demo prompt | grouped grid / cards | inline panel "Couldn't load invoices" + Retry | "Live updates paused, refreshing every 15s" chip; data kept | row flash on change |
| Payouts grid | skeleton | "No payouts yet. Ask PaySasa to pay a collaborator when an invoice is paid." | grid; locked rows dimmed + lock | same | same | flash |
| Activity grid | skeleton | "Everything PaySasa and PayPal do appears here." | grid, newest first | same | same | new row flash |
| Agent panel | step trace + "Thinking…" | greeting + chips | messages + cards | error bubble, friendly message, **input preserved**, Retry | send disabled + "You're offline" | cards |
| Approval modal | n/a | n/a | details | inline failure + reason | approve disabled offline | success state with batch ID |
| Approvals queue | skeleton cards | "Nothing needs your approval." ✓ | cards sorted oldest first | retry panel | polling chip | item leaves the queue with a toast |
| Invoice drawer | skeleton | n/a | timeline, payouts, agent request | "Couldn't load this invoice" | same | n/a |
| Payees | skeleton | "Add the people you bill or pay." | list + add form | inline form errors (409 duplicate) | disabled submit | toast + row |
| Auth forms | button spinner | n/a | n/a | inline error | "You're offline" | redirect / "Check your email" |

## 4. Design tokens

A calm fintech look: neutral slate surfaces, **one accent (teal)**, high contrast and generous spacing.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#F7F8FA` | `#0B0F14` |
| `--surface` | `#FFFFFF` | `#121821` |
| `--surface-2` (raised, hover) | `#F1F3F6` | `#1A222D` |
| `--border` | `#E2E6EB` | `#263140` |
| `--text` | `#0F172A` (17.7:1) | `#E6EBF1` (15:1) |
| `--text-muted` | `#475569` (7.5:1) | `#9AA7B6` (7.6:1) |
| `--accent` | `#0F766E` (5.5:1 on white) | `#2DD4BF` |
| `--accent-fg` | `#FFFFFF` | `#04201D` |
| `--success` | `#166534` | `#4ADE80` |
| `--warning` | `#B45309` | `#FBBF24` |
| `--danger` | `#B91C1C` | `#F87171` |
| `--info` | `#1D4ED8` | `#60A5FA` |
| `--locked` | `#475569` | `#94A3B8` |

Every status combines an **icon + text label + colour**:
- Paid ✓ (success)
- Awaiting payment ◷ (info)
- Overdue ! (danger)
- Draft ✎ (muted)
- Cancelled ⊘ (muted)
- Failed ✕ (danger)
- Locked 🔒 (locked)
- Needs approval ⏳ (warning)
- Sending ↻ (info)
- Submitted ➚ (info)
- Paid out ✓ (success)
- Rejected ⊘ (muted)

**Type scale:** system UI stack (no web-font download). Sizes: 12 / 14 (body) / 16 / 18 / 22 / 28, with line-height 1.5 for
body and 1.25 for headings. Money uses `font-variant-numeric: tabular-nums`.

**Spacing:** 4px base (4, 8, 12, 16, 24, 32, 48). **Radius:** 6 (inputs) / 10 (cards) / 14 (sheets). **Elevation:**
`sh-1` (`0 1px 2px rgb(15 23 42 / .06)`) for cards, `sh-2` (`0 8px 24px rgb(15 23 42 / .12)`) for drawers and modals.
In dark mode, a lighter surface carries elevation rather than a shadow.

**Motion:** 150ms ease-out for transitions and 600ms for the row flash, all disabled under
`prefers-reduced-motion`. **Theme** follows `prefers-color-scheme`, with an override in Settings.

## 5. Decisions driven by the backend
- **Invoices are sent immediately by the agent.** The invoice card is a confirmation ("Sent", with an Open link), not
  Confirm/Edit/Cancel. The real human gate is on payouts and reminders.
- **No PayPal link is stored.** The drawer shows the PayPal invoice ID (copyable). A "View on PayPal" link is built
  from the ID only when `VITE_PAYPAL_MODE=sandbox`.
- **Quick replies:** the backend sends plain-text questions. If a reply ends with "?" and the run made no successful
  write, it's shown as a question, with contextual chips (currency mentioned → USD / GBP / EUR; otherwise none) and the
  input focused.
- **Currencies:** formatting supports any ISO code (USD, GBP, EUR, KES, ZAR, NGN tested). The agent creates invoices in
  USD, EUR, GBP, CAD, AUD or CHF; KES is display-only because PayPal can't invoice in it. The dashboard converts every
  amount to the profile currency with static indicative rates, while PayPal keeps the original currency.
- **Follow-up reminders** are `invoice_reminder` actions: an editable draft, with Send (approve with the edited
  `message`) and Discard (reject).
- **Sample history:** with `VITE_ENABLE_DEMO=true`, Insights can include sample history, labelled as demo only.
