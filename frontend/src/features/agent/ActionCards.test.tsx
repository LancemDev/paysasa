import { screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ActionCardModel } from "@/lib/agent";
import { makeInvoice, makePayout, OWNER, renderWithData } from "@/test/utils";
import { ActionCards } from "./ActionCards";

vi.mock("@/lib/supabase", async () => ({ supabase: (await import("@/test/supabaseMock")).supabaseMock }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: OWNER } }) }));

const cards: ActionCardModel[] = [
  { kind: "invoice", key: "0", invoiceId: "inv-1", result: { invoice_id: "inv-1", status: "sent", contact: "Daniel Carter", amount: "$1,200.00", currency: "USD", due_date: "2026-11-05" } },
  { kind: "payout", key: "1", actionId: "act-1", result: { action_id: "act-1", status: "locked", summary: "Payout Sarah $240.00 upon settlement", amount: "$240.00", payee: "Sarah", needs_approval: true } },
];

describe("ActionCards", () => {
  // The fixture invoice is due 2026-11-05. Pin "today" before that, or it reads as Overdue once the date passes.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T09:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  it("renders the invoice preview and a locked payout", () => {
    renderWithData(<ActionCards cards={cards} />, { invoices: [makeInvoice()], actions: [makePayout({ status: "locked", summary: "Payout Sarah $240.00 upon settlement" })] });
    expect(screen.getByRole("heading", { name: "Invoice sent via PayPal" })).toBeInTheDocument();
    expect(screen.getByText("$1,200.00 USD")).toBeInTheDocument();
    expect(screen.getByText("1 × Q3 Video Campaign")).toBeInTheDocument();
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
    expect(screen.getByText(/Unlocks when Daniel Carter's invoice \(\$1,200\.00\) is paid/)).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review and approve" })).not.toBeInTheDocument();
    expect(screen.getByText("Nothing is sent until you approve it.")).toBeInTheDocument();
  });

  it("reflects live status: invoice paid and payout ready for approval", () => {
    renderWithData(<ActionCards cards={cards} />, {
      invoices: [makeInvoice({ status: "paid", paid_at: "2026-10-22T10:00:00Z" })],
      actions: [makePayout({ status: "awaiting_approval" })],
    });
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payout ready for your approval" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review and approve" })).toBeInTheDocument();
  });

  it("falls back to the agent's own result before the row arrives", () => {
    renderWithData(<ActionCards cards={cards} />, { invoices: [], actions: [] });
    expect(screen.getByText("Daniel Carter")).toBeInTheDocument();
    expect(screen.getByText("$1,200.00 USD")).toBeInTheDocument();
    expect(screen.getByText("Sarah")).toBeInTheDocument();
  });

  it("shows a drafted reminder with a Review and send button while it awaits approval", () => {
    const reminder: ActionCardModel[] = [
      {
        kind: "reminder",
        key: "0",
        actionId: "rem-1",
        result: {
          action_id: "rem-1",
          status: "awaiting_approval",
          summary: "Remind Zara Mensah: $4,200.00 is 8 days overdue",
          draft_message: "Hi Zara, a quick reminder about the App Launch Teaser.",
          contact: "Zara Mensah",
          description: "App Launch Teaser",
          amount: "$4,200.00",
          needs_approval: true,
          already_queued: false,
        },
      },
    ];
    const live = makePayout({ id: "rem-1", type: "invoice_reminder", status: "awaiting_approval", payee_contact_id: null, amount_minor: null, currency: null, split_percent: null, draft_message: "Hi Zara, a quick reminder about the App Launch Teaser." });
    renderWithData(<ActionCards cards={reminder} />, { invoices: [makeInvoice()], actions: [live] });
    expect(screen.getByRole("heading", { name: "Reminder ready for your approval" })).toBeInTheDocument();
    expect(screen.getByText("Zara Mensah")).toBeInTheDocument();
    expect(screen.getByText("Hi Zara, a quick reminder about the App Launch Teaser.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review and send" })).toBeInTheDocument();
  });

  it("hides the send button once the reminder has been handled", () => {
    const reminder: ActionCardModel[] = [
      { kind: "reminder", key: "0", actionId: "rem-1", result: { action_id: "rem-1", status: "awaiting_approval", summary: "s", draft_message: "Hi Zara", contact: "Zara Mensah", description: "App Launch Teaser", amount: "$4,200.00", needs_approval: true, already_queued: false } },
    ];
    renderWithData(<ActionCards cards={reminder} />, { invoices: [makeInvoice()], actions: [makePayout({ id: "rem-1", type: "invoice_reminder", status: "submitted" })] });
    expect(screen.queryByRole("button", { name: "Review and send" })).not.toBeInTheDocument();
  });
});
