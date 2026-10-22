# PaySasa AI: Frontend analysis of the existing backend (Phase 0)

Source of truth: `backend/` at commit `0f219fb` (branch `main`). Everything below was read from code, not from the
product brief. Where the brief and the code disagree, the code wins, and the difference is called out in **Plan vs code**.

---

## 1. Repo map

```
paysasa/
├── README.md                    one-line pointer to backend/
├── backend/
│   ├── README.md                env vars, DB setup, API table, open questions
│   ├── render.yaml              Render Blueprint: web service paysasa-api + cron paysasa-chase
│   ├── supabase/
│   │   ├── migrations/0001_init.sql   the whole schema, RLS, realtime publication
│   │   └── seed.sql                   demo user Kwame + contacts John Doe, Sarah ("my editor")
│   └── server/                  FastAPI app (Python 3.12)
│       ├── app/main.py          create_app(): CORS, error handlers, routers, /health
│       ├── app/config.py        pydantic-settings (reads server/.env)
│       ├── app/auth.py          Bearer Supabase access token -> user id (supabase.auth.get_user)
│       ├── app/errors.py        { "error": { code, message } } envelope
│       ├── app/money.py         integer minor units, USD/GBP/EUR only
│       ├── app/transitions.py   the ONLY code that changes a status; writes activity_log in the same tx
│       ├── app/agent/           Gemini tool-calling loop (run.py), 6 tools (tools.py), prompt, reminder drafter
│       ├── app/actions/         approve / reject pending actions (the only place money moves)
│       ├── app/contacts/        create contact
│       ├── app/webhooks/        POST /webhooks/paypal, idempotent via webhook_events
│       ├── app/jobs/chase.py    daily overdue job: drafts reminders that need approval
│       ├── app/dev/             /dev/* rehearsal routes (ENABLE_DEV_ROUTES=true only)
│       ├── app/paypal_contract.py   PayPalAdapter Protocol
│       ├── app/paypal_mock/     in-memory adapter (the default)
│       ├── scripts/realtime_check.py
│       └── tests/               pytest against a real Postgres + mock adapter
└── (no frontend yet)
```

**Languages and frameworks:** Python 3.12, FastAPI, psycopg 3 (async pool), supabase-py (auth checks only),
google-genai (Gemini). Postgres is hosted on Supabase. There's no JS anywhere yet. The untracked root
`package.json`/`package-lock.json` only install the Claude Code CLI and aren't part of the app.

**Entry points:**
- API: `uvicorn app.main:app` (from `backend/server`)
- Cron: `python -m app.jobs.chase`

**Run the backend locally:**
```sh
cd backend/server
uv venv --python 3.12 .venv && uv pip install -r requirements.txt
cp .env.example .env     # fill in values
.venv/bin/uvicorn app.main:app --reload    # http://localhost:8000
```
DB: run `0001_init.sql` in Supabase, sign up `demo@paysasa.app`, edit Sarah's email in `seed.sql`, then run it.

**Backend env vars (names only):** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
`LLM_MODEL`, `PAYPAL_ADAPTER` (`mock`|`real`), `MAX_AMOUNT_MINOR`, `ENABLE_DEV_ROUTES`, `CORS_ORIGIN`,
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV`.

**Frontend env vars it will need:** `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
(public anon key; RLS protects data), and optionally `VITE_APPROVAL_SECOND_CONFIRM_MINOR` (threshold).

**CORS:** `CORS_ORIGIN` defaults to `http://localhost:3000`. Allowed methods are GET/POST/OPTIONS and allowed
headers are `Authorization` and `Content-Type`. I'll run Vite on port 3000 so no backend change is needed locally.

---

## 2. API surface

