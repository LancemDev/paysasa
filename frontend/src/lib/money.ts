/**
 * Money is integer minor units plus an ISO 4217 code (backend contract). We never do float maths on money:
 * the decimal string is built with integer arithmetic and handed to Intl.NumberFormat as a string.
 */
export const DEFAULT_CURRENCY = "KES" as const;
export const SELECTABLE_CURRENCIES = ["KES", "USD", "EUR", "GBP", "CAD", "AUD", "CHF"] as const;
export type SelectableCurrency = (typeof SELECTABLE_CURRENCIES)[number];
/**
 * Currencies PayPal can invoice and pay out in (PayPal REST currency codes). KES is not one of them, so it
 * can be used for display but not as the default for new invoices.
 */
export const PAYPAL_BILLABLE_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF"] as const;
export const PAYPAL_FALLBACK_CURRENCY = "USD" as const;
export function isPayPalBillable(code: string | null | undefined): boolean {
  return (PAYPAL_BILLABLE_CURRENCIES as readonly string[]).includes((code ?? "").trim().toUpperCase());
}
export const SUPPORTED_DISPLAY_CURRENCIES = ["KES", "USD", "EUR", "GBP", "CAD", "AUD", "CHF", "ZAR", "NGN"] as const;

export const CURRENCY_LABELS: Record<string, string> = {
  KES: "KES — Kenyan Shilling (KSh)",
  USD: "USD — US Dollar ($)",
  EUR: "EUR — Euro (€)",
  GBP: "GBP — British Pound (£)",
  CAD: "CAD — Canadian Dollar (CA$)",
  AUD: "AUD — Australian Dollar (A$)",
  CHF: "CHF — Swiss Franc (CHF)",
};

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, locale?: string, compact = false): Intl.NumberFormat {
  const key = `${locale ?? ""}|${currency}|${compact}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: compact ? "narrowSymbol" : "symbol",
    });
    formatters.set(key, f);
  }
  return f;
}

/** Number of minor-unit digits for a currency (2 for the supported 2-decimal currencies, 0 for JPY...). */
export function minorDigits(currency: string): number {
  try {
    return formatter(normalizeCurrency(currency)).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "").trim().toUpperCase();
}

/** 120000 -> "1200.00" for a 2-digit currency. Exact for any safe integer. */
export function minorToDecimalString(amountMinor: number, digits: number): string {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError(`amount_minor must be a safe integer, got ${amountMinor}`);
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  if (digits === 0) return `${sign}${abs}`;
  const base = 10 ** digits;
  const whole = Math.floor(abs / base);
  const frac = String(abs % base).padStart(digits, "0");
  return `${sign}${whole}.${frac}`;
}

/** formatMoney(120000, "USD") -> "$1,200.00". Falls back to "1,200.00 XYZ" for unknown codes. */
export function formatMoney(amountMinor: number, currency: string | null | undefined, locale?: string): string {
  const code = normalizeCurrency(currency);
  const digits = minorDigits(code);
  const decimal = minorToDecimalString(amountMinor, digits);
  try {
    // Intl accepts decimal strings exactly (ES2023); the cast keeps older lib typings happy.
    return formatter(code, locale).format(decimal as unknown as number);
  } catch {
    const plain = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return `${plain.format(decimal as unknown as number)} ${code || "???"}`.trim();
  }
}

/** "$1,200.00 USD": the symbol alone is ambiguous for $, so consequential screens add the code. */
export function formatMoneyWithCode(amountMinor: number, currency: string | null | undefined, locale?: string): string {
  const code = normalizeCurrency(currency);
  const text = formatMoney(amountMinor, code, locale);
  return text.includes(code) ? text : `${text} ${code}`;
}

export type CurrencyTotals = Record<string, number>;

/** Sum per currency. Never adds amounts in different currencies together. */
export function totalsByCurrency(items: Iterable<{ amount_minor: number | null; currency: string | null }>): CurrencyTotals {
  const out: CurrencyTotals = {};
  for (const { amount_minor, currency } of items) {
    if (amount_minor == null || !currency) continue;
    const code = normalizeCurrency(currency);
    out[code] = (out[code] ?? 0) + amount_minor;
  }
  return out;
}

export function mergeTotals(...parts: CurrencyTotals[]): CurrencyTotals {
  const out: CurrencyTotals = {};
  for (const part of parts) for (const [code, v] of Object.entries(part)) out[code] = (out[code] ?? 0) + v;
  return out;
}

/** {USD: 120000, GBP: 5000} -> "$1,200.00 · £50.00" (sorted by code for stable output). */
export function formatTotals(totals: CurrencyTotals, locale?: string): string {
  const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "";
  return entries.map(([code, v]) => formatMoney(v, code, locale)).join(" · ");
}
