import type { AgDataSourcesDefinition, AgFieldDefinition, AgRelationDefinition } from "ag-studio";
import type { ActivityLogEntry, Contact, Invoice, PendingAction } from "@/types/api";
import { daysOverdue } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { ACTION_STAGES, actionStage, actionStatusDisplay, invoiceDisplayStatus, invoiceStatusDisplay } from "@/lib/status";

/**
 * AG Studio data model for PaySasa. Money never mixes currencies: every amount is split into one field per
 * currency (e.g. amountKES, amountUSD), each formatted in its own currency.
 */
export const STUDIO_CURRENCIES = ["KES", "USD", "EUR", "GBP", "CAD", "AUD", "CHF"] as const;
type Cur = (typeof STUDIO_CURRENCIES)[number];

export interface StudioInput {
  invoices: Invoice[];
  actions: PendingAction[];
  contacts: Contact[];
  activity: ActivityLogEntry[];
  now?: Date;
}

const CALENDAR = "calendar";
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const major = (minor: number | null | undefined) => (minor == null ? null : minor / 100);

/** One numeric field per currency, null for rows in other currencies. */
function perCurrency<P extends string>(prefix: P, minor: number | null, currency: string | null): { [K in `${P}${Cur}`]: number | null } {
  const code = (currency ?? "").trim().toUpperCase();
  return Object.fromEntries(STUDIO_CURRENCIES.map((c) => [`${prefix}${c}`, code === c ? major(minor) : null])) as { [K in `${P}${Cur}`]: number | null };
}

function agingBucket(days: number, open: boolean): string | null {
  if (!open) return null;
  if (days <= 0) return "0 days (not yet due)";
  if (days <= 30) return "1-30 days late";
  if (days <= 60) return "31-60 days late";
  return "61+ days late";
}

export function buildRows({ invoices, actions, contacts, activity, now = new Date() }: StudioInput) {
  const nameOf = new Map(contacts.map((c) => [c.id, c.name]));
  const clients = contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, role: c.role === "contractor" ? "Contractor" : "Client" }));

  const invoiceRows = invoices.map((inv) => {
    const status = invoiceDisplayStatus(inv, now);
    const open = inv.status === "sent";
    const late = open ? daysOverdue(inv.due_date, now) : 0;
    const issued = inv.status === "sent" || inv.status === "paid";
    const paid = inv.status === "paid";
    const daysToPay = paid && inv.sent_at && inv.paid_at ? Math.max(0, Math.round((Date.parse(inv.paid_at) - Date.parse(inv.sent_at)) / 86_400_000)) : null;
    return {
      id: inv.id,
      clientId: inv.contact_id,
      description: inv.description,
      currency: inv.currency.trim(),
      status: invoiceStatusDisplay(status).label,
      statusGroup: paid ? "Paid" : open ? "Open" : "Closed",
      createdDate: day(inv.created_at),
      dueDate: inv.due_date,
      paidDate: day(inv.paid_at),
      daysOverdue: late,
      agingBucket: agingBucket(late, open),
      daysToPay,
      invoiceCount: 1,
      ...perCurrency("invoiced", issued ? inv.amount_minor : null, inv.currency),
      ...perCurrency("collected", paid ? inv.amount_minor : null, inv.currency),
      ...perCurrency("outstanding", open ? inv.amount_minor : null, inv.currency),
      ...perCurrency("overdue", open && late > 0 ? inv.amount_minor : null, inv.currency),
    };
  });

  const payoutRows = actions
    .filter((a) => a.type === "payout")
    .map((a) => {
      const stage = actionStage(a.status);
      return {
        id: a.id,
        invoiceId: a.trigger_invoice_id,
        payeeId: a.payee_contact_id,
        payee: (a.payee_contact_id && nameOf.get(a.payee_contact_id)) || "Unknown",
        stage: ACTION_STAGES[stage].label,
        stageOrder: ACTION_STAGES[stage].order,
        status: actionStatusDisplay(a.status, a.type).label,
        currency: (a.currency ?? "").trim(),
        createdDate: day(a.created_at),
        splitPercent: a.split_percent == null ? null : Number(a.split_percent),
        payoutCount: 1,
        needsApproval: a.status === "awaiting_approval" ? 1 : 0,
        ...perCurrency("amount", a.amount_minor, a.currency),
        ...perCurrency("paidOut", a.status === "succeeded" ? a.amount_minor : null, a.currency),
      };
    });

  const ACTORS: Record<string, string> = { agent: "PaySasa agent", user: "You", paypal: "PayPal", system: "System" };
  const activityRows = activity.map((e) => ({
    id: String(e.id),
    date: day(e.created_at),
    actor: ACTORS[e.actor] ?? e.actor,
    area: e.event.startsWith("agent.") ? "Agent tool call" : e.event.split(".")[0].replace(/^\w/, (c) => c.toUpperCase()),
    event: e.event,
    message: e.message,
    eventCount: 1,
  }));

  const AGING_ORDER = ["0 days (not yet due)", "1-30 days late", "31-60 days late", "61+ days late"];
  const receivables = invoiceRows
    .filter((r) => r.statusGroup === "Open")
    .map((r) => ({
      id: r.id,
      client: nameOf.get(r.clientId) ?? "Unknown",
      agingBucket: r.agingBucket ?? AGING_ORDER[0],
      agingOrder: AGING_ORDER.indexOf(r.agingBucket ?? AGING_ORDER[0]),
      daysOverdue: r.daysOverdue,
      currency: r.currency,
      ...Object.fromEntries(STUDIO_CURRENCIES.map((c) => [`outstanding${c}`, r[`outstanding${c}` as keyof typeof r] ?? null])),
    }));

  return { clients, invoices: invoiceRows, receivables, payouts: payoutRows, activity: activityRows };
}

