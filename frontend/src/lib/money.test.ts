import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyWithCode, formatTotals, isPayPalBillable, minorToDecimalString, totalsByCurrency } from "./money";

describe("formatMoney", () => {
  it("formats each record in its own currency", () => {
    expect(formatMoney(120000, "USD", "en-US")).toBe("$1,200.00");
    expect(formatMoney(24000, "GBP", "en-GB")).toBe("£240.00");
    expect(formatMoney(5050, "EUR", "en-IE")).toBe("€50.50");
  });

  it("supports African currencies by ISO code", () => {
    expect(formatMoney(150000, "KES", "en-KE")).toMatch(/1,500\.00/);
    expect(formatMoney(150000, "KES", "en-KE")).toMatch(/Ksh|KES/);
    expect(formatMoney(99999, "ZAR", "en-ZA")).toMatch(/R\s?999[,.]99/);
    expect(formatMoney(250000, "NGN", "en-NG")).toMatch(/₦\s?2,500\.00/);
  });

  it("is exact for large and awkward minor amounts (no float drift)", () => {
    expect(formatMoney(1, "USD", "en-US")).toBe("$0.01");
    expect(formatMoney(10, "USD", "en-US")).toBe("$0.10");
    expect(formatMoney(29, "USD", "en-US")).toBe("$0.29");
    expect(formatMoney(900719925474099, "USD", "en-US")).toBe("$9,007,199,254,740.99");
  });

  it("normalises codes and tolerates char(3) padding", () => {
    expect(formatMoney(100, " usd", "en-US")).toBe("$1.00");
  });

  it("adds the currency code when the symbol is ambiguous", () => {
    expect(formatMoneyWithCode(24000, "USD", "en-US")).toBe("$240.00 USD");
  });

  it("falls back gracefully for unknown codes", () => {
    expect(formatMoney(100, "ZZZ", "en-US")).toMatch(/1\.00/);
  });

  it("rejects non-integer minor amounts", () => {
    expect(() => minorToDecimalString(1.5, 2)).toThrow(RangeError);
  });
});

describe("totals", () => {
  it("never sums across currencies", () => {
    const totals = totalsByCurrency([
      { amount_minor: 120000, currency: "USD" },
      { amount_minor: 30000, currency: "GBP" },
      { amount_minor: 5000, currency: "USD" },
      { amount_minor: null, currency: "USD" },
    ]);
    expect(totals).toEqual({ USD: 125000, GBP: 30000 });
    expect(formatTotals(totals, "en-US")).toBe("£300.00 · $1,250.00");
  });

  it("is empty for no rows", () => {
    expect(formatTotals({})).toBe("");
  });
});

describe("isPayPalBillable", () => {
  it("accepts currencies PayPal can invoice in and rejects KES", () => {
    expect(isPayPalBillable("USD")).toBe(true);
    expect(isPayPalBillable(" gbp ")).toBe(true);
    expect(isPayPalBillable("KES")).toBe(false);
    expect(isPayPalBillable(undefined)).toBe(false);
  });
});
