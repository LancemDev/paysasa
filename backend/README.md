# PaySasa AI: Backend

Everything here lives in `backend/`. FastAPI service in `server/`: the Gemini agent, the Supabase schema, the PayPal webhook, the approval endpoints and the overdue-chasing job. Only the adapter in `server/app/paypal/` (PayPal teammate) talks to PayPal; everything else calls the contract in `server/app/paypal_contract.py`.

### Environment variables

Copy `server/.env.example` to `server/.env` (git-ignored). On Render, set the same names in the service settings.

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (the pooler URL works) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Used to check users' Bearer tokens |
| `GEMINI_API_KEY`, `LLM_MODEL` | Gemini key and model name, e.g. a current Gemini Flash model |
| `PAYPAL_ADAPTER` | `mock` (default) or `real` |
| `MAX_AMOUNT_MINOR` | Per-invoice and per-payout cap in cents (default `1000000` = $10,000) |
| `ENABLE_DEV_ROUTES` | `true` mounts `/dev/*` for rehearsals; set `false` after the video is recorded |
| `CORS_ORIGIN` | The frontend's URL (comma-separate several) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV` | Sandbox values from the PayPal teammate, read only by the real adapter |

### Database

1. In the Supabase SQL editor (or `supabase db push`), run `supabase/migrations/0001_init.sql`.
2. Sign up the demo user (email `demo@paysasa.app`, or edit the email at the top of `seed.sql`).
3. Put Sarah's PayPal sandbox email into `supabase/seed.sql` and run it. It is safe to re-run.

Users can only read their own rows (row-level security); all writes go through the API using the service connection. `invoices`, `pending_actions`, `contacts` and `activity_log` are in the realtime publication. To see live changes reach a subscriber, run `server/scripts/realtime_check.py` (usage in the file).

### Run locally with the mock adapter

```sh
cd server
uv venv --python 3.12 .venv && uv pip install -r requirements.txt   # or python -m venv + pip
cp .env.example .env    # fill in DATABASE_URL, SUPABASE_*, GEMINI_API_KEY, LLM_MODEL
.venv/bin/uvicorn app.main:app --reload
```

With `PAYPAL_ADAPTER=mock`, invoices and payouts are stored in memory and `POST /dev/simulate-paid/<invoice id>` stands in for the buyer paying. The mock accepts a webhook whose `paypal-transmission-sig` header is `mock-valid-signature`.

Run the chase job once: `python -m app.jobs.chase` (or `POST /dev/run-chase`).

### Tests

The tests use a real Postgres and the mock adapter. `TEST_DATABASE_URL` must point at a server where you can create databases; each run creates and drops its own database and adds a small Supabase shim (`tests/supabase_shim.sql`).

```sh
cd server
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres .venv/bin/python -m pytest
```

### API

All `/api/*` routes need `Authorization: Bearer <Supabase access token>`. Errors look like `{ "error": { "code", "message" } }`.

| Method & path | Body | Returns |
|---|---|---|
| `POST /api/agent/message` | `{ message }` (max 2,000 chars) | `{ run_id, reply }` |
| `GET /api/agent/runs?limit=20` | | `[{ id, user_message, reply, status, created_at }]` |
| `POST /api/actions/:id/approve` | `{ message? }` (edits a reminder's draft) | `{ action }`; 409 unless awaiting approval |
| `POST /api/actions/:id/reject` | `{ reason? }` | `{ action }`; 409 unless awaiting approval |
| `POST /api/contacts` | `{ name, email, role, aliases? }` | `{ contact }` (201) |
| `POST /webhooks/paypal` | PayPal event | 200 / 400 bad signature / 500 retry |
| `GET /health` | | `{ ok: true }` |
| `POST /dev/simulate-paid/:invoiceId` | | `{ invoice }` (dev only) |
| `POST /dev/run-chase` | | `{ created }` (dev only) |

### Deploy (Render)

`backend/render.yaml` defines the web service `paysasa-api` and the daily cron job `paysasa-chase` (06:00 UTC), both rooted at `backend/server`. Because the file is not at the repo root, set the Blueprint path to `backend/render.yaml` when creating the Blueprint on Render. Once the web service is live, the PayPal webhook URL is `https://<service>.onrender.com/webhooks/paypal`, subscribed to `INVOICING.INVOICE.PAID`, `INVOICING.INVOICE.CANCELLED`, `PAYMENT.PAYOUTSBATCH.SUCCESS` and `PAYMENT.PAYOUTSBATCH.DENIED`.

### Open questions (backend additions to spec Section 15)

- **Real adapter entry point.** `deps.get_adapter()` loads it with `from app.paypal import get_paypal_adapter`, a zero-argument function returning an object that implements `PayPalAdapter`. The PayPal teammate needs to confirm or change that name.
- **Bad-signature logging.** The spec asks for a `system` activity row on a rejected webhook, but `activity_log.owner_id` is `not null` and an unverified body can't be trusted to name an owner. For now the rejection goes to the server log only.
- **Payout with an unknown outcome.** If `execute_payout` fails with something other than `PayPalError` (e.g. a timeout), the action stays `executing`, because PayPal may have accepted it. The idempotency key makes a manual retry safe, but the MVP has no retry button.