export type StudioRows = ReturnType<typeof buildRows>;

// --- Field helpers ------------------------------------------------------------------

type Spec = [id: string, name: string, format: AgFieldDefinition["format"], hide?: boolean, description?: string];
const fields = (specs: Spec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide, description]) => ({ id, name, format, ...(hide && { hide }), ...(description && { description }) }));

/** Money fields for each currency, each formatted with Intl in its own currency. */
function moneyFields(prefix: string, label: string, description: string): AgFieldDefinition[] {
  return STUDIO_CURRENCIES.map((c: Cur) => ({
    id: `${prefix}${c}`,
    name: `${label} (${c})`,
    description: `${description} Only ${c} invoices; never add to other currencies.`,
    format: "currencyFormat",
    createValueFormatter: () => (v: number | null | undefined) => (v == null ? "" : formatMoney(Math.round(v * 100), c)),
  }));
}

const manyToOne = (id: string, source: string, target: string): AgRelationDefinition => {
  const [st, sf] = source.split(".");
  const [tt, tf] = target.split(".");
  return { id, source: { tableId: st, fieldId: sf }, target: { tableId: tt, fieldId: tf }, type: "many-to-one" };
};
const onCalendar = (tableId: string, fieldId: string): AgRelationDefinition => ({
  id: `${tableId}-${fieldId}-calendar`,
  source: { tableId, fieldId },
  target: { calendarId: CALENDAR },
});

