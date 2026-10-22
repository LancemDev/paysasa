import type { AgBaseRegistry, AgBaseWidgetDefinition, AgDefaultRegistry, AgWidgetsConfig } from "ag-studio";
import { createWidgets } from "ag-studio-react";
import { ApprovalQueueWidget } from "./ApprovalQueueWidget";
import { PipelineWidget } from "./PipelineWidget";

type PaySasaWidgetType = "paysasa-approvals" | "paysasa-pipeline";
type CustomDef = AgBaseWidgetDefinition<PaySasaWidgetType>;

export interface PaySasaRegistry extends AgBaseRegistry {
  widgets: readonly (AgDefaultRegistry["widgets"][number] | CustomDef)[];
  formats: AgDefaultRegistry["formats"];
}

const approvals: CustomDef = {
  id: "paysasa-approvals",
  label: "Approval queue",
  icon: "shield",
  comp: ApprovalQueueWidget,
  form: (p) => ({ ...p.createDefaults({}), items: [p.createTitleSection()] }) as never,
  defaultState: { format: { title: { enabled: true, text: "Needs your approval" } } } as never,
  defaultSize: { width: 8, height: 16 },
  minSize: { width: 5, height: 10 },
  ai: {
    label: "Approval queue",
    description: "Live list of payouts and reminders waiting for the user's approval, with a Review button that opens the approval dialog.",
    usage: "Add when the user wants to see or act on pending approvals. It needs no data mapping.",
  },
};

const pipeline: CustomDef = {
  id: "paysasa-pipeline",
  label: "Payout guardrail pipeline",
  icon: "chevron-right",
  comp: PipelineWidget,
  form: (p) => ({ ...p.createDefaults({}), items: [p.createTitleSection()] }) as never,
  defaultState: { format: { title: { enabled: true, text: "Where every payout is" } } } as never,
  defaultSize: { width: 24, height: 12 },
  minSize: { width: 10, height: 8 },
  ai: {
    label: "Payout guardrail pipeline",
    description: "Shows payouts by stage: Locked (client hasn't paid), Needs approval, With PayPal, Paid out. Totals per currency.",
    usage: "Add when the user asks about payout status or the approval guardrail. It needs no data mapping.",
  },
};

export const paysasaWidgets = (defaults: AgWidgetsConfig<AgDefaultRegistry>): AgWidgetsConfig<PaySasaRegistry> =>
  createWidgets<PaySasaRegistry>({
    additionalTypes: [approvals, pipeline] as never,
    menu: [...(defaults.menu as never[]), { label: "PaySasa", widgetIds: ["paysasa-approvals", "paysasa-pipeline"] }],
  });
