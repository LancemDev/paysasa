import { AlertTriangle, CheckCircle2, Clock, Loader2, Send, ShieldCheck, XCircle } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { Contact, Invoice, PendingAction } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { TextArea, TextField } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/components/ui/cn";
import { FlowLine } from "@/components/ui/FlowLine";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney, formatMoneyWithCode } from "@/lib/money";
import { plainPayPalError } from "@/lib/paypalErrors";
import { useActions, useAgentRun, useContactsById, useInvoicesById } from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import { actionStatusDisplay, invoiceDisplayStatus, invoiceRef, invoiceStatusDisplay } from "@/lib/status";
import { useDecideAction, type DecisionOutcome } from "./useDecideAction";

const MAX_REMINDER = 500;

export interface ApprovalModalProps {
  actionId: string | null;
  onClose: () => void;
  onOpenInvoice?: (invoiceId: string) => void;
}

export function ApprovalModal({ actionId, onClose, onOpenInvoice }: ApprovalModalProps) {
  const { data: actions } = useActions();
  const action = actions?.find((a) => a.id === actionId) ?? null;
  return (
    <Modal
      open={!!actionId}
      onOpenChange={(o) => !o && onClose()}
      title={action?.type === "invoice_reminder" ? "Review payment reminder" : "Approve payout"}
      description={action?.type === "invoice_reminder" ? "Nothing reaches your client until you send it." : "Money only moves after you approve."}
    >
      {action ? (
        <ApprovalBody key={action.id} action={action} onClose={onClose} onOpenInvoice={onOpenInvoice} />
      ) : (
        <p className="p-5 text-muted">{actions ? "This action no longer exists." : "Loading…"}</p>
      )}
    </Modal>
  );
}

function ApprovalBody({ action, onClose, onOpenInvoice }: { action: PendingAction; onClose: () => void; onOpenInvoice?: (id: string) => void }) {
  const contacts = useContactsById();
  const invoices = useInvoicesById();
  const { outcome, approve, reject, reset } = useDecideAction(action.id);
  const payee = action.payee_contact_id ? contacts.get(action.payee_contact_id) : undefined;
  const invoice = action.trigger_invoice_id ? invoices.get(action.trigger_invoice_id) : undefined;
  const client = invoice ? contacts.get(invoice.contact_id) : undefined;

  const showResult =
    outcome.kind === "answered" ||
    outcome.kind === "conflict" ||
    (outcome.kind === "unknown" && action.status !== "awaiting_approval") ||
    (outcome.kind === "idle" && action.status !== "awaiting_approval");

  if (showResult) return <ResultView action={action} payee={payee} outcome={outcome} onClose={onClose} />;

  const props = { action, payee, invoice, client, outcome, approve, reject, reset, onOpenInvoice };
  return action.type === "payout" ? <PayoutReview {...props} /> : <ReminderReview {...props} />;
}

interface ReviewProps {
  action: PendingAction;
  payee?: Contact;
  invoice?: Invoice;
  client?: Contact;
  outcome: DecisionOutcome;
  approve: (message?: string) => Promise<void>;
  reject: (reason?: string) => Promise<void>;
  reset: () => void;
  onOpenInvoice?: (id: string) => void;
}

