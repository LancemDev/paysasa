import type { AgPageState, AgReportState, AgWidgetLayoutState } from "ag-studio";
import { STUDIO_CURRENCIES } from "./studioData";

// The built-in "PaySasa overview" report. Field ids like "invoices.collected" are the canonical
// display-currency fields; "invoices.collectedKES" etc. are the per-currency fields.
// Canvas is 24 tracks wide. One y-axis per chart; money is per currency.
const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const legend = { style: { theme: { common: { legend: { enabled: true } } } } };
const moneySums = (prefix: string) => STUDIO_CURRENCIES.map((c) => sum(`${prefix}${c}`));

/** PaySasa custom widgets (see ./widgets/registry.ts); typed loosely because AgPageState only knows built-ins. */
const custom = (type: string, text: string) => ({ type, format: title(text) }) as unknown as NonNullable<AgPageState["widgets"]>[string];

const kpi = (text: string, value: ReturnType<typeof sum>, sparkline = true) => ({
  type: "value" as const,
  dataMapping: { value: [value], ...(sparkline && { sparklineX: [{ id: "calendar::month" }] }) },
  format: { title: { enabled: true, text } },
});

export const PAGE_TITLES: Record<string, string> = {
  cashflow: "Cash flow",
  guardrails: "Payouts & approvals",
  agent: "Agent audit trail",
};

function cashflowPage(currency: string): AgPageState {
  return {
    id: "cashflow",
    widgets: {
      "kpi-invoiced": kpi(`Invoiced (${currency})`, sum("invoices.invoiced")),
      "kpi-collected": kpi(`Collected (${currency})`, sum("invoices.collected")),
      "kpi-outstanding": kpi(`Awaiting (${currency})`, sum("invoices.outstanding"), false),
      "kpi-overdue": kpi(`Overdue (${currency})`, sum("invoices.overdue"), false),
      "invoiced-vs-collected": {
        type: "column-chart-grouped",
        dataMapping: { categoryKey: [{ id: "calendar::month" }], valueKey: [sum("invoices.invoiced"), sum("invoices.collected")] },
        format: { ...title(`Invoiced vs collected by month (${currency})`), ...legend },
      },
      aging: {
        type: "bar-chart-grouped",
        dataMapping: { categoryKey: [{ id: "receivables.agingBucket" }], valueKey: [sum("receivables.outstanding")] },
        // Bucket labels are named so they sort in lateness order.
        sort: [{ field: { id: "receivables.agingBucket" }, direction: "asc" }],
        format: title(`Receivables aging (${currency})`),
      },
      "top-clients": {
        type: "bar-chart-grouped",
        dataMapping: { categoryKey: [{ id: "clients.name" }], valueKey: [sum("invoices.invoiced")] },
        sort: [{ field: sum("invoices.invoiced"), direction: "desc" }],
        format: title(`Top clients by invoiced (${currency})`),
      },
      "by-currency": {
        type: "pivot-grid",
        dataMapping: {
          rows: [{ id: "invoices.statusGroup" }],
          columns: [],
          values: moneySums("invoices.invoiced"),
        },
        format: title("Invoiced by status, each currency separately"),
      },
      approvals: custom("paysasa-approvals", "Needs your approval"),
    },
    widgetLayout: {
      "kpi-invoiced": at(0, 0, 6, 7),
      "kpi-collected": at(6, 0, 6, 7),
      "kpi-outstanding": at(12, 0, 6, 7),
      "kpi-overdue": at(18, 0, 6, 7),
      "invoiced-vs-collected": at(0, 7, 16, 18),
      approvals: at(16, 7, 8, 18),
      aging: at(0, 25, 12, 16),
      "top-clients": at(12, 25, 12, 16),
      "by-currency": at(0, 41, 24, 12),
    },
  };
}

function guardrailsPage(currency: string): AgPageState {
  return {
    id: "guardrails",
    widgets: {
      "kpi-awaiting": kpi("Payouts awaiting approval", sum("payouts.needsApproval"), false),
      "kpi-scheduled": kpi(`Scheduled payouts (${currency})`, sum("payouts.amount")),
      "kpi-paid-out": kpi(`Paid out (${currency})`, sum("payouts.paidOut")),
      pipeline: custom("paysasa-pipeline", "Money guardrail: where every payout is"),
      "by-payee": {
        type: "bar-chart-grouped",
        dataMapping: { categoryKey: [{ id: "payouts.payee" }], valueKey: [sum("payouts.amount")] },
        format: title(`Payouts by collaborator (${currency})`),
      },
      "stage-grid": {
        type: "pivot-grid",
        dataMapping: {
          rows: [{ id: "payouts.stage" }],
          columns: [],
          values: [sum("payouts.payoutCount"), ...moneySums("payouts.amount")],
        },
        format: title("Payouts by stage, each currency separately"),
      },
    },
    widgetLayout: {
      "kpi-awaiting": at(0, 0, 8, 7),
      "kpi-scheduled": at(8, 0, 8, 7),
      "kpi-paid-out": at(16, 0, 8, 7),
      pipeline: at(0, 7, 24, 12),
      "by-payee": at(0, 19, 8, 16),
      "stage-grid": at(8, 19, 16, 16),
    },
  };
}

const agent: AgPageState = {
  id: "agent",
  widgets: {
    "kpi-events": kpi("Recorded actions", sum("activity.eventCount")),
    "by-actor": {
      type: "column-chart-stacked",
      dataMapping: { categoryKey: [{ id: "calendar::month" }], valueKey: [sum("activity.eventCount")], legendKey: [{ id: "activity.actor" }] },
      format: { ...title("Who did what, by month"), ...legend },
    },
    "by-area": {
      type: "bar-chart-grouped",
      dataMapping: { categoryKey: [{ id: "activity.area" }], valueKey: [sum("activity.eventCount")] },
      sort: [{ field: sum("activity.eventCount"), direction: "desc" }],
      format: title("Actions by area"),
    },
    log: {
      type: "grid",
      dataMapping: { cols: [{ id: "activity.date" }, { id: "activity.actor" }, { id: "activity.message" }, { id: "activity.event" }] },
      sort: [{ field: { id: "activity.date" }, direction: "desc" }],
      format: title("Audit log"),
    },
  },
  widgetLayout: {
    "kpi-events": at(0, 0, 8, 7),
    "by-area": at(8, 0, 16, 14),
    "by-actor": at(0, 14, 24, 16),
    log: at(0, 30, 24, 20),
  },
};

/** The PaySasa overview with its money labels and canonical fields in `currency`. */
export function buildDefaultReport(currency: string): AgReportState {
  const code = currency.trim().toUpperCase() || "KES";
  const cashflow = cashflowPage(code);
  const guardrails = guardrailsPage(code);
  return {
    selectedPageId: cashflow.id,
    pages: [cashflow, guardrails, agent],
    panels: { filters: { collapsed: true } },
  };
}

/** Backwards-compatible default (KES) for callers that don't have a profile yet. */
export const defaultReport = buildDefaultReport("KES");
