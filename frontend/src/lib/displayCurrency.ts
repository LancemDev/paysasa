import type { CurrencyCode } from "@/types/api";
import { convertMinor, normalizeCurrency } from "./money";

type MoneyRow = {
  amount_minor: number | null;
  currency: CurrencyCode | null;
  /** Present when this row has already been restated from another currency. */
  source_amount_minor?: number | null;
  source_currency?: CurrencyCode | null;
};

/**
 * Restate a row's money fields in the profile's display currency using indicative rates.
 *
 * The stored amount is never changed: the original travels on `source_*`, so consequential screens
 * can still say what PayPal will actually send. A row is left alone when it already uses the target
 * currency or when no rate is known.
 */
export function withDisplayMoney<T extends MoneyRow>(row: T, display: string | null | undefined): T {
  const target = normalizeCurrency(display);
  const originalMinor = row.source_amount_minor ?? row.amount_minor;
  const originalCurrency = row.source_currency ?? row.currency;
  const source = normalizeCurrency(originalCurrency);

  if (!target || !source || originalMinor == null) return withoutSource(row);
  if (target === source) return withoutSource(row);
  const converted = convertMinor(originalMinor, source, target);
  if (converted == null) return withoutSource(row);

  return {
    ...row,
    amount_minor: converted,
    currency: target,
    source_amount_minor: originalMinor,
    source_currency: originalCurrency,
  };
}

function withoutSource<T extends MoneyRow>(row: T): T {
  if (row.source_currency == null && row.source_amount_minor == null) return row;
  const { source_amount_minor, source_currency, ...rest } = row;
  return { ...rest, amount_minor: source_amount_minor ?? row.amount_minor, currency: source_currency ?? row.currency } as T;
}
