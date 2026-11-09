import type { Page, Route } from "@playwright/test";

/**
 * In-browser stand-in for Supabase (auth + PostgREST) and the FastAPI backend, following the real contracts in
 * docs/frontend-analysis.md. State changes mirror backend/server/app (agent tools, the paid webhook, approve).
 */
const USER = { id: "11111111-1111-4111-8111-111111111111", email: "demo@paysasa.app", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" };
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

export function createFakeBackend(page: Page) {
  const db = {
    profiles: [{ id: USER.id, display_name: "Kwame", default_currency: "USD", created_at: now() }],
    contacts: [
      { id: uuid(), owner_id: USER.id, name: "Daniel Carter", email: "daniel.carter@example.com", role: "client", aliases: [], created_at: now() },
      { id: uuid(), owner_id: USER.id, name: "Sarah", email: "sarah@sandbox.example.com", role: "contractor", aliases: ["my editor"], created_at: now() },
    ] as Record<string, unknown>[],
    invoices: [] as Record<string, unknown>[],
    pending_actions: [] as Record<string, unknown>[],
    agent_runs: [] as Record<string, unknown>[],
    activity_log: [] as Record<string, unknown>[],
  };
  let activityId = 1;
  const log = (actor: string, event: string, message: string, entity_type: string, entity_id: string, details = {}) =>
    db.activity_log.unshift({ id: activityId++, owner_id: USER.id, actor, event, message, entity_type, entity_id, details, created_at: now() });

  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS", "access-control-expose-headers": "*" };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });

  async function supabase(route: Route) {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    if (url.pathname === "/auth/v1/token") {
      return json(route, { access_token: "e2e-access-token", refresh_token: "e2e-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER });
    }
    if (url.pathname === "/auth/v1/user") return json(route, USER);
    if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: cors });
    const m = /^\/rest\/v1\/(\w+)$/.exec(url.pathname);
    if (m) {
      let rows = [...((db as Record<string, Record<string, unknown>[]>)[m[1]] ?? [])];
      for (const [k, v] of url.searchParams) {
        if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
      }
      const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      if (single) return rows.length ? json(route, rows[0]) : json(route, { code: "PGRST116", message: "no rows" }, 406);
      return json(route, rows);
    }
    return route.fulfill({ status: 404, headers: cors });
  }

  async function api(route: Route) {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname;
    if (path === "/health") return json(route, { ok: true });

    if (path === "/api/agent/message") {
      const { message } = req.postDataJSON() as { message: string };
      const runId = uuid();
      const [john, sarah] = db.contacts;
      const invoiceId = uuid();
      const actionId = uuid();
      const due = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
      const calls = [
        { name: "find_contact", args: { query: "Daniel Carter" }, result: { matches: [{ contact_id: john.id, name: "Daniel Carter", email: john.email, role: "client", aliases: [] }], count: 1 } },
        { name: "send_invoice", args: { contact_id: john.id, description: "Q3 Video Campaign", amount: "1200.00", currency: "USD" }, result: { invoice_id: invoiceId, status: "sent", contact: "Daniel Carter", amount: "$1,200.00", currency: "USD", due_date: due } },
        { name: "find_contact", args: { query: "my editor" }, result: { matches: [{ contact_id: sarah.id, name: "Sarah", email: sarah.email, role: "contractor", aliases: ["my editor"] }], count: 1 } },
        { name: "schedule_payout", args: { trigger_invoice_id: invoiceId, payee_contact_id: sarah.id, split_percent: 20 }, result: { action_id: actionId, status: "locked", summary: "Payout Sarah $240.00 upon settlement", amount: "$240.00", payee: "Sarah", needs_approval: true } },
      ];
      db.invoices.unshift({ id: invoiceId, owner_id: USER.id, contact_id: john.id, paypal_invoice_id: "INV2-MOCK-0001", description: "Q3 Video Campaign", amount_minor: 120000, currency: "USD", status: "sent", paypal_status: "SENT", due_date: due, sent_at: now(), paid_at: null, last_reminder_at: null, error: null, agent_run_id: runId, created_at: now(), updated_at: now() });
      log("agent", "invoice.sent", "Sent Daniel Carter a $1,200.00 invoice for Q3 Video Campaign", "invoice", invoiceId);
      db.pending_actions.unshift({ id: actionId, owner_id: USER.id, type: "payout", status: "locked", trigger_invoice_id: invoiceId, payee_contact_id: sarah.id, amount_minor: 24000, currency: "USD", split_percent: 20, summary: "Payout Sarah $240.00 upon settlement", draft_message: null, idempotency_key: `payout-${actionId}`, paypal_payout_batch_id: null, error: null, decided_at: null, executed_at: null, agent_run_id: runId, created_at: now(), updated_at: now() });
      log("agent", "payout.scheduled", "Payout Sarah $240.00 upon settlement", "pending_action", actionId);
      const reply = "Sent Daniel Carter a $1,200.00 invoice for the Q3 Video Campaign. Sarah's $240.00 payout is locked until Daniel pays, then it needs your approval.";
      db.agent_runs.unshift({ id: runId, owner_id: USER.id, user_message: message, reply, tool_calls: calls, status: "completed", error: null, created_at: now() });
      await new Promise((r) => setTimeout(r, 400));
      return json(route, { run_id: runId, reply });
    }

    const approve = /^\/api\/actions\/(.+)\/approve$/.exec(path);
    if (approve) {
      const a = db.pending_actions.find((x) => x.id === approve[1]);
      if (!a) return json(route, { error: { code: "not_found", message: "Action not found" } }, 404);
      if (a.status !== "awaiting_approval") return json(route, { error: { code: "conflict", message: `Action is ${a.status}, not awaiting approval` } }, 409);
      await new Promise((r) => setTimeout(r, 300));
      Object.assign(a, { status: "submitted", paypal_payout_batch_id: "MOCKBATCH000002", decided_at: now(), executed_at: now(), updated_at: now() });
      log("user", "payout.approved", "Kwame approved: Payout Sarah $240.00", "pending_action", String(a.id));
      return json(route, { action: a });
    }
    return json(route, { error: { code: "not_found", message: "Not Found" } }, 404);
  }

  /** What PayPal's INVOICE.PAID webhook does on the server: invoice paid, its locked payouts unlocked. */
  function clientPays() {
    const inv = db.invoices.find((i) => i.status === "sent");
    if (!inv) throw new Error("no sent invoice to pay");
    Object.assign(inv, { status: "paid", paid_at: now(), paypal_status: "PAID", updated_at: now() });
    log("paypal", "invoice.paid", "Daniel Carter paid $1,200.00 for Q3 Video Campaign", "invoice", String(inv.id));
    for (const a of db.pending_actions.filter((a) => a.trigger_invoice_id === inv.id && a.status === "locked")) {
      Object.assign(a, { status: "awaiting_approval", summary: "Payout Sarah $240.00", updated_at: now() });
      log("paypal", "payout.unlocked", "Payout Sarah $240.00 unlocked: needs your approval", "pending_action", String(a.id));
    }
  }

  return {
    db,
    clientPays,
    async install({ tour = false }: { tour?: boolean } = {}) {
      // The first-login welcome tour is covered by its own test; skip it elsewhere (keeps other saved settings).
      if (!tour)
        await page.addInitScript(() => {
          try {
            const k = "paysasa.settings.v1";
            localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? "{}"), setupDone: true }));
          } catch {
            /* ignore */
          }
        });
      await page.route("http://supabase.paysasa.test/**", supabase);
      await page.route("http://api.paysasa.test/**", api);
      // No realtime server in this test: the app must fall back to refetching.
      await page.routeWebSocket(/supabase\.paysasa\.test/, (ws) => ws.close());
    },
  };
}
