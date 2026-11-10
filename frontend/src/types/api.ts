/**
 * Types mirroring the PaySasa backend (backend/server, backend/supabase/migrations/0001_init.sql).
 * Money is always integer minor units plus an ISO 4217 code. Never do float maths on it.
 * Timestamps are ISO 8601 strings; `date` columns are 'YYYY-MM-DD'.
 */

export type Uuid = string;
export type IsoDateTime = string;
export type IsoDate = string;
/** ISO 4217 code. The backend creates these currencies; rows stay loosely typed so formatting never breaks. */
export type CurrencyCode = string;
export const DEFAULT_CURRENCY = "KES" as const;
export const BACKEND_CURRENCIES = ["KES", "USD", "EUR", "GBP", "CAD", "AUD", "CHF"] as const;
export type BackendCurrency = (typeof BACKEND_CURRENCIES)[number];

// --- Enums (Postgres) --------------------------------------------------------

export type ContactRole = "client" | "contractor";
export type InvoiceStatus = "draft" | "sent" | "paid" | "cancelled" | "failed";
export type ActionType = "payout" | "invoice_reminder";
export type ActionStatus =
  | "locked"
  | "awaiting_approval"
  | "executing"
  | "submitted"
  | "succeeded"
  | "failed"
  | "rejected"
  | "cancelled";
export type ActorKind = "agent" | "user" | "paypal" | "system";
export type AgentRunStatus = "running" | "completed" | "failed";

// --- Table rows (as returned by Supabase/PostgREST under RLS) ---------------

export interface Profile {
  id: Uuid;
  display_name: string;
  default_currency: CurrencyCode;
  created_at: IsoDateTime;
}

export interface Contact {
  id: Uuid;
  owner_id: Uuid;
  name: string;
  email: string;
  role: ContactRole;
  aliases: string[];
  created_at: IsoDateTime;
}

export interface Invoice {
  id: Uuid;
  owner_id: Uuid;
  contact_id: Uuid;
  paypal_invoice_id: string | null;
  description: string;
  amount_minor: number;
  currency: CurrencyCode;
  status: InvoiceStatus;
  /** Raw PayPal status (SENT, PAID, MARKED_AS_PAID, ...), for debugging. */
  paypal_status: string | null;
  due_date: IsoDate | null;
  sent_at: IsoDateTime | null;
  paid_at: IsoDateTime | null;
  last_reminder_at: IsoDateTime | null;
  error: string | null;
  agent_run_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  /** Set by the display-currency layer when the row is restated in the profile's currency. */
  source_amount_minor?: number;
  source_currency?: CurrencyCode;
}

export interface PendingAction {
  id: Uuid;
  owner_id: Uuid;
  type: ActionType;
  status: ActionStatus;
  /** Payout: unlocks when this invoice is paid. Reminder: the invoice being chased. */
  trigger_invoice_id: Uuid | null;
  /** Payouts only. */
  payee_contact_id: Uuid | null;
  /** Payouts only (null for reminders). */
  amount_minor: number | null;
  currency: CurrencyCode | null;
  /** numeric(5,2): a number via PostgREST, a string ("20.00") via the API. */
  split_percent: number | string | null;
  /** Grid text, e.g. "Payout Sarah $240.00 upon settlement". */
  summary: string;
  /** Reminders: the LLM-drafted note, editable on approve. */
  draft_message: string | null;
  idempotency_key: string;
  paypal_payout_batch_id: string | null;
  /** Failure reason, or the rejection reason. */
  error: string | null;
  decided_at: IsoDateTime | null;
  executed_at: IsoDateTime | null;
  agent_run_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  /** Set by the display-currency layer when the row is restated in the profile's currency. */
  source_amount_minor?: number | null;
  source_currency?: CurrencyCode | null;
}

export interface ToolCallLog {
  name: AgentToolName | string;
  args: Record<string, unknown>;
  result: AgentToolResult;
}

export interface AgentRun {
  id: Uuid;
  owner_id: Uuid;
  user_message: string;
  reply: string | null;
  tool_calls: ToolCallLog[];
  status: AgentRunStatus;
  error: string | null;
  created_at: IsoDateTime;
}

export interface ActivityLogEntry {
  /** bigint identity */
  id: number;
  owner_id: Uuid;
  actor: ActorKind;
  /** e.g. 'invoice.sent', 'payout.unlocked', 'agent.send_invoice', 'agent.find_contact.error' */
  event: string;
  message: string;
  entity_type: "invoice" | "pending_action" | "agent_run" | "contact" | null;
  entity_id: Uuid | null;
  /** Transitions: { from, to, ... }. Agent tools: { tool, args, result }. */
  details: Record<string, unknown>;
  created_at: IsoDateTime;
}

