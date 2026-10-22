import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import type { Contact, Invoice, PendingAction } from "@/types/api";
import { ToastProvider } from "@/components/ui/Toast";
import { qk } from "@/lib/queries";
import { WorkspaceProvider } from "@/lib/workspace";

export const NOW_ISO = "2026-10-22T09:00:00Z";
export const OWNER = "00000000-0000-0000-0000-000000000001";

export const john: Contact = { id: "c-john", owner_id: OWNER, name: "John Doe", email: "john@example.com", role: "client", aliases: [], created_at: NOW_ISO };
export const sarah: Contact = { id: "c-sarah", owner_id: OWNER, name: "Sarah", email: "sarah@example.com", role: "contractor", aliases: ["my editor"], created_at: NOW_ISO };

export function makeInvoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    owner_id: OWNER,
    contact_id: john.id,
    paypal_invoice_id: "INV2-MOCK-0001",
    description: "Q3 Video Campaign",
    amount_minor: 120000,
    currency: "USD",
    status: "sent",
    paypal_status: "SENT",
    due_date: "2026-11-05",
    sent_at: NOW_ISO,
    paid_at: null,
    last_reminder_at: null,
    error: null,
    agent_run_id: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    ...over,
  };
}

export function makePayout(over: Partial<PendingAction> = {}): PendingAction {
  return {
    id: "act-1",
    owner_id: OWNER,
    type: "payout",
    status: "awaiting_approval",
    trigger_invoice_id: "inv-1",
    payee_contact_id: sarah.id,
    amount_minor: 24000,
    currency: "USD",
    split_percent: 20,
    summary: "Payout Sarah $240.00",
    draft_message: null,
    idempotency_key: "payout-abc",
    paypal_payout_batch_id: null,
    error: null,
    decided_at: null,
    executed_at: null,
    agent_run_id: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    ...over,
  };
}

export function renderWithData(
  ui: ReactElement,
  seed: { invoices?: Invoice[]; actions?: PendingAction[]; contacts?: Contact[] } = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchInterval: false } } });
  qc.setQueryData(qk.invoices, seed.invoices ?? [makeInvoice()]);
  qc.setQueryData(qk.actions, seed.actions ?? []);
  qc.setQueryData(qk.contacts, seed.contacts ?? [john, sarah]);
  qc.setQueryData(qk.activity, []);
  const result = render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <WorkspaceProvider>{ui}</WorkspaceProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, qc };
}