function PayoutReview({ action, payee, invoice, client, outcome, approve, reject, reset, onOpenInvoice }: ReviewProps) {
  const [{ secondConfirmMinor }] = useSettings();
  const [step, setStep] = useState<"review" | "confirm" | "reject">("review");
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const checkboxId = useId();
  const pending = outcome.kind === "pending";
  const amount = action.amount_minor ?? 0;
  const money = formatMoneyWithCode(amount, action.currency);
  const payeeName = payee?.name ?? "the payee";
  const needsSecond = amount >= secondConfirmMinor;

  const onApprove = () => {
    if (needsSecond && step !== "confirm") {
      setStep("confirm");
      return;
    }
    void approve();
  };

  return (
    <div className="flex flex-col">
      <div className="space-y-4 p-5">
        <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4" role="note">
          <p className="text-base font-semibold text-fg">
            This will send <span className="tabular">{money}</span> to {payeeName} via PayPal.
          </p>
          <p className="mt-1 text-[13px] text-muted">Once PayPal accepts it, it can't be undone from PaySasa.</p>
        </div>
        {invoice && (
          <div aria-hidden className="rounded-2xl border border-border bg-surface-2 px-4 pt-4 pb-3">
            <FlowLine
              from={client?.name ?? "Client"}
              to={payeeName}
              inAmount={formatMoney(invoice.amount_minor, invoice.currency)}
              outAmount={formatMoney(amount, action.currency)}
              locked={invoice.status !== "paid"}
            />
          </div>
        )}

        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 sm:grid-cols-[8.5rem_1fr] gap-y-2.5">
          <Row label="Recipient">
            {payee ? (
              <>
                <span className="font-medium">{payee.name}</span>
                <span className="block text-[13px] break-all text-muted">{payee.email}</span>
              </>
            ) : (
              "Unknown contact"
            )}
          </Row>
          <Row label="Amount">
            <span className="tabular font-medium">{money}</span>
            {action.split_percent != null && <span className="text-muted"> ({Number(action.split_percent)}% of the invoice)</span>}
          </Row>
          <Row label="Fees">
            <span className="text-muted">Any PayPal fee is set and deducted by PayPal; PaySasa doesn't add one.</span>
          </Row>
          <Row label="Triggered by">
            {invoice ? (
              <span className="flex flex-wrap items-center gap-2">
                <button type="button" className="text-left font-medium text-accent underline-offset-2 hover:underline" onClick={() => onOpenInvoice?.(invoice.id)}>
                  {client?.name ?? "Client"}: {invoice.description}
                </button>
                <StatusBadge size="sm" status={invoiceStatusDisplay(invoiceDisplayStatus(invoice))} />
                <span className="block w-full text-[13px] text-muted">
                  {formatMoney(invoice.amount_minor, invoice.currency)} · {invoiceRef(invoice)}
                  {invoice.paid_at && ` · paid ${formatDate(invoice.paid_at)}`}
                </span>
              </span>
            ) : (
              <span className="text-muted">No linked invoice</span>
            )}
          </Row>
          <Row label="Proposed by">
            <ProposedBy action={action} />
          </Row>
        </dl>

        {step === "confirm" && (
          <div className="animate-in rounded-[var(--radius-card)] border border-danger/40 bg-danger-soft p-4">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle aria-hidden className="size-4 text-danger" /> Second confirmation needed
            </p>
            <p className="mt-1 text-[13px] text-muted">
              This payout is at or above your {formatMoney(secondConfirmMinor, action.currency)} safety limit (change it in Settings).
            </p>
            <label htmlFor={checkboxId} className="mt-3 flex items-start gap-2">
              <input id={checkboxId} type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>
                I confirm sending <strong className="tabular">{money}</strong> to {payeeName}.
              </span>
            </label>
          </div>
        )}

        {step === "reject" && (
          <TextField
            label="Reason (optional)"
            placeholder="e.g. Sarah already got paid in cash"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        )}

        {(outcome.kind === "error" || outcome.kind === "unknown") && (
          <InlineError
            message={
              outcome.kind === "error"
                ? outcome.message
                : "We couldn't confirm that PaySasa received your decision. Nothing has been sent, so it's safe to try again."
            }
            onRetry={() => void (outcome.decision === "reject" ? reject(reason.trim() || undefined) : approve())}
            onDismiss={reset}
          />
        )}
      </div>

      <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:flex-row sm:justify-end">
        {step === "reject" ? (
          <>
            <Button disabled={pending} onClick={() => setStep("review")}>
              Back
            </Button>
            <Button variant="danger" loading={pending && outcome.decision === "reject"} disabled={pending} onClick={() => void reject(reason.trim() || undefined)}>
              Reject payout
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger-ghost" disabled={pending} onClick={() => setStep("reject")}>
              Reject…
            </Button>
            {step === "confirm" && (
              <Button disabled={pending} onClick={() => setStep("review")}>
                Back
              </Button>
            )}
            <Button
              variant="primary"
              icon={<ShieldCheck aria-hidden className="size-4" />}
              loading={pending && outcome.decision === "approve"}
              disabled={pending || (step === "confirm" && !confirmed)}
              onClick={onApprove}
            >
              {pending ? "Sending to PayPal…" : step === "confirm" ? `Yes, send ${money}` : `Approve and send ${formatMoney(amount, action.currency)}`}
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}

function ReminderReview({ action, invoice, client, outcome, approve, reject, reset, onOpenInvoice }: ReviewProps) {
  const [text, setText] = useState(action.draft_message ?? "");
  const pending = outcome.kind === "pending";
  const trimmed = text.trim();
  const tooLong = trimmed.length > MAX_REMINDER;
  const error = !trimmed ? "The reminder can't be empty." : tooLong ? `Keep it under ${MAX_REMINDER} characters.` : null;
  const edited = trimmed !== (action.draft_message ?? "").trim();

  return (
    <div className="flex flex-col">
      <div className="space-y-4 p-5">
        <p>
          PaySasa drafted this reminder to <strong>{client?.name ?? "your client"}</strong>
          {invoice && (
            <>
              {" "}for{" "}
              <button type="button" className="font-medium text-accent underline-offset-2 hover:underline" onClick={() => onOpenInvoice?.(invoice.id)}>
                {invoice.description} ({formatMoney(invoice.amount_minor, invoice.currency)})
              </button>
            </>
          )}
          . PayPal sends it with the original invoice.
        </p>
        <TextArea
          label="Reminder message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          error={error}
          hint={`${trimmed.length}/${MAX_REMINDER} characters${edited ? " · edited" : ""}`}
        />
        {(outcome.kind === "error" || outcome.kind === "unknown") && (
          <InlineError
            message={outcome.kind === "error" ? outcome.message : "We couldn't confirm the request reached PaySasa. Nothing was sent, so it's safe to try again."}
            onRetry={() => void (outcome.decision === "reject" ? reject("Discarded from review") : approve(edited ? trimmed : undefined))}
            onDismiss={reset}
          />
        )}
      </div>
      <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:flex-row sm:justify-end">
        <Button variant="danger-ghost" disabled={pending} loading={pending && outcome.decision === "reject"} onClick={() => void reject("Discarded from review")}>
          Discard
        </Button>
        <Button
          variant="primary"
          icon={<Send aria-hidden className="size-4" />}
          disabled={pending || !!error}
          loading={pending && outcome.decision === "approve"}
          onClick={() => void approve(edited ? trimmed : undefined)}
        >
          {pending ? "Sending…" : "Send reminder"}
        </Button>
      </footer>
    </div>
  );
}

function ResultView({ action, payee, outcome, onClose }: { action: PendingAction; payee?: Contact; outcome: DecisionOutcome; onClose: () => void }) {
  const money = action.amount_minor != null ? formatMoneyWithCode(action.amount_minor, action.currency) : "";
  const who = payee?.name ?? "the payee";
  const payout = action.type === "payout";
  let icon: ReactNode;
  let title: string;
  let body: ReactNode;
  let tone: "success" | "info" | "danger" | "muted";

  switch (action.status) {
    case "executing":
      tone = "info";
      icon = <Loader2 aria-hidden className="size-6 animate-spin" />;
      title = "Waiting for PayPal to confirm";
      body = "PayPal hasn't confirmed this yet. Please don't approve it again; this screen updates by itself.";
      break;
    case "submitted":
      tone = "info";
      icon = <Clock aria-hidden className="size-6" />;
      title = "Submitted to PayPal";
      body = `PayPal accepted the payout of ${money} to ${who}. It shows as Paid out once PayPal confirms it's complete.`;
      break;
    case "succeeded":
      tone = "success";
      icon = <CheckCircle2 aria-hidden className="size-6" />;
      title = payout ? "Paid out" : "Reminder sent";
      body = payout ? `PayPal completed the payout of ${money} to ${who}.` : "PayPal sent your reminder with the original invoice.";
      break;
    case "failed":
      tone = "danger";
      icon = <XCircle aria-hidden className="size-6" />;
      title = payout ? "PayPal didn't send this payout" : "The reminder wasn't sent";
      body = (
        <>
          <span className="block">{plainPayPalError(action.error)}</span>
          <span className="mt-2 block text-[13px] text-muted">
            {payout ? "No money was sent. " : ""}Failed actions can't be retried from PaySasa yet. Ask PaySasa to schedule a new one once the issue is fixed.
          </span>
        </>
      );
      break;
    case "locked":
      tone = "muted";
      icon = <Clock aria-hidden className="size-6" />;
      title = "Locked until the invoice is paid";
      body = "When your client pays, this payout unlocks and comes back here for your approval.";
      break;
    case "cancelled":
      tone = "muted";
      icon = <XCircle aria-hidden className="size-6" />;
      title = "Cancelled";
      body = payout ? "The linked invoice was cancelled, so this payout won't happen." : "The invoice was paid or cancelled, so no reminder is needed.";
      break;
    case "rejected":
      tone = "muted";
      icon = <XCircle aria-hidden className="size-6" />;
      title = payout ? "Payout rejected" : "Reminder discarded";
      body = payout ? "Nothing was sent." : "Your client won't receive it.";
      break;
    default:
      tone = "muted";
      icon = <Clock aria-hidden className="size-6" />;
      title = actionStatusDisplay(action.status, action.type).label;
      body = "";
  }

  const tones = { success: "bg-success-soft text-success", info: "bg-info-soft text-info", danger: "bg-danger-soft text-danger", muted: "bg-surface-2 text-muted" };
  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-3 p-6 text-center" role="status" aria-live="polite">
        <div className={cn("grid size-12 place-items-center rounded-full", tones[tone])}>{icon}</div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {outcome.kind === "conflict" && <p className="text-[13px] text-muted">{outcome.message}</p>}
        <div className="max-w-sm text-muted">{body}</div>
        {(action.paypal_payout_batch_id || action.executed_at) && (
          <dl className="mt-1 grid w-full max-w-sm grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[var(--radius-card)] bg-surface-2 p-3 text-left text-[13px]">
            {action.paypal_payout_batch_id && (
              <>
                <dt className="text-muted">PayPal batch ID</dt>
                <dd className="font-mono break-all">{action.paypal_payout_batch_id}</dd>
              </>
            )}
            {action.executed_at && (
              <>
                <dt className="text-muted">Submitted</dt>
                <dd>{formatDateTime(action.executed_at)}</dd>
              </>
            )}
          </dl>
        )}
      </div>
      <footer className="flex justify-end border-t border-border p-4">
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </footer>
    </div>
  );
}

function ProposedBy({ action }: { action: PendingAction }) {
  const { data: run } = useAgentRun(action.agent_run_id);
  if (!action.agent_run_id) return <span>PaySasa's daily overdue check</span>;
  return (
    <span>
      PaySasa agent
      {run?.user_message && <span className="mt-0.5 block text-[13px] text-muted">When you asked: “{truncate(run.user_message, 140)}”</span>}
      <span className="block text-[13px] text-muted">{formatDateTime(action.created_at)}</span>
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function InlineError({ message, onRetry, onDismiss }: { message: string; onRetry: () => void; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-3 text-[13px]">
      <p className="flex items-start gap-2">
        <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
        {message}
      </p>
      <div className="flex gap-3 pl-6">
        <button type="button" onClick={onRetry} className="font-medium text-danger underline underline-offset-2">
          Try again
        </button>
        <button type="button" onClick={onDismiss} className="text-muted underline underline-offset-2">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
