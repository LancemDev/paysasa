import { CheckCircle2, FileText, Lock, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorPanel } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { actionSummary } from "@/lib/actionSummary";
import { formatDateTime, relativeTime } from "@/lib/dates";
import { formatMoneyWithCode } from "@/lib/money";
import { useActions, useContactsById, useInvoicesById, usePendingApprovals } from "@/lib/queries";
import { actionStatusDisplay } from "@/lib/status";
import { useWorkspace } from "@/lib/workspace";
import { useT } from "@/lib/i18n";

export function ApprovalsPage() {
  const t = useT();
  const actions = useActions();
  const pending = usePendingApprovals();
  const contacts = useContactsById();
  const invoices = useInvoicesById();
  const { openApproval, openInvoice } = useWorkspace();
  const locked = (actions.data ?? []).filter((a) => a.status === "locked");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-8 sm:px-6">
      <div>
        <h1 className="display flex items-center gap-2.5 text-[36px]">
          <ShieldCheck aria-hidden className="size-7 text-[var(--chart-money)]" /> {t("approvals.title")}
        </h1>
        <p className="mt-1 text-[15px] text-muted">{t("approvals.sub")}</p>
      </div>

      <section aria-labelledby="needs-h" className="card overflow-hidden">
        <h2 id="needs-h" className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
          Needs your approval
          <span className="rounded-full bg-warning px-2 text-xs text-white tabular dark:text-bg">{pending.length}</span>
        </h2>
        {actions.isLoading ? (
          <SkeletonRows rows={3} label="Loading approvals" />
        ) : actions.isError ? (
          <ErrorPanel message={(actions.error as Error).message} onRetry={() => actions.refetch()} />
        ) : pending.length === 0 ? (
          <EmptyState icon={<CheckCircle2 aria-hidden className="size-6" />} title="Nothing needs your approval">
            When a client pays an invoice with a scheduled payout, or PaySasa drafts a reminder for an overdue invoice, it'll appear here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((a) => {
              const inv = a.trigger_invoice_id ? invoices.get(a.trigger_invoice_id) : undefined;
              const client = inv ? contacts.get(inv.contact_id) : undefined;
              const payee = a.payee_contact_id ? contacts.get(a.payee_contact_id) : undefined;
              const payout = a.type === "payout";
              return (
                <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
                    {payout ? <Wallet className="size-5" /> : <FileText className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {payout ? (
                        <>
                          Send <span className="tabular">{formatMoneyWithCode(a.amount_minor ?? 0, a.currency)}</span> to {payee?.name ?? "payee"}
                        </>
                      ) : (
                        actionSummary(a, { clientName: client?.name, invoice: inv })
                      )}
                    </p>
                    <p className="text-[13px] text-muted">
                      {inv && (
                        <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => openInvoice(inv.id)}>
                          {payout ? `${client?.name ?? "Client"} paid “${inv.description}”` : `Invoice “${inv.description}”`}
                        </button>
                      )}
                      {" · "}
                      <time dateTime={a.updated_at} title={formatDateTime(a.updated_at)}>
                        {relativeTime(a.updated_at)}
                      </time>
                    </p>
                  </div>
                  <Button variant="primary" onClick={() => openApproval(a.id)} className="w-full sm:w-auto">
                    {payout ? "Review payout" : "Review reminder"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {locked.length > 0 && (
        <section aria-labelledby="locked-h" className="card overflow-hidden">
          <h2 id="locked-h" className="border-b border-border px-4 py-3 font-semibold">
            Waiting for clients to pay
          </h2>
          <ul className="divide-y divide-border">
            {locked.map((a) => {
              const inv = a.trigger_invoice_id ? invoices.get(a.trigger_invoice_id) : undefined;
              const client = inv ? contacts.get(inv.contact_id) : undefined;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                  <Lock aria-hidden className="size-4 text-locked" />
                  <div className="min-w-0 flex-1">
                    <p>{a.summary}</p>
                    <p className="text-[13px] text-muted">Unlocks when {client?.name ?? "the client"} pays{inv ? ` “${inv.description}”` : ""}.</p>
                  </div>
                  <StatusBadge size="sm" status={actionStatusDisplay(a.status, a.type)} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
