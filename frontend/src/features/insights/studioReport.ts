import type { AgPageState, AgReportState, AgWidgetLayoutState } from "ag-studio";

// The built-in "PaySasa overview" report. Field ids ("invoices.collectedUSD") refer to ./studioData.ts.
// Canvas is 24 tracks wide. One y-axis per chart; money is per currency.
const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const legend = { style: { theme: { common: { legend: { enabled: true } } } } };

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

const cashflow: AgPageState = {
  id: "cashflow",
  widgets: {
    "kpi-invoiced": kpi("Invoiced (USD)", sum("invoices.invoicedUSD")),
    "kpi-collected": kpi("Collected (USD)", sum("invoices.collectedUSD")),
    "kpi-outstanding": kpi("Awaiting (USD)", sum("invoices.outstandingUSD"), false),
    "kpi-overdue": kpi("Overdue (USD)", sum("invoices.overdueUSD"), false),
    "invoiced-vs-collected": {
      type: "column-chart-grouped",
      dataMapping: { categoryKey: [{ id: "calendar::month" }], valueKey: [sum("invoices.invoicedUSD"), sum("invoices.collectedUSD")] },
      format: { ...title("Invoiced vs collected by month (USD)"), ...legend },
    },
    aging: {
      type: "bar-chart-grouped",
      dataMapping: { categoryKey: [{ id: "receivables.agingBucket" }], valueKey: [sum("receivables.outstandingUSD")] },
      // Bucket labels are named so they sort in lateness order.
      sort: [{ field: { id: "receivables.agingBucket" }, direction: "asc" }],
      format: title("Receivables aging (USD)"),
    },
    "top-clients": {
      type: "bar-chart-grouped",
      dataMapping: { categoryKey: [{ id: "clients.name" }], valueKey: [sum("invoices.invoicedUSD")] },
      sort: [{ field: sum("invoices.invoicedUSD"), direction: "desc" }],
      format: title("Top clients by invoiced (USD)"),
    },
    "by-currency": {
      type: "pivot-grid",
      dataMapping: {
        rows: [{ id: "invoices.statusGroup" }],
        columns: [],
        values: [sum("invoices.invoicedUSD"), sum("invoices.invoicedGBP"), sum("invoices.invoicedEUR")],
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

const guardrails: AgPageState = {
  id: "guardrails",
  widgets: {
    "kpi-awaiting": kpi("Payouts awaiting approval", sum("payouts.needsApproval"), false),
    "kpi-scheduled": kpi("Scheduled payouts (USD)", sum("payouts.amountUSD")),
    "kpi-paid-out": kpi("Paid out (USD)", sum("payouts.paidOutUSD")),
    pipeline: custom("paysasa-pipeline", "Money guardrail: where every payout is"),
    "by-payee": {
      type: "bar-chart-grouped",
      dataMapping: { categoryKey: [{ id: "payouts.payee" }], valueKey: [sum("payouts.amountUSD")] },
      format: title("Payouts by collaborator (USD)"),
    },
    "stage-grid": {
      type: "pivot-grid",
      dataMapping: {
        rows: [{ id: "payouts.stage" }],
        columns: [],
        values: [sum("payouts.payoutCount"), sum("payouts.amountUSD"), sum("payouts.amountGBP"), sum("payouts.amountEUR")],
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

// The filters panel starts collapsed: there are no report-level filters by default.
export const defaultReport: AgReportState = {
  selectedPageId: cashflow.id,
  pages: [cashflow, guardrails, agent],
  panels: { filters: { collapsed: true } },
};
