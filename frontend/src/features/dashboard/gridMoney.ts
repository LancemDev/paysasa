import type { IAggFuncParams, ValueFormatterParams } from "ag-grid-community";
import { formatMoney, formatTotals, minorDigits, mergeTotals, type CurrencyTotals } from "@/lib/money";

/** Leaf cell value for money columns: amount and currency travel together. */
export interface MoneyValue {
  kind: "money";
  minor: number;
  currency: string;
}
/** Group cell value: one total per currency. Never summed across currencies. */
export interface TotalsValue {
  kind: "totals";
  totals: CurrencyTotals;
  toString(): string;
}

export function moneyValue(minor: number | null, currency: string | null): MoneyValue | null {
  return minor == null || !currency ? null : { kind: "money", minor, currency };
}

/** AG Grid aggFunc: per-currency totals, merging leaf values and child-group totals. */
export function sumByCurrency(params: IAggFuncParams): TotalsValue {
  const parts: CurrencyTotals[] = [];
  for (const v of params.values as (MoneyValue | TotalsValue | null)[]) {
    if (!v) continue;
    parts.push(v.kind === "money" ? { [v.currency]: v.minor } : v.totals);
  }
  const totals = mergeTotals(...parts);
  return { kind: "totals", totals, toString: () => formatTotals(totals) };
}

export function formatMoneyCell(p: ValueFormatterParams): string {
  const v = p.value as MoneyValue | TotalsValue | null;
  if (!v) return "";
  return v.kind === "money" ? formatMoney(v.minor, v.currency) : formatTotals(v.totals);
}

/** Sort by currency first, then amount, so different currencies are never compared numerically. */
export function compareMoney(a: MoneyValue | TotalsValue | null, b: MoneyValue | TotalsValue | null): number {
  if (!a || a.kind !== "money") return -1;
  if (!b || b.kind !== "money") return 1;
  return a.currency === b.currency ? a.minor - b.minor : a.currency.localeCompare(b.currency);
}

/** Number filter works on the major-unit value (1200 for $1,200.00). */
export function moneyFilterValue(minor: number | null, currency: string | null): number | null {
  if (minor == null || !currency) return null;
  return minor / 10 ** minorDigits(currency);
}