/** Tables in the supabase_realtime publication. */
export const REALTIME_TABLES = ["invoices", "pending_actions", "contacts", "activity_log"] as const;
export type RealtimeTable = (typeof REALTIME_TABLES)[number];

// --- Agent tool results (agent_runs.tool_calls[].result) --------------------

export type AgentToolName =
  | "find_contact"
  | "create_contact"
  | "send_invoice"
  | "schedule_payout"
  | "list_invoices"
  | "list_pending_actions";

export interface ToolError {
  error: string;
}

export interface ContactOut {
  contact_id: Uuid;
  name: string;
  email: string;
  role: ContactRole;
  aliases: string[];
}

export interface FindContactResult {
  matches: ContactOut[];
  count: number;
}

export interface CreateContactResult {
  contact: ContactOut;
}

export interface SendInvoiceResult {
  invoice_id: Uuid;
  status: "sent";
  /** Contact name */
  contact: string;
  /** Pre-formatted, e.g. "$1,200.00" */
  amount: string;
  currency: BackendCurrency;
  due_date: IsoDate;
}

export interface SchedulePayoutResult {
  action_id: Uuid;
  status: "locked" | "awaiting_approval";
  summary: string;
  /** Pre-formatted, e.g. "$240.00" */
  amount: string;
  /** Payee name */
  payee: string;
  needs_approval: true;
}

export interface DraftReminderResult {
  action_id: Uuid;
  status: "awaiting_approval";
  summary: string;
  draft_message: string;
  /** Client name */
  contact: string;
  description: string;
  /** Pre-formatted, e.g. "$4,200.00" */
  amount: string;
  needs_approval: true;
  /** True when a reminder for this invoice was already waiting, so nothing new was queued. */
  already_queued: boolean;
}

export interface ListInvoicesResult {
  invoices: {
    invoice_id: Uuid;
    contact: string;
    description: string;
    amount: string;
    status: InvoiceStatus;
    due_date: IsoDate | null;
    overdue: boolean;
  }[];
  count: number;
}

export interface ListPendingActionsResult {
  actions: {
    action_id: Uuid;
    type: ActionType;
    status: ActionStatus;
    summary: string;
    trigger_invoice_id: Uuid | null;
  }[];
  count: number;
}

export type AgentToolResult =
  | ToolError
  | FindContactResult
  | CreateContactResult
  | SendInvoiceResult
  | SchedulePayoutResult
  | DraftReminderResult
  | ListInvoicesResult
  | ListPendingActionsResult
  | Record<string, unknown>;

// --- HTTP API ----------------------------------------------------------------

export type ApiErrorCode =
  | "unauthorized"
  | "not_found"
  | "method_not_allowed"
  | "http_error"
  | "invalid_request"
  | "conflict"
  | "agent_failed";

/** Every handled error: { error: { code, message } }. Unhandled 500s are plain text (and lack CORS headers). */
export interface ApiErrorBody {
  error: { code: ApiErrorCode | string; message: string };
}

export interface HealthResponse {
  ok: true;
  /** Which PayPal the server is wired to. Older servers omit it. */
  paypal?: "mock" | "sandbox" | "live";
}

/** POST /api/agent/message */
export interface AgentMessageRequest {
  /** 1-2000 chars */
  message: string;
}
export interface AgentMessageResponse {
  run_id: Uuid;
  reply: string;
}

/** GET /api/agent/runs?limit=1..100 */
export type AgentRunSummary = Pick<AgentRun, "id" | "user_message" | "reply" | "status" | "created_at">;
export type AgentRunsResponse = AgentRunSummary[];

/** POST /api/actions/:id/approve. `message` only applies to invoice_reminder (1-500 chars). */
export interface ApproveRequest {
  message?: string;
}
/** POST /api/actions/:id/reject */
export interface RejectRequest {
  reason?: string;
}
export interface ActionResponse {
  action: PendingAction;
}

/** POST /api/contacts -> 201 */
export interface CreateContactRequest {
  name: string;
  email: string;
  role: ContactRole;
  aliases?: string[];
}
export interface CreateContactResponse {
  contact: Contact;
}

/** POST /dev/simulate-paid/:invoiceId (ENABLE_DEV_ROUTES only) */
export interface SimulatePaidResponse {
  invoice: Invoice;
}
/** GET /api/profile, PATCH /api/profile */
export interface ProfileResponse {
  profile: Profile;
}
export interface UpdateProfileRequest {
  default_currency: CurrencyCode;
}

/** POST /dev/run-chase (ENABLE_DEV_ROUTES only) */
export interface RunChaseResponse {
  created: number;
}
