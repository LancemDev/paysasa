import { describe, expect, it } from "vitest";
import { makeInvoice } from "@/test/utils";
import { daysOverdue, dueLabel } from "./dates";
import { actionStage, actionStatusDisplay, invoiceDisplayStatus, invoiceStatusDisplay, isMoneySent } from "./status";

const today = new Date(2026, 9, 22, 10, 0); // 22 Oct 2026, local time

describe("invoice status mapping", () => {
  it("maps sent to Awaiting payment until the due date passes", () => {
    expect(invoiceDisplayStatus(makeInvoice({ due_date: "2026-10-22" }), today)).toBe("awaiting");
    expect(invoiceStatusDisplay("awaiting").label).toBe("Awaiting payment");
  });

  it("derives Overdue exactly like the backend (due_date < today)", () => {
    const inv = makeInvoice({ due_date: "2026-10-19" });
    expect(invoiceDisplayStatus(inv, today)).toBe("overdue");
    expect(daysOverdue(inv.due_date, today)).toBe(3);
    expect(dueLabel(inv.due_date, today)).toBe("3 days overdue");
  });

  it("never marks paid or cancelled invoices overdue", () => {
    expect(invoiceDisplayStatus(makeInvoice({ status: "paid", due_date: "2020-01-01" }), today)).toBe("paid");
    expect(invoiceDisplayStatus(makeInvoice({ status: "cancelled", due_date: "2020-01-01" }), today)).toBe("cancelled");
  });

  it("every status has an icon and a text label, not just a colour", () => {
    for (const s of ["overdue", "awaiting", "paid", "draft", "failed", "cancelled"] as const) {
      const d = invoiceStatusDisplay(s);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.icon).toBeTruthy();
    }
  });
});

describe("action status mapping", () => {
  it("labels the payout lifecycle honestly", () => {
    expect(actionStatusDisplay("locked").label).toBe("Locked");
    expect(actionStatusDisplay("awaiting_approval").label).toBe("Needs approval");
    expect(actionStatusDisplay("submitted").label).toBe("Submitted to PayPal");
    expect(actionStatusDisplay("succeeded").label).toBe("Paid out");
    expect(actionStatusDisplay("succeeded", "invoice_reminder").label).toBe("Reminder sent");
  });

  it("only treats a payout as sent when PayPal confirmed success", () => {
    expect(isMoneySent({ type: "payout", status: "submitted" })).toBe(false);
    expect(isMoneySent({ type: "payout", status: "executing" })).toBe(false);
    expect(isMoneySent({ type: "payout", status: "succeeded" })).toBe(true);
  });

  it("groups actions into stages", () => {
    expect(actionStage("awaiting_approval")).toBe("needs_approval");
    expect(actionStage("executing")).toBe("processing");
    expect(actionStage("submitted")).toBe("processing");
    expect(actionStage("rejected")).toBe("closed");
  });
});
