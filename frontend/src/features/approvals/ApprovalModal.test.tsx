import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { makePayout, OWNER, renderWithData } from "@/test/utils";
import { tables } from "@/test/supabaseMock";
import { ApprovalModal } from "./ApprovalModal";

vi.mock("@/lib/supabase", async () => ({ supabase: (await import("@/test/supabaseMock")).supabaseMock }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: OWNER } }) }));

const approveAction = vi.fn();
const rejectAction = vi.fn();
vi.mock("@/lib/api", async () => {
  const errors = await import("@/lib/api/errors");
  return { ...errors, api: { approveAction: (...a: unknown[]) => approveAction(...a), rejectAction: (...a: unknown[]) => rejectAction(...a) } };
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderModal(payout = makePayout()) {
  tables.pending_actions = [payout];
  return renderWithData(<ApprovalModal actionId={payout.id} onClose={() => {}} />, { actions: [payout] });
}

describe("ApprovalModal (payout)", () => {
  beforeEach(() => {
    approveAction.mockReset();
    rejectAction.mockReset();
    for (const k of Object.keys(tables)) delete tables[k];
  });

  it("states the consequence unmistakably", () => {
    renderModal();
    expect(screen.getByText(/This will send/)).toHaveTextContent("This will send $240.00 USD to Sarah via PayPal.");
    expect(screen.getByText("sarah@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Daniel Carter: Q3 Video Campaign/)).toBeInTheDocument();
  });

  it("sends exactly one request on a double click and never claims money arrived early", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ action: unknown }>();
    approveAction.mockReturnValue(pending.promise);
    renderModal();

    const button = screen.getByRole("button", { name: /Approve and send \$240\.00/ });
    await user.dblClick(button);
    expect(approveAction).toHaveBeenCalledTimes(1);
    expect(approveAction).toHaveBeenCalledWith("act-1", undefined);
    expect(screen.getByRole("button", { name: /Sending to PayPal/ })).toBeDisabled();

    await act(async () => pending.resolve({ action: makePayout({ status: "submitted", paypal_payout_batch_id: "MOCKBATCH000002" }) }));
    expect(await screen.findByText("Submitted to PayPal")).toBeInTheDocument();
    expect(screen.getByText("MOCKBATCH000002")).toBeInTheDocument();
    expect(screen.queryByText("Paid out")).not.toBeInTheDocument();
  });

  it("explains a PayPal failure in plain language", async () => {
    const user = userEvent.setup();
    approveAction.mockResolvedValue({ action: makePayout({ status: "failed", error: "INSUFFICIENT_FUNDS: Sender has insufficient funds" }) });
    renderModal();
    await user.click(screen.getByRole("button", { name: /Approve and send/ }));
    expect(await screen.findByText("PayPal didn't send this payout")).toBeInTheDocument();
    expect(screen.getByText("Your PayPal balance is too low to cover this payout.")).toBeInTheDocument();
  });

  it("handles a conflict by showing the real current state", async () => {
    const user = userEvent.setup();
    approveAction.mockRejectedValue(new ApiError({ kind: "http", status: 409, code: "conflict", detail: "Action is submitted, not awaiting approval" }));
    renderModal();
    tables.pending_actions = [makePayout({ status: "submitted" })];
    await user.click(screen.getByRole("button", { name: /Approve and send/ }));
    expect(await screen.findByText("This was already handled. It's now submitted.")).toBeInTheDocument();
    expect(screen.getByText("Submitted to PayPal")).toBeInTheDocument();
  });

  it("offers a safe retry when the outcome is unknown and nothing changed", async () => {
    const user = userEvent.setup();
    approveAction.mockRejectedValueOnce(new ApiError({ kind: "network" }));
    approveAction.mockResolvedValueOnce({ action: makePayout({ status: "submitted" }) });
    renderModal();
    await user.click(screen.getByRole("button", { name: /Approve and send/ }));
    expect(await screen.findByText(/Nothing has been sent, so it's safe to try again/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(approveAction).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Submitted to PayPal")).toBeInTheDocument();
  });

  it("shows 'waiting for PayPal' instead of failure when the payout is still executing", async () => {
    const user = userEvent.setup();
    approveAction.mockRejectedValue(new ApiError({ kind: "network" }));
    renderModal();
    tables.pending_actions = [makePayout({ status: "executing" })];
    await user.click(screen.getByRole("button", { name: /Approve and send/ }));
    expect(await screen.findByText("Waiting for PayPal to confirm")).toBeInTheDocument();
    expect(screen.getByText(/don't approve it again/)).toBeInTheDocument();
  });

  it("requires a second confirmation above the threshold", async () => {
    const user = userEvent.setup();
    approveAction.mockResolvedValue({ action: makePayout({ amount_minor: 600000, status: "submitted" }) });
    renderModal(makePayout({ amount_minor: 600000 }));
    await user.click(screen.getByRole("button", { name: /Approve and send \$6,000\.00/ }));
    expect(approveAction).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: /Yes, send \$6,000\.00 USD/ });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /I confirm sending/ }));
    await user.click(confirm);
    expect(approveAction).toHaveBeenCalledTimes(1);
  });

  it("rejects with an optional reason", async () => {
    const user = userEvent.setup();
    rejectAction.mockResolvedValue({ action: makePayout({ status: "rejected", error: "Paid in cash" }) });
    renderModal();
    await user.click(screen.getByRole("button", { name: "Reject…" }));
    await user.type(screen.getByLabelText("Reason (optional)"), "Paid in cash");
    await user.click(screen.getByRole("button", { name: "Reject payout" }));
    expect(rejectAction).toHaveBeenCalledWith("act-1", "Paid in cash");
    expect(await screen.findByText("Payout rejected")).toBeInTheDocument();
    expect(screen.getByText("Nothing was sent.")).toBeInTheDocument();
  });
});

describe("ApprovalModal (reminder)", () => {
  it("lets the user edit the draft and sends the edited text", async () => {
    const user = userEvent.setup();
    approveAction.mockReset();
    const reminder = makePayout({
      id: "rem-1",
      type: "invoice_reminder",
      payee_contact_id: null,
      amount_minor: null,
      currency: null,
      split_percent: null,
      summary: "Remind Daniel Carter: $1,200.00 is 3 days overdue",
      draft_message: "Hi Daniel, a friendly reminder.",
    });
    approveAction.mockResolvedValue({ action: { ...reminder, status: "succeeded" } });
    tables.pending_actions = [reminder];
    renderWithData(<ApprovalModal actionId="rem-1" onClose={() => {}} />, { actions: [reminder] });
    const box = screen.getByLabelText("Reminder message");
    await user.clear(box);
    await user.type(box, "Hi Daniel, please pay when you can. Kwame");
    await user.click(screen.getByRole("button", { name: "Send reminder" }));
    expect(approveAction).toHaveBeenCalledWith("rem-1", "Hi Daniel, please pay when you can. Kwame");
    expect(await screen.findByText("Reminder sent")).toBeInTheDocument();
  });
});
