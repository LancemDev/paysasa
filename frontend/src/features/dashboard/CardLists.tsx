import { ChevronRight, Lock } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, relativeTime } from "@/lib/dates";
import { formatMoney, formatTotals, totalsByCurrency } from "@/lib/money";
import { ACTION_STAGES, INVOICE_GROUP_ORDER } from "@/lib/status";
import type { ActionRow, ActivityRow, InvoiceRow } from "./rows";

/** Mobile layout for the grids: grouped card lists with per-currency totals. */
function groupBy<T>(rows: T[], key: (r: T) => string, order: string[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return [...map.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
}

function GroupHeader({ title, count, totals }: { title: string; count: number; totals?: string }) {
  return (
    <h3 className="flex items-baseline justify-between gap-2 px-1 pt-4 pb-2 text-[13px]">
      <span className="font-semibold">
        {title} <span className="font-normal text-muted">({count})</span>
      </span>
      {totals && <span className="tabular text-muted">{totals}</span>}
    </h3>
  );
}

export function InvoiceCardList({ rows, onOpen }: { rows: InvoiceRow[]; onOpen: (id: string) => void }) {
  return (
    <div className="px-3 pb-4">
      {groupBy(rows, (r) => r.statusLabel, INVOICE_GROUP_ORDER).map(([label, items]) => (
        <section key={label} aria-label={label}>
          <GroupHeader title={label} count={items.length} totals={formatTotals(totalsByCurrency(items))} />
          <ul className="flex flex-col gap-2">
            {items.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 text-left shadow-1"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{r.clientName}</span>
                      <span className="tabular font-semibold">{formatMoney(r.amount_minor, r.currency)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted">{r.description}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                      <StatusBadge size="sm" status={r.statusDisplay} />
                      {r.daysOverdue > 0 ? (
                        <span className="font-medium text-danger">{r.daysOverdue} day{r.daysOverdue === 1 ? "" : "s"} overdue</span>
                      ) : (
                        r.dueDate && <span className="text-muted">Due {formatDate(r.dueDate)}</span>
                      )}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ActionCardList({ rows, onReview, onOpenInvoice }: { rows: ActionRow[]; onReview: (id: string) => void; onOpenInvoice: (id: string) => void }) {
  const order = Object.values(ACTION_STAGES).sort((a, b) => a.order - b.order).map((s) => s.label);
  return (
    <div className="px-3 pb-4">
      {groupBy(rows, (r) => r.stageLabel, order).map(([label, items]) => (
        <section key={label} aria-label={label}>
          <GroupHeader title={label} count={items.length} />
          <ul className="flex flex-col gap-2">
            {items.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{r.summary}</p>
                    <p className="text-[13px] text-muted">
                      {r.typeLabel} · {relativeTime(r.created_at)}
                    </p>
                  </div>
                  {r.amount_minor != null && r.action.type === "payout" && (
                    <span className="tabular font-semibold">{formatMoney(r.amount_minor, r.currency)}</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge size="sm" status={r.statusDisplay} />
                  {r.triggerInvoiceId && (
                    <button type="button" onClick={() => onOpenInvoice(r.triggerInvoiceId!)} className="inline-flex items-center gap-1 text-[13px] text-accent underline-offset-2 hover:underline">
                      {r.action.status === "locked" && <Lock aria-hidden className="size-3.5" />}
                      {r.triggerLabel}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onReview(r.id)}
                  className={
                    r.action.status === "awaiting_approval"
                      ? "mt-3 h-10 w-full rounded-[var(--radius-input)] bg-accent font-medium text-accent-fg"
                      : "mt-2 text-[13px] text-muted underline underline-offset-2"
                  }
                >
                  {r.action.status === "awaiting_approval" ? (r.action.type === "payout" ? "Review and approve" : "Review reminder") : "Details"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ActivityList({ rows, onOpenEntity }: { rows: ActivityRow[]; onOpenEntity: (row: ActivityRow) => void }) {
  return (
    <ol className="divide-y divide-border px-3 pb-4">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onOpenEntity(r)} className="w-full py-3 text-left">
            <p>{r.message}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {r.actorLabel} · <time dateTime={r.created_at}>{relativeTime(r.created_at)}</time>
            </p>
          </button>
        </li>
      ))}
    </ol>
  );
}
