import { describe, expect, it } from "vitest";
import type { ToolCallLog } from "@/types/api";
import { actionCardsFromToolCalls, detectClarification, stepsFromToolCalls } from "./agent";

// Shape recorded in agent_runs.tool_calls by backend/server/app/agent/run.py for the Kwame demo.
const kwame: ToolCallLog[] = [
  { name: "find_contact", args: { query: "Daniel Carter" }, result: { matches: [{ contact_id: "c1", name: "Daniel Carter", email: "daniel.carter@example.com", role: "client", aliases: [] }], count: 1 } },
  {
    name: "send_invoice",
    args: { contact_id: "c1", description: "Q3 Video Campaign", amount: "1200.00", currency: "USD" },
    result: { invoice_id: "inv-1", status: "sent", contact: "Daniel Carter", amount: "$1,200.00", currency: "USD", due_date: "2026-11-05" },
  },
  { name: "find_contact", args: { query: "my editor" }, result: { matches: [{ contact_id: "c2", name: "Sarah", email: "s@x.com", role: "contractor", aliases: ["my editor"] }], count: 1 } },
  {
    name: "schedule_payout",
    args: { trigger_invoice_id: "inv-1", payee_contact_id: "c2", split_percent: 20 },
    result: { action_id: "act-1", status: "locked", summary: "Payout Sarah $240.00 upon settlement", amount: "$240.00", payee: "Sarah", needs_approval: true },
  },
];

describe("step trace", () => {
  it("turns tool calls into readable steps", () => {
    expect(stepsFromToolCalls(kwame).map((s) => s.label)).toEqual([
      "Found contact Daniel Carter",
      "Sent $1,200.00 invoice to Daniel Carter",
      "Found contact Sarah",
      "Scheduled payout to Sarah: $240.00, locked until paid",
    ]);
  });

  it("marks tool errors as failed steps with the reason", () => {
    const [step] = stepsFromToolCalls([{ name: "send_invoice", args: {}, result: { error: "Currency 'KES' is not supported." } }]);
    expect(step.status).toBe("error");
    expect(step.label).toBe("Couldn't send the invoice");
    expect(step.detail).toContain("KES");
  });
});

describe("action cards", () => {
  it("creates an invoice card and a payout card for the demo", () => {
    const cards = actionCardsFromToolCalls(kwame);
    expect(cards.map((c) => c.kind)).toEqual(["invoice", "payout"]);
  });

  it("skips failed tool calls", () => {
    expect(actionCardsFromToolCalls([{ name: "send_invoice", args: {}, result: { error: "nope" } }])).toEqual([]);
  });
});

describe("clarification detection", () => {
  it("treats a question with no actions as a follow-up question", () => {
    const c = detectClarification("What is Mary's email address?", [{ name: "find_contact", args: { query: "Mary" }, result: { matches: [], count: 0 } }]);
    expect(c?.placeholder).toMatch(/email/i);
  });

  it("offers currency quick replies", () => {
    expect(detectClarification("Which currency should I use?", [])?.options).toEqual(["Use USD", "Use GBP", "Use EUR"]);
  });

  it("ignores questions after the agent already acted", () => {
    expect(detectClarification("Anything else?", kwame)).toBeNull();
  });

  it("ignores statements", () => {
    expect(detectClarification("Sent the invoice.", [])).toBeNull();
  });
});