**Architecture:** the API has write and command endpoints only. **All dashboard reads go directly to Supabase**
(PostgREST via supabase-js, using the user's session). RLS allows `select` on the user's own rows and no writes.
Realtime also goes through Supabase.

All `/api/*` routes need `Authorization: Bearer <Supabase access token>`; missing or invalid tokens get a 401.

| Method & path | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `GET /health` | none | | `200 { ok: true }` | |
| `POST /api/agent/message` | Bearer | `{ message: string }` (1-2000 chars, trimmed) | `200 { run_id: uuid, reply: string }` | 401; 422 `invalid_request`; 502 `agent_failed` ("The assistant could not finish (run <id>). Please try again.") |
| `GET /api/agent/runs?limit=20` | Bearer | `limit` 1-100 | `200 [{ id, user_message, reply, status, created_at }]`, newest first (no `tool_calls`, no `error`) | 401, 422 |
| `POST /api/actions/{id}/approve` | Bearer | optional `{ message?: string }` (≤2000; only used for `invoice_reminder`, 1-500 chars after trim) | `200 { action: PendingAction }`. The status is usually `submitted` (payout), `succeeded` (reminder) or `failed` (PayPal rejected) | 401; 404 `not_found`; 409 `conflict` ("Action is X, not awaiting approval"); 422; **500 with no JSON body** if PayPal times out (see gaps) |
| `POST /api/actions/{id}/reject` | Bearer | optional `{ reason?: string }` (≤500) | `200 { action: PendingAction }` with status `rejected`, `error` = reason | 401, 404, 409, 422 |
| `POST /api/contacts` | Bearer | `{ name, email, role: 'client'\|'contractor', aliases?: string[] (≤10) }` | `201 { contact: Contact }` | 401; 409 `conflict` (duplicate email); 422 |
| `POST /webhooks/paypal` | PayPal signature | PayPal event | `200 { ok: true }` | 400 bad signature or malformed; 500 so PayPal retries |
| `POST /dev/simulate-paid/{invoiceId}` | **none** | | `200 { invoice: Invoice }` | 404; 409 if the invoice isn't `sent` |
| `POST /dev/run-chase` | **none** | | `200 { created: number }` | |

**Error envelope:** `{ "error": { "code": string, "message": string } }`. Codes seen: `unauthorized`, `not_found`,
`method_not_allowed`, `http_error`, `invalid_request`, `conflict`, `agent_failed`. Validation messages look like
`"message: String should have at most 2000 characters"`. Unhandled exceptions are different: they produce Starlette's
plain-text 500, and since `ServerErrorMiddleware` sits outside CORS, the browser sees it as a **CORS/network error**,
not a 500. The client must treat a network error on approve as "outcome unknown" (see §6).

**Streaming:** none. There's no SSE or websocket. `POST /api/agent/message` blocks until the whole tool loop has finished
(up to 6 rounds of Gemini plus PayPal calls), which can take several seconds.

**Serialisation details:**
- Through the API (`action_out`), UUIDs and timestamps are strings, `split_percent` is a string (`"20.00"`) and
  `amount_minor` is a number.
- Through Supabase/PostgREST, `numeric` arrives as a JSON number, `bigint` as a number (fine below 2^53) and
  `char(3)` as a string.

---

## 3. Data model (`0001_init.sql`)

Money is always `amount_minor bigint` plus `currency char(3)`. There are no floats.

**Enums**

| Enum | Values |
|---|---|
| `contact_role` | `client`, `contractor` |
| `invoice_status` | `draft`, `sent`, `paid`, `cancelled`, `failed` |
| `action_type` | `payout`, `invoice_reminder` |
| `action_status` | `locked`, `awaiting_approval`, `executing`, `submitted`, `succeeded`, `failed`, `rejected`, `cancelled` |
| `actor_kind` | `agent`, `user`, `paypal`, `system` |

"Overdue" **is not a stored status**. It's derived as `status = 'sent' and due_date < today` (the same rule used in
`list_invoices` and the chase job). `draft` only exists for an instant, between the DB insert and the PayPal call.