export function buildStudioData(rows: StudioRows, now = new Date()): AgDataSourcesDefinition {
  // Studio reads the calendar when it's created (the page remounts it when the sample toggle changes).
  // Start at the earliest row, or 30 days back, and end today: new live rows are always dated today.
  const dates = [...rows.invoices.map((r) => r.createdDate), ...rows.payouts.map((r) => r.createdDate), ...rows.activity.map((r) => r.date)]
    .filter((d): d is string => !!d)
    .sort();
  const windowStart = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const windowEnd = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const from = dates[0] && dates[0] < windowStart ? dates[0] : windowStart;
  return {
    description:
      "PaySasa: invoices a freelancer sent through PayPal, payouts to collaborators that need human approval, and an audit log of everything the AI agent, PayPal and the user did. " +
      "Money is split into one field per currency (e.g. invoicedUSD, invoicedGBP); never add fields of different currencies together.",
    sources: [
      {
        id: "clients",
        name: "Contacts",
        description: "People the user invoices (clients) or pays (contractors).",
        data: rows.clients,
        fields: fields([
          ["id", "Contact ID", "textFormat", true],
          ["name", "Contact", "textFormat"],
          ["email", "Email", "textFormat"],
          ["role", "Role", "textFormat"],
        ]),
      },
      {
        id: "invoices",
        name: "Invoices",
        description: "One row per PayPal invoice. Open means sent and not yet paid.",
        data: rows.invoices,
        fields: [
          ...fields([
            ["id", "Invoice ID", "textFormat", true],
            ["clientId", "Client ID", "textFormat", true],
            ["description", "Invoice for", "textFormat"],
            ["currency", "Currency", "textFormat"],
            ["status", "Invoice status", "textFormat"],
            ["statusGroup", "Status group", "textFormat"],
            ["createdDate", "Invoice date", "dateFormat"],
            ["dueDate", "Due date", "dateFormat"],
            ["paidDate", "Paid date", "dateFormat"],
            ["daysOverdue", "Days overdue", "integerFormat"],
            ["agingBucket", "Aging", "textFormat", false, "How late an open invoice is."],
            ["daysToPay", "Days to pay", "integerFormat", false, "Days from sending to payment, for paid invoices."],
            ["invoiceCount", "Invoices", "integerFormat"],
          ]),
          ...moneyFields("invoiced", "Invoiced", "Value of sent or paid invoices."),
          ...moneyFields("collected", "Collected", "Value of paid invoices."),
          ...moneyFields("outstanding", "Outstanding", "Value of invoices awaiting payment."),
          ...moneyFields("overdue", "Overdue", "Value of invoices past their due date."),
        ],
      },
      {
        id: "receivables",
        name: "Open receivables",
        description: "Only invoices still awaiting payment, with how late each one is.",
        data: rows.receivables,
        fields: [
          ...fields([
            ["id", "Invoice ID", "textFormat", true],
            ["client", "Client", "textFormat"],
            ["agingBucket", "Aging", "textFormat"],
            ["agingOrder", "Aging order", "integerFormat", true],
            ["daysOverdue", "Days overdue", "integerFormat"],
            ["currency", "Currency", "textFormat"],
          ]),
          ...moneyFields("outstanding", "Outstanding", "Value still awaiting payment."),
        ],
      },
      {
        id: "payouts",
        name: "Payouts",
        description: "Payouts to contractors. Locked until the linked invoice is paid, then they need the user's approval.",
        data: rows.payouts,
        fields: [
          ...fields([
            ["id", "Payout ID", "textFormat", true],
            ["invoiceId", "Invoice ID", "textFormat", true],
            ["payeeId", "Payee ID", "textFormat", true],
            ["payee", "Payee", "textFormat"],
            ["stage", "Stage", "textFormat"],
            ["stageOrder", "Stage order", "integerFormat", true],
            ["status", "Payout status", "textFormat"],
            ["currency", "Payout currency", "textFormat"],
            ["createdDate", "Scheduled date", "dateFormat"],
            ["splitPercent", "Split %", "decimalFormat"],
            ["payoutCount", "Payouts", "integerFormat"],
            ["needsApproval", "Awaiting approval", "integerFormat", false, "1 when the payout is waiting for the user's approval."],
          ]),
          ...moneyFields("amount", "Payout amount", "Scheduled payout amount."),
          ...moneyFields("paidOut", "Paid out", "Payouts PayPal confirmed as completed."),
        ],
      },
      {
        id: "activity",
        name: "Activity",
        description: "Audit log: every action by the AI agent, PayPal, the system and the user.",
        data: rows.activity,
        fields: fields([
          ["id", "Event ID", "textFormat", true],
          ["date", "Date", "dateFormat"],
          ["actor", "Who", "textFormat"],
          ["area", "Area", "textFormat"],
          ["event", "Event", "textFormat"],
          ["message", "What happened", "textFormat"],
          ["eventCount", "Events", "integerFormat"],
        ]),
      },
    ],
    relationships: [
      manyToOne("invoice-client", "invoices.clientId", "clients.id"),
      manyToOne("payout-invoice", "payouts.invoiceId", "invoices.id"),
      onCalendar("invoices", "createdDate"),
      onCalendar("payouts", "createdDate"),
      onCalendar("activity", "date"),
    ],
    calendars: [
      {
        id: CALENDAR,
        label: "Calendar",
        range: { from: { type: "date", value: from }, to: { type: "date", value: windowEnd } },
        fragments: ["year", "quarter", "month", "week", "day", "dayOfWeek"],
      },
    ],
  };
}
