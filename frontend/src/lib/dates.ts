/** Dates are shown in the user's own timezone. Date-only values ('YYYY-MM-DD') are calendar dates, not instants. */

const DAY_MS = 86_400_000;

export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from a to b (b - a), immune to DST shifts. */
export function calendarDaysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

/** Days past due (>0) for a 'YYYY-MM-DD' due date, else 0. Matches backend: overdue when due_date < today. */
export function daysOverdue(dueDate: string | null | undefined, now: Date = new Date()): number {
  if (!dueDate) return 0;
  const days = calendarDaysBetween(parseDateOnly(dueDate), startOfDay(now));
  return days > 0 ? days : 0;
}

export function formatDate(value: string | null | undefined, locale?: string): string {
  if (!value) return "";
  const d = value.length === 10 ? parseDateOnly(value) : new Date(value);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function formatDateTime(value: string | null | undefined, locale?: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * DAY_MS],
  ["month", 30 * DAY_MS],
  ["week", 7 * DAY_MS],
  ["day", DAY_MS],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 minutes ago", "in 2 days", "just now". */
export function relativeTime(value: string | null | undefined, now: Date = new Date(), locale?: string): string {
  if (!value) return "";
  const diff = new Date(value).getTime() - now.getTime();
  if (Math.abs(diff) < 45_000) return "just now";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === "minute") return rtf.format(Math.round(diff / ms), unit);
  }
  return "";
}

/** Relative wording for a due date: "due today", "due in 5 days", "3 days overdue". */
export function dueLabel(dueDate: string | null | undefined, now: Date = new Date()): string {
  if (!dueDate) return "";
  const days = calendarDaysBetween(startOfDay(now), parseDateOnly(dueDate));
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days > 1) return `due in ${days} days`;
  const late = -days;
  return `${late} day${late === 1 ? "" : "s"} overdue`;
}
