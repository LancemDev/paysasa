import type {
  CreateContactResult,
  FindContactResult,
  ListInvoicesResult,
  ListPendingActionsResult,
  SchedulePayoutResult,
  SendInvoiceResult,
  ToolCallLog,
} from "@/types/api";

export type StepStatus = "running" | "done" | "error";

export interface AgentStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

export type ActionCardModel =
  | { kind: "invoice"; key: string; invoiceId: string; result: SendInvoiceResult }
  | { kind: "payout"; key: string; actionId: string; result: SchedulePayoutResult }
  | { kind: "contact"; key: string; result: CreateContactResult };

export function isToolError(result: unknown): result is { error: string } {
  return typeof result === "object" && result !== null && typeof (result as { error?: unknown }).error === "string";
}

function quoted(q: unknown) {
  return typeof q === "string" && q ? `“${q}”` : "the contact";
}

const FAILED_VERB: Record<string, string> = {
  find_contact: "find the contact",
  create_contact: "add the contact",
  send_invoice: "send the invoice",
  schedule_payout: "schedule the payout",
  list_invoices: "list invoices",
  list_pending_actions: "list pending actions",
};

/** One human-readable step for a tool call, as logged in agent_runs.tool_calls or activity_log.details. */
export function stepFromToolCall(call: Pick<ToolCallLog, "name" | "args" | "result">, index: number): AgentStep {
  const id = `${index}-${call.name}`;
  const { name, args, result } = call;
  if (isToolError(result)) {
    return { id, status: "error", label: `Couldn't ${FAILED_VERB[name] ?? name.replace(/_/g, " ")}`, detail: result.error };
  }
  switch (name) {
    case "find_contact": {
      const r = result as FindContactResult;
      if (r.count === 1) return { id, status: "done", label: `Found contact ${r.matches[0].name}`, detail: r.matches[0].email };
      if (r.count === 0) return { id, status: "done", label: `No contact matched ${quoted(args.query)}` };
      return { id, status: "done", label: `${r.count} contacts match ${quoted(args.query)}` };
    }
    case "create_contact": {
      const r = result as CreateContactResult;
      return { id, status: "done", label: `Added ${r.contact.name} as a ${r.contact.role}`, detail: r.contact.email };
    }
    case "send_invoice": {
      const r = result as SendInvoiceResult;
      return { id, status: "done", label: `Sent ${r.amount} invoice to ${r.contact}`, detail: `Due ${r.due_date}` };
    }
    case "schedule_payout": {
      const r = result as SchedulePayoutResult;
      return {
        id,
        status: "done",
        label: r.status === "locked" ? `Scheduled payout to ${r.payee}: ${r.amount}, locked until paid` : `Queued payout to ${r.payee}: ${r.amount}`,
        detail: "Needs your approval",
      };
    }
    case "list_invoices": {
      const r = result as ListInvoicesResult;
      return { id, status: "done", label: `Checked invoices (${r.count} found)` };
    }
    case "list_pending_actions": {
      const r = result as ListPendingActionsResult;
      return { id, status: "done", label: `Checked pending actions (${r.count} found)` };
    }
    default:
      return { id, status: "done", label: name.replace(/_/g, " ") };
  }
}

export function stepsFromToolCalls(calls: ToolCallLog[]): AgentStep[] {
  return calls.map(stepFromToolCall);
}

/** Structured cards for the things the agent actually did (successful write tools only). */
export function actionCardsFromToolCalls(calls: ToolCallLog[]): ActionCardModel[] {
  const cards: ActionCardModel[] = [];
  calls.forEach((call, i) => {
    if (isToolError(call.result)) return;
    if (call.name === "send_invoice") {
      const r = call.result as SendInvoiceResult;
      cards.push({ kind: "invoice", key: `${i}-inv`, invoiceId: r.invoice_id, result: r });
    } else if (call.name === "schedule_payout") {
      const r = call.result as SchedulePayoutResult;
      cards.push({ kind: "payout", key: `${i}-pay`, actionId: r.action_id, result: r });
    } else if (call.name === "create_contact") {
      cards.push({ kind: "contact", key: `${i}-con`, result: call.result as CreateContactResult });
    }
  });
  return cards;
}

const WRITE_TOOLS = new Set(["send_invoice", "schedule_payout", "create_contact"]);

export interface Clarification {
  question: string;
  options: string[];
  /** Hint for the input placeholder. */
  placeholder: string;
}

/**
 * The backend replies with plain text; there is no structured "needs clarification" flag.
 * Treat it as a question when it ends with "?" and the run changed nothing.
 */
export function detectClarification(reply: string, calls: ToolCallLog[]): Clarification | null {
  const text = reply.trim();
  if (!text.endsWith("?")) return null;
  if (calls.some((c) => WRITE_TOOLS.has(c.name) && !isToolError(c.result))) return null;

  const lower = text.toLowerCase();
  if (/\bemail\b/.test(lower)) return { question: text, options: [], placeholder: "Type their email address…" };
  if (/\bcurrenc/.test(lower)) return { question: text, options: ["Use KES", "Use USD", "Use EUR", "Use GBP", "Use CAD", "Use AUD", "Use CHF"], placeholder: "Or type a currency code (e.g. KES)…" };
  if (/\bamount\b|how much/.test(lower)) return { question: text, options: [], placeholder: "Type the amount, e.g. 1,200…" };
  if (/\bwhich\b/.test(lower)) return { question: text, options: [], placeholder: "Type a name or email to choose…" };
  return { question: text, options: [], placeholder: "Type your answer…" };
}

export const DEMO_PROMPT =
  "Send an invoice to Daniel Carter (daniel.carter@example.com) for $1,200 for the Q3 Video Campaign. Once paid, schedule a payout of 20% to my editor, Sarah.";

export const SUGGESTED_PROMPTS: { label: string; prompt: string }[] = [
  { label: "Invoice a client", prompt: "Invoice " },
  { label: "Who hasn't paid?", prompt: "Which invoices are overdue or still unpaid?" },
  { label: "Pay my editor", prompt: "Once my latest invoice is paid, pay my editor 20%." },
  { label: "What needs approval?", prompt: "What is waiting for my approval?" },
];
