# PaySasa AI: Frontend

React + TypeScript + Vite app for PaySasa AI. It has a live AG Grid dashboard, an agent chat panel and a human-approval flow
for every money movement. It talks to the FastAPI backend in `backend/` for commands, and reads data directly from Supabase,
where row-level security limits each user to their own rows. Realtime updates also come from Supabase.

- Analysis of the backend contract: [`docs/frontend-analysis.md`](../docs/frontend-analysis.md)
- UX plan and design tokens: [`docs/ux-plan.md`](../docs/ux-plan.md)

## Install and run

Requirements: Node 20+ and a running backend (see `backend/README.md`) pointed at the same Supabase project.

```sh
cd frontend
npm install
cp .env.example .env      # fill in the values below
npm run dev               # http://localhost:3000
```

Port 3000 matches the backend's default `CORS_ORIGIN`. If you serve the app from anywhere else, add that origin to the
backend's `CORS_ORIGIN`.

### Environment variables (`.env.example`)

| Name | Required | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | yes | FastAPI base URL, e.g. `http://localhost:8000` |
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Supabase **public anon** key. Row-level security protects data. Never use the service-role key here. |
| `VITE_PAYPAL_MODE` | no | `mock` (default) or `sandbox`. Must match the backend's `PAYPAL_ADAPTER`; it controls the banner wording and the sandbox invoice link. |
| `VITE_ENABLE_DEMO` | no | `true` shows the labelled Demo helper (needs backend `ENABLE_DEV_ROUTES=true`) |
| `VITE_APPROVAL_SECOND_CONFIRM_MINOR` | no | Payouts at or above this many minor units need a second confirmation (default `50000` = 500.00). Users can override it in Settings. |
| `VITE_AG_GRID_LICENSE_KEY` | no | AG Grid Enterprise key (row grouping and aggregation). Without it, AG Grid shows a trial watermark and a console notice. |

If a required variable is missing, the app shows a "not configured" screen instead of crashing.

### Supabase auth settings

In Supabase → Authentication → URL configuration, add your site URL (`http://localhost:3000` and the Render URL) and
the redirect URLs `<site>/` and `<site>/update-password`. These are used for sign-up confirmation and password reset.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run preview` | Serve the production build on :3000 |
| `npm test` | Vitest unit and component tests (approval flow, money, status mapping, action cards, agent parsing) |
| `npm run e2e` | Playwright: the Kwame happy path (desktop and mobile), axe WCAG A/AA checks (light and dark), and a 360px layout check. It runs against an in-browser fake of the backend and Supabase contracts, so no live stack is needed. Run `npx playwright install chromium` once first. |

## Deploy to Render (static site)

`frontend/render.yaml` defines a static site, `paysasa-web`.

1. In Render, go to New → Blueprint, pick this repo, and set the **Blueprint path** to `frontend/render.yaml`. The backend
   has its own Blueprint at `backend/render.yaml`.
2. Fill in `VITE_API_BASE_URL` (the `paysasa-api` URL), `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Set
   `VITE_PAYPAL_MODE` to match the backend.
3. Add the static site's URL to the backend's `CORS_ORIGIN` and to Supabase's auth URLs.
4. `VITE_*` values are compiled in at build time, so redeploy after changing any of them.

The Blueprint rewrites every path to `index.html` so React Router works, and caches hashed assets for a year.

## How the UI maps to the user story

| Story step | Where it happens in the UI |
|---|---|
| 1. Kwame types the request | **Ask PaySasa** panel (right side on desktop; full-screen sheet from the sticky button on mobile). The demo prompt is one tap. |
| 2. Agent parses and sends a PayPal invoice | A live **step trace** ("Found contact John Doe", "Sent $1,200.00 invoice…") comes from realtime `activity_log` rows. An **Invoice sent via PayPal** card shows client, line item, amount, currency, due date and PayPal ID. |
| 3. "Awaiting payment" plus a locked payout | The Invoices grid groups the invoice under **Awaiting payment**. The Payouts grid and the **Payout scheduled** card show **🔒 Locked: Unlocks when John Doe's invoice is paid**. |
| 4. Client pays; the webhook updates the backend | Supabase Realtime pushes the row change. AG Grid applies it as a transaction (in-place update with a flash), and a toast says "John Doe paid $1,200.00". Without realtime, the app refetches every 15s. In rehearsals, use **Demo helper → Mark as paid**, which calls the backend's `/dev/simulate-paid` (the same code path as the webhook). |
| 5. Invoice shows Paid; payout asks for approval | The invoice moves to the **Paid** group. The payout moves to **Needs your approval**, and the header badge and Approvals queue show the count. |
| 6. Kwame approves; the backend executes the payout | The **Approve payout** modal says "This will send $240.00 USD to Sarah via PayPal" and shows the recipient, amount, fees note, triggering invoice and who proposed it. It's guarded against double submits and asks for a second confirmation above the threshold. After approval it shows **Submitted to PayPal** with the batch ID, and only says **Paid out** once PayPal confirms. |

## Code map

```
src/
  types/api.ts          types mirroring the real backend and DB shapes
  lib/api/              the only fetch layer: auth header, token refresh, friendly errors
  lib/queries.ts        Supabase reads (TanStack Query)
  lib/queryKeys.ts      query keys and cache helpers
  lib/realtime.tsx      one Realtime channel → cache updates and event listeners; polling fallback
  lib/money.ts          exact minor-unit formatting and per-currency totals
  lib/status.ts         status → label, icon and tone (never colour alone); derived "overdue"
  lib/agent.ts          tool calls → step trace, action cards, clarification detection
  features/agent/       chat panel, step trace, action cards
  features/dashboard/   AG Grid views, mobile card lists, invoice drawer
  features/approvals/   approval modal, decision hook, approvals queue
  features/{payees,settings,onboarding,demo}/
```
