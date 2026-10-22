import { describe, expect, it } from "vitest";
import { john, makeInvoice, makePayout, sarah } from "@/test/utils";
import { sampleHistory } from "./sampleHistory";
import { buildRows, buildStudioData } from "./studioData";

const now = new Date("2026-10-22T09:00:00Z");

describe("AG Studio data model", () => {
  const rows = buildRows({
    invoices: [
      makeInvoice({ id: "usd-open", due_date: "2026-10-01" }),
      makeInvoice({ id: "gbp-paid", currency: "GBP", amount_minor: 50000, status: "paid", paid_at: "2026-10-10T00:00:00Z", sent_at: "2026-10-05T00:00:00Z" }),
      makeInvoice({ id: "eur-cancelled", currency: "EUR", status: "cancelled" }),
    ],
    actions: [makePayout({ status: "succeeded" })],
    contacts: [john, sarah],
    activity: [],
    now,
  });

  it("splits money into one field per currency, never mixing them", () => {
    const usd = rows.invoices.find((r) => r.id === "usd-open")!;
    expect(usd.outstandingUSD).toBe(1200);
    expect(usd.outstandingGBP).toBeNull();
    expect(usd.overdueUSD).toBe(1200);
    const gbp = rows.invoices.find((r) => r.id === "gbp-paid")!;
    expect(gbp.collectedGBP).toBe(500);
    expect(gbp.collectedUSD).toBeNull();
    expect(gbp.daysToPay).toBe(5);
  });

  it("excludes cancelled invoices from invoiced totals", () => {
    expect(rows.invoices.find((r) => r.id === "eur-cancelled")!.invoicedEUR).toBeNull();
  });

  it("puts only open invoices in receivables, with an aging bucket", () => {
    expect(rows.receivables.map((r) => r.id)).toEqual(["usd-open"]);
    expect(rows.receivables[0].agingBucket).toBe("1-30 days late");
  });

  it("only counts PayPal-confirmed payouts as paid out", () => {
    expect(rows.payouts[0].paidOutUSD).toBe(240);
    const pending = buildRows({ invoices: [], actions: [makePayout({ status: "submitted" })], contacts: [sarah], activity: [], now });
    expect(pending.payouts[0].paidOutUSD).toBeNull();
    expect(pending.payouts[0].stage).toBe("With PayPal");
  });

  it("describes every source and keeps the calendar ending today", () => {
    const def = buildStudioData(rows, now);
    expect(def.sources.map((s) => s.id)).toEqual(["clients", "invoices", "receivables", "payouts", "activity"]);
    expect(JSON.stringify(def.calendars)).toContain("2026-10-23");
  });

  it("sample history is deterministic and clearly marked", () => {
    const a = sampleHistory(now);
    const b = sampleHistory(now);
    expect(a.invoices).toEqual(b.invoices);
    expect(a.invoices.every((i) => i.id.startsWith("sample-") && i.paypal_invoice_id!.includes("SAMPLE"))).toBe(true);
  });
});
