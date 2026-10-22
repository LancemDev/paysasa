import type { ActivityLogEntry, Contact, Invoice, PendingAction } from "@/types/api";
import type { StudioInput } from "./studioData";

/**
 * Demo-only sample history: six months of invoices and payouts for Kwame, so a fresh sandbox account has
 * something to analyse. Deterministic (seeded), clearly labelled in the UI, never sent to the backend and
 * never mixed into the live dashboard grids. Ids are prefixed "sample-".
 */
const OWNER = "sample-owner";
const CLIENTS: [name: string, email: string, currency: "USD" | "GBP" | "EUR", base: number][] = [
  ["Northwind Media", "ap@northwind.example", "USD", 1800],
  ["Brightline Studios", "finance@brightline.example", "GBP", 950],
  ["Karoo Films", "accounts@karoo.example", "USD", 1200],
  ["Lumen Agentur", "rechnung@lumen.example", "EUR", 1100],
  ["Savanna Coffee Co.", "hello@savanna.example", "USD", 600],
];
const PROJECTS = ["Brand film", "Social cut-downs", "Pitch deck design", "Product launch video", "Event highlights", "Logo refresh", "Motion graphics pack"];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function sampleHistory(now = new Date()): StudioInput {
  const rand = rng(20261022);
  const iso = (d: Date) => d.toISOString();
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  const contacts: Contact[] = CLIENTS.map(([name, email], i) => ({ id: `sample-client-${i}`, owner_id: OWNER, name, email, role: "client", aliases: [], created_at: iso(addDays(now, -200)) }));
  const editor: Contact = { id: "sample-sarah", owner_id: OWNER, name: "Sarah", email: "sarah@sample.example", role: "contractor", aliases: ["my editor"], created_at: iso(addDays(now, -200)) };
  contacts.push(editor);

  const invoices: Invoice[] = [];
  const actions: PendingAction[] = [];
  const activity: ActivityLogEntry[] = [];
  let seq = 0;
  const log = (at: Date, actor: ActivityLogEntry["actor"], event: string, message: string) =>
    activity.push({ id: -(++seq), owner_id: OWNER, actor, event, message, entity_type: null, entity_id: null, details: {}, created_at: iso(at) });

  for (let k = 0; k < 26; k++) {
    const [name, , currency, base] = CLIENTS[Math.floor(rand() * CLIENTS.length)];
    const clientIdx = CLIENTS.findIndex((c) => c[0] === name);
    const created = addDays(now, -Math.floor(5 + rand() * 175));
    const due = addDays(created, 14);
    const amount = Math.round((base * (0.6 + rand() * 0.9)) / 10) * 1000; // whole tens, in minor units
    const age = (now.getTime() - created.getTime()) / 86_400_000;
    // Older invoices are usually paid; a few stay open or go overdue.
    const roll = rand();
    const paid = age > 20 ? roll < 0.85 : roll < 0.3;
    const paidAt = paid ? addDays(created, Math.min(age - 1, 3 + Math.floor(rand() * 24))) : null;
    const id = `sample-inv-${k}`;
    const description = PROJECTS[Math.floor(rand() * PROJECTS.length)];
    invoices.push({
      id,
      owner_id: OWNER,
      contact_id: `sample-client-${clientIdx}`,
      paypal_invoice_id: `INV2-SAMPLE-${String(k + 1).padStart(4, "0")}`,
      description,
      amount_minor: amount,
      currency,
      status: paid ? "paid" : "sent",
      paypal_status: paid ? "PAID" : "SENT",
      due_date: iso(due).slice(0, 10),
      sent_at: iso(created),
      paid_at: paidAt ? iso(paidAt) : null,
      last_reminder_at: null,
      error: null,
      agent_run_id: null,
      created_at: iso(created),
      updated_at: iso(paidAt ?? created),
    });
    log(created, "agent", "invoice.sent", `Sent ${name} an invoice for ${description}`);
    if (paidAt) log(paidAt, "paypal", "invoice.paid", `${name} paid for ${description}`);

    if (rand() < 0.55) {
      const payout = Math.floor(amount * 0.2);
      const status: PendingAction["status"] = !paid ? "locked" : age > 25 ? "succeeded" : rand() < 0.5 ? "awaiting_approval" : "submitted";
      actions.push({
        id: `sample-pay-${k}`,
        owner_id: OWNER,
        type: "payout",
        status,
        trigger_invoice_id: id,
        payee_contact_id: editor.id,
        amount_minor: payout,
        currency,
        split_percent: 20,
        summary: `Payout Sarah 20% of ${description}`,
        draft_message: null,
        idempotency_key: `sample-${k}`,
        paypal_payout_batch_id: status === "succeeded" || status === "submitted" ? `SAMPLEBATCH${k}` : null,
        error: null,
        decided_at: paidAt ? iso(addDays(paidAt, 1)) : null,
        executed_at: status === "succeeded" ? iso(addDays(paidAt!, 1)) : null,
        agent_run_id: null,
        created_at: iso(created),
        updated_at: iso(paidAt ?? created),
      });
      log(created, "agent", "payout.scheduled", `Scheduled a 20% payout to Sarah for ${description}`);
      if (status === "succeeded") log(addDays(paidAt!, 1), "user", "payout.approved", `You approved Sarah's payout for ${description}`);
    }
  }
  return { invoices, actions, contacts, activity, now };
}