**Tables** (all have RLS `select` where the row is the user's own; there are no client writes)

| Table | Key columns | Realtime |
|---|---|---|
| `profiles` | `id` (= auth user), `display_name`, `default_currency`, `created_at` | no |
| `contacts` | `id`, `owner_id`, `name`, `email`, `role`, `aliases text[]`, `created_at`; unique `(owner_id, email)` | **yes** |
| `invoices` | `id`, `owner_id`, `contact_id → contacts`, `paypal_invoice_id`, `description`, `amount_minor`, `currency`, `status`, `paypal_status`, `due_date`, `sent_at`, `paid_at`, `last_reminder_at`, `error`, `agent_run_id`, `created_at`, `updated_at` | **yes** |
| `pending_actions` | `id`, `owner_id`, `type`, `status`, `trigger_invoice_id → invoices`, `payee_contact_id → contacts`, `amount_minor`, `currency`, `split_percent`, `summary`, `draft_message`, `idempotency_key`, `paypal_payout_batch_id`, `error`, `decided_at`, `executed_at`, `agent_run_id`, `created_at`, `updated_at` | **yes** |
| `agent_runs` | `id`, `owner_id`, `user_message`, `reply`, `tool_calls jsonb`, `status` (`running`\|`completed`\|`failed`), `error`, `created_at` | no (readable via select) |
| `activity_log` | `id bigint`, `owner_id`, `actor`, `event`, `message`, `entity_type`, `entity_id`, `details jsonb`, `created_at` | **yes** |
| `webhook_events` | server only (RLS on, no policies) | no |

**Relationships:** `invoices.contact_id → contacts`; `pending_actions.trigger_invoice_id → invoices` (the payout
unlocks when this invoice is paid; reminders target it); `pending_actions.payee_contact_id → contacts`;
`*.agent_run_id → agent_runs` (logical link, no FK). PostgREST can embed the FK joins:
`invoices?select=*,contact:contacts(*)` and
`pending_actions?select=*,payee:contacts(*),invoice:invoices(*)`.

**`activity_log` events seen in code** (useful for the Activity grid and the invoice timeline):
`invoice.sent`, `invoice.failed`, `invoice.paid`, `invoice.cancelled`, `invoice.payment_partial`,
`payout.scheduled`, `payout.awaiting_approval`, `payout.unlocked`, `payout.approved`, `payout.submitted`,
`payout.succeeded`, `payout.failed`, `payout.rejected`, `payout.cancelled`, `reminder.drafted`, `reminder.approved`,
`reminder.sent`, `reminder.failed`, `reminder.rejected`, `reminder.cancelled`, `contact.created`,
`agent.<tool>` and `agent.<tool>.error`. Transition rows carry `details.from` and `details.to`. Agent tool rows carry
`entity_type='agent_run'`, `entity_id=<run id>` and `details = { tool, args, result }`.

---

## 4. Agent behaviour

- **Invocation:** `POST /api/agent/message` → `run_agent()`. It inserts an `agent_runs` row (`running`), builds a
  system prompt (today, default currency, allowed currencies, **all the user's contacts**), and replays the last 10
  *completed* runs as chat history. It then loops: Gemini turn → execute tool calls → feed results back, for at most
  6 rounds. Finally it stores `reply` and `tool_calls` and sets the status to `completed`. If an exception occurs,
  the status becomes `failed` and the API returns 502.
- **LLM:** Google Gemini (`google-genai`, default `gemini-2.5-flash`, temperature 0). **There's no PayPal MCP or
  Agent Toolkit.** The tools are custom and call a `PayPalAdapter`.
- **Tools** (guardrails are enforced in code):

| Tool | Does | Result shape (`tool_calls[i].result`) |
|---|---|---|
| `find_contact(query)` | exact then fuzzy match on name/email/alias | `{ matches: ContactOut[], count }` |
| `create_contact(name,email,role,aliases?)` | only if the email literally appears in this message | `{ contact: ContactOut }` |
| `send_invoice(contact_id, description, amount, currency, due_in_days=14)` | **creates AND sends immediately** via PayPal | `{ invoice_id, status: 'sent', contact, amount: '$1,200.00', currency, due_date }` |
| `schedule_payout(trigger_invoice_id, payee_contact_id, split_percent \| amount)` | contractor only, ≤ invoice amount, ≤ cap; `locked` (or `awaiting_approval` if the invoice is already paid) | `{ action_id, status, summary, amount, payee, needs_approval: true }` |
| `list_invoices(status?)` | includes the virtual `overdue` | `{ invoices: [{ invoice_id, contact, description, amount, status, due_date, overdue }], count }` |
| `list_pending_actions(status?)` | | `{ actions: [{ action_id, type, status, summary, trigger_invoice_id }], count }` |

  Any tool error comes back as `result = { error: string }`. The model is told to explain it in plain words.
- **What the frontend gets:** the HTTP response only includes `{ run_id, reply }` (plain text, 1-3 sentences).
  The structured trace is in `agent_runs.tool_calls` (`[{ name, args, result }]`), which can be read via Supabase
  by `run_id`. **This is how the UI builds action cards and the step trace.**
- **Live step trace without streaming:** each tool call writes an `activity_log` row (`actor='agent'`,
  `event='agent.<tool>'`, `entity_id=<run id>`) **while the request is still in flight**, and `activity_log` is
  in the realtime publication. The panel can show steps as they arrive (run id unknown until the response; match on
  `actor='agent'` + `event` prefix `agent.` + `created_at` after send).
- **Pending/locked action representation:** a `pending_actions` row with `type='payout'`, `status='locked'` and
  `summary = "Payout Sarah $240.00 upon settlement"`, linked via `trigger_invoice_id`.
- **Ambiguity:** the model asks **one plain-text question** (for example "What is Mary's email address?"). There's
  **no structured flag** for "needs clarification" and no quick-reply options. A follow-up message works because
  completed runs are replayed as history.
- **Unsupported currency:** the model replies in text listing USD, GBP and EUR, and calls no tool.
- **Caps:** `MAX_AMOUNT_MINOR` (default 1,000,000 = 10,000.00) applies per invoice and per payout.

---

## 5. Webhook flow

`POST /webhooks/paypal` → verify signature via the adapter → insert into `webhook_events` (deduplicated by event id) →
handle it in one transaction:

| PayPal event | Effect |
|---|---|
| `INVOICING.INVOICE.PAID` | Re-reads the invoice from PayPal. If it's `PAID`/`MARKED_AS_PAID`: invoice `sent→paid` (`paid_at`), each `locked` payout → `awaiting_approval` (summary loses "upon settlement"), open reminders → `cancelled`. If it's only partially paid, it logs `invoice.payment_partial` and nothing changes. |
| `INVOICING.INVOICE.CANCELLED` | invoice `sent→cancelled`, locked payouts → `cancelled`, open reminders → `cancelled` |
| `PAYMENT.PAYOUTSBATCH.SUCCESS` | payout `submitted→succeeded` |
| `PAYMENT.PAYOUTSBATCH.DENIED` | payout `submitted→failed` (`error` set) |

**How the frontend sees it:** every change is a row update in `invoices` or `pending_actions` plus an insert into
`activity_log`, and all three are in the `supabase_realtime` publication. So the frontend uses **Supabase Realtime
subscriptions, with polling (TanStack Query `refetchInterval`) as the fallback**. `/dev/simulate-paid/{id}` runs exactly
the same `apply_invoice_paid` code as the real webhook, so the demo matches production behaviour.

---

## 6. Approval/guardrail flow

```
payout:   locked ──(invoice paid)──▶ awaiting_approval ──approve──▶ executing ──PayPal ok──▶ submitted ──webhook──▶ succeeded
             │                              │                          │                        └──webhook DENIED──▶ failed
             └──(invoice cancelled)──▶ cancelled                       └──PayPalError──▶ failed
                                            └──reject──▶ rejected
reminder: awaiting_approval ──approve(message?)──▶ executing ──▶ succeeded | failed
                     ├──reject──▶ rejected
                     └──(invoice paid/cancelled)──▶ cancelled
```

- **Endpoint:** `POST /api/actions/{id}/approve` (and `/reject`).
- **Double submits** are safe server-side. The first call moves `awaiting_approval → executing` with a conditional
  update, and any concurrent or repeat call gets **409 conflict**. The PayPal `sender_batch_id` is the row's
  `idempotency_key`, so PayPal also rejects a reused key.
- **Money is only "sent" when the status is `succeeded`.** `submitted` means PayPal accepted the batch and
  completion is pending. The UI must not say "sent" until `succeeded`. In the mock there's no way to reach
  `succeeded` (see gaps).
- **Timeout or unknown outcome:** the action stays `executing`, the API returns a bare 500 that the browser sees as
  a network error, and there's no retry endpoint. The UI must refetch the row and show "Waiting for PayPal to confirm"
  rather than "failed".
- `failed` is terminal. There's no transition back, so the UI can't retry a failed payout.

---

## 7. Gaps and risks

**Blocking or high-impact gaps.** I'll ask before making any of the backend changes proposed here.

| # | Gap | Impact on UI | Smallest backend change |
|---|---|---|---|
| G1 | **The real PayPal adapter doesn't exist** (`app/paypal/` is missing; `PAYPAL_ADAPTER=real` would crash on import). Only the in-memory mock works, and its state is lost on restart. | The "Sandbox mode" banner would be inaccurate. With the mock, no PayPal sandbox is involved. | None from me; it's the PayPal teammate's work. The UI will say "Mock PayPal" or "PayPal sandbox" based on G2. |
| G2 | **The frontend can't tell which adapter or dev routes are active** | Needed for an honest mode banner and for showing or hiding the Demo panel | Extend `/health` to return `{ ok, paypal_adapter, paypal_env, dev_routes }` (~3 lines in `main.py`). |
| G3 | **The PayPal invoice link is thrown away.** `SentInvoice.payer_view_url` isn't stored. | Can't show "View on PayPal" | Add `invoices.payer_view_url text` (migration `0002`) and set it in the `send_invoice` transition (`_SETTABLE` += column). Fallback without a change: build the sandbox link `https://www.sandbox.paypal.com/invoice/p/#<paypal_invoice_id>` in the UI, only when the adapter is not mock. |
| G4 | **No way to complete a payout in mock/demo.** Nothing moves `submitted → succeeded` without a real PayPal webhook, and the browser can't post a mock webhook because the CORS allow-list excludes the `paypal-transmission-sig` header. | The demo ends at "Submitted to PayPal" | Add `POST /dev/simulate-payout/{action_id}?outcome=success\|denied` that calls `handle_payout_batch` (~15 lines in `dev/router.py`). |
| G5 | **`/dev/*` routes have no auth and no owner check** | Anyone could mark any invoice as paid while dev routes are on | Add `Depends(get_user_id)` and `owner_id = %s` to the dev routes. Doing this also makes G4 safe. |
| G6 | **There's no structured "needs clarification" signal** | Quick replies can only come from heuristics on the reply text | Option A (smallest): the UI treats a reply ending in `?` with no successful write tool as a question, offers generic chips ("Use USD", etc.) when it mentions currency or email, and always offers free text. Option B: add an `ask_user(question, options[])` tool whose result the API returns as `{ run_id, reply, question?: { text, options } }`. **I'd go with A for now.** |
| G7 | **No profile endpoint.** New sign-ups have no `profiles` row, so the name falls back to "You", the currency to USD, and there's nothing to edit in Settings. | Onboarding and Settings can't save a name or currency | Add `GET/PUT /api/profile` (upsert `display_name`, `default_currency` ∈ USD/GBP/EUR), or a trigger on `auth.users` that creates the row. |
| G8 | **Currencies: the backend allows only USD, GBP and EUR.** The brief asks for KES, ZAR and NGN. | The agent will refuse KES/ZAR/NGN invoices | No change proposed: PayPal invoicing doesn't support KES or NGN anyway. The UI formats any ISO code correctly but offers only USD/GBP/EUR for creation. There are no FX rates, so there's no KES equivalent. |
| G9 | **Overdue can't be demoed.** `due_in_days ≥ 0`, so an invoice can only become overdue after a real wait. | Can't show reconciliation or the reminder flow live | Add `POST /dev/seed-demo` (authenticated): creates realistic historic invoices (one paid, one overdue) via the adapter so `/dev/run-chase` can then draft a reminder. |
| G10 | **A payout stuck in `executing` and a `failed` payout can't be retried** | No retry button is possible | Out of scope for the MVP (the backend README already notes it). The UI shows a "Waiting for PayPal to confirm" state and directs the user to support. |
| G11 | **No cancel or edit for invoices.** The agent sends immediately; there's no confirm step. | "Confirm/Edit/Cancel" on an invoice card can't be implemented | No change: the UI shows a *post-hoc* confirmation card ("Sent", with a link). Confirm/Reject applies to payouts and reminders, where the backend really does gate on approval. |
| G12 | Payout **fees** aren't known to the backend | | The UI states "PayPal fees, if any, are deducted by PayPal", and doesn't invent a number. |

**Lower-risk notes (no change needed)**
- No pagination on reads. Supabase `.range()` handles it client-side and the volumes are small.
- An audit log exists (`activity_log`), so the UI can show a complete timeline.
- Agent latency is several seconds with no stream. The UI shows the live step trace from realtime `activity_log`.
- `contacts` has no update or delete endpoint. The Payees screen is list and add only.
- The webhook `INVOICING.INVOICE.PAID` handler calls `adapter.get_invoice`. With the mock after a restart, this
  returns "unknown invoice", so use `/dev/simulate-paid` for the demo.
- `seed.sql` still has a TODO for Sarah's sandbox email.

## Plan vs code (trusting the code)
- The brief says PayPal MCP / Agent Toolkit. The code uses a Gemini function-calling loop with 6 custom tools.
- The brief says the agent "creates" the invoice for confirmation. In the code it's **created and sent immediately**,
  and only payouts and reminders are human-gated.
- The brief's statuses (Awaiting Payment, Paid, Overdue, Draft) map as follows:
  `sent` → Awaiting payment, `sent` + past due → Overdue (derived), `paid` → Paid, `draft` → Draft (transient), plus
  `cancelled` and `failed`.
- The brief describes follow-up emails. In the code these are `invoice_reminder` pending actions sent through PayPal's invoice
  reminder (not email from us), editable via `approve { message }`.

---

## 8. Types

`frontend/src/types/api.ts` mirrors the real shapes above: table rows as Supabase returns them, API
request/response bodies, the error envelope, tool-call result shapes and enum unions.
