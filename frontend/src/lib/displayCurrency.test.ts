import { describe, expect, it } from "vitest";
import { withDisplayMoney } from "./displayCurrency";

const usd = { id: "inv-1", amount_minor: 120000, currency: "USD" };

describe("withDisplayMoney", () => {
  it("restates the amount and keeps the original for disclosure", () => {
    expect(withDisplayMoney(usd, "KES")).toMatchObject({
      amount_minor: 15516000,
      currency: "KES",
      source_amount_minor: 120000,
      source_currency: "USD",
    });
  });

  it("leaves rows alone in the same currency or without a display currency", () => {
    expect(withDisplayMoney(usd, "USD")).toBe(usd);
    expect(withDisplayMoney(usd, null)).toBe(usd);
    expect(withDisplayMoney(usd, undefined)).toBe(usd);
  });

  it("switches from the original amount, not from a previous conversion", () => {
    const kes = withDisplayMoney(usd, "KES");
    expect(withDisplayMoney(kes, "EUR")).toMatchObject({
      amount_minor: 109200, // $1,200.00 × 0.91 = €1,092.00
      currency: "EUR",
      source_amount_minor: 120000,
      source_currency: "USD",
    });
    expect(withDisplayMoney(kes, "USD")).toEqual(usd);
  });

  it("does not invent a rate", () => {
    const odd = { id: "inv-2", amount_minor: 100, currency: "ZZZ" };
    expect(withDisplayMoney(odd, "KES")).toBe(odd);
  });

  it("ignores rows without an amount, like reminders", () => {
    const reminder = { id: "act-1", amount_minor: null, currency: null };
    expect(withDisplayMoney(reminder, "KES")).toBe(reminder);
  });
});
