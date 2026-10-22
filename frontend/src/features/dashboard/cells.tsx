import type { CustomCellRendererProps } from "ag-grid-react";
import { Lock } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatDateTime, relativeTime } from "@/lib/dates";
import { ACTION_STAGES, invoiceStatusDisplay, type InvoiceDisplayStatus, type StatusDisplay } from "@/lib/status";
import type { ActionRow, ActivityRow, InvoiceRow } from "./rows";

const INVOICE_BY_LABEL = new Map(
  (["overdue", "awaiting", "paid", "draft", "failed", "cancelled"] as InvoiceDisplayStatus[]).map((s) => [invoiceStatusDisplay(s).label, invoiceStatusDisplay(s)]),
);
const STAGE_TONE: Record<string, StatusDisplay> = {
  [ACTION_STAGES.needs_approval.label]: { key: "n", label: ACTION_STAGES.needs_approval.label, tone: "warning", icon: "hourglass", order: 0 },
  [ACTION_STAGES.locked.label]: { key: "l", label: ACTION_STAGES.locked.label, tone: "locked", icon: "lock", order: 1 },
  [ACTION_STAGES.processing.label]: { key: "p", label: ACTION_STAGES.processing.label, tone: "info", icon: "send", order: 2 },
  [ACTION_STAGES.completed.label]: { key: "c", label: ACTION_STAGES.completed.label, tone: "success", icon: "check", order: 3 },
  [ACTION_STAGES.closed.label]: { key: "x", label: ACTION_STAGES.closed.label, tone: "muted", icon: "ban", order: 4 },
};

/** Group row label: status badge + row count. */
export function GroupInner(p: CustomCellRendererProps) {
  if (p.node.footer && p.node.level === -1) return <span className="font-semibold">Total (per currency)</span>;
  if (!p.node.group) return null;
  const key = String(p.node.key ?? p.value ?? "");
  const display = INVOICE_BY_LABEL.get(key) ?? STAGE_TONE[key];
  return (
    <span className="inline-flex items-center gap-2">
      {display ? <StatusBadge size="sm" status={display} /> : <span className="font-semibold">{key}</span>}
      <span className="text-muted">({p.node.allChildrenCount ?? 0})</span>
    </span>
  );
}

export function InvoiceStatusCell(p: CustomCellRendererProps<InvoiceRow>) {
  if (!p.data) return null;
  return <StatusBadge size="sm" status={p.data.statusDisplay} />;
}

export function ClientCell(p: CustomCellRendererProps<InvoiceRow>) {
  if (!p.data) return null;
  return (
    <span className="flex min-w-0 flex-col justify-center leading-tight">
      <span className="truncate font-medium">{p.data.clientName}</span>
      <span className="truncate text-xs text-muted">{p.data.clientEmail}</span>
    </span>
  );
}

export function DueCell(p: CustomCellRendererProps<InvoiceRow>) {
  if (!p.data?.dueDate) return null;
  return (
    <span className="flex flex-col justify-center leading-tight">
      <span>{formatDate(p.data.dueDate)}</span>
      {p.data.daysOverdue > 0 && (
        <span className="text-xs font-medium text-danger">
          {p.data.daysOverdue} day{p.data.daysOverdue === 1 ? "" : "s"} overdue
        </span>
      )}
    </span>
  );
}

export function ActionStatusCell(p: CustomCellRendererProps<ActionRow>) {
  if (!p.data) return null;
  return <StatusBadge size="sm" status={p.data.statusDisplay} />;
}

export function TriggerCell(p: CustomCellRendererProps<ActionRow> & { onOpenInvoice: (id: string) => void }) {
  const d = p.data;
  if (!d?.triggerInvoiceId) return <span className="text-muted">-</span>;
  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center gap-1 truncate text-left text-accent underline-offset-2 hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        p.onOpenInvoice(d.triggerInvoiceId!);
      }}
    >
      {d.action.status === "locked" && <Lock aria-hidden className="size-3.5 shrink-0" />}
      <span className="truncate">{d.triggerLabel}</span>
    </button>
  );
}

export function ReviewCell(p: CustomCellRendererProps<ActionRow> & { onReview: (id: string) => void }) {
  const d = p.data;
  if (!d) return null;
  if (d.action.status !== "awaiting_approval")
    return (
      <button
        type="button"
        className="text-[13px] text-muted underline-offset-2 hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          p.onReview(d.id);
        }}
      >
        Details
      </button>
    );
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        p.onReview(d.id);
      }}
      className="h-8 rounded-[var(--radius-input)] bg-accent px-3 text-[13px] font-medium text-accent-fg hover:bg-accent-hover"
    >
      {d.action.type === "payout" ? "Review" : "Review draft"}
    </button>
  );
}

export function TimeCell(p: CustomCellRendererProps<ActivityRow | InvoiceRow | ActionRow>) {
  const v = p.value as string | undefined;
  if (!v) return null;
  return (
    <time dateTime={v} title={formatDateTime(v)}>
      {relativeTime(v)}
    </time>
  );
}
