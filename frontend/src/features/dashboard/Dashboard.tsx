import { Activity, FileText, Sparkles, Wallet } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorPanel } from "@/components/ui/EmptyState";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Segmented } from "@/components/ui/Segmented";
import { SkeletonRows, Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { useAgent } from "@/features/agent/AgentProvider";
import { DemoPanel } from "@/features/demo/DemoPanel";
import { FirstRunChecklist } from "@/features/onboarding/FirstRunChecklist";
import { useIsWide } from "@/hooks/useMediaQuery";
import { DEMO_PROMPT } from "@/lib/agent";
import { env } from "@/lib/env";
import { formatTotals, totalsByCurrency } from "@/lib/money";
import { useActions, useActivity, useContactsById, useInvoices, useInvoicesById } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { ActionCardList, ActivityList, InvoiceCardList } from "./CardLists";
import { buildActionRows, buildActivityRows, buildInvoiceRows, type ActivityRow } from "./rows";

const InvoicesGrid = lazy(() => import("./InvoicesGrid"));
const PayoutsGrid = lazy(() => import("./PayoutsGrid"));
const ActivityGrid = lazy(() => import("./ActivityGrid"));

type Tab = "invoices" | "payouts" | "activity";

export function Dashboard() {
  const [params, setParams] = useSearchParams();
  const tab = (["invoices", "payouts", "activity"].includes(params.get("tab") ?? "") ? params.get("tab") : "invoices") as Tab;
  const setTab = (t: Tab) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("tab", t);
      return n;
    });

  const invoices = useInvoices();
  const actions = useActions();
  const awaitingCount = (actions.data ?? []).filter((a) => a.status === "awaiting_approval").length;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-[22px] font-semibold">Dashboard</h1>
        <p className="text-muted">Invoices, payouts and everything PaySasa did for you, updated live.</p>
      </div>
      <Kpis />
      <FirstRunChecklist />
      {env.enableDemo && <DemoPanel />}

      <section className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-1">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <Segmented<Tab>
            idPrefix="dash"
            label="Dashboard views"
            value={tab}
            onChange={setTab}
            items={[
              { key: "invoices", label: "Invoices", badge: <Count n={invoices.data?.length} /> },
              { key: "payouts", label: "Payouts & actions", badge: awaitingCount ? <Count n={awaitingCount} tone="warning" label="need approval" /> : <Count n={actions.data?.length} /> },
              { key: "activity", label: "Activity" },
            ]}
          />
        </div>
        <div role="tabpanel" id={`dash-panel-${tab}`} aria-labelledby={`dash-tab-${tab}`} className="min-h-0">
          <ErrorBoundary region={`${tab} view`}>
            {tab === "invoices" && <InvoicesPanel />}
            {tab === "payouts" && <PayoutsPanel />}
            {tab === "activity" && <ActivityPanel />}
          </ErrorBoundary>
        </div>
      </section>
    </div>
  );
}

function Count({ n, tone, label }: { n?: number; tone?: "warning"; label?: string }) {
  if (n == null) return null;
  return (
    <span className={cn("rounded-full px-1.5 text-xs tabular", tone === "warning" ? "bg-warning text-white dark:text-bg" : "bg-border text-muted")}>
      {n}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  );
}

function GridFrame({ children }: { children: ReactNode }) {
  return <div className="h-[calc(100dvh-14rem)] min-h-[440px]">{children}</div>;
}

function useDemoPromptAction() {
  const { prefill } = useAgent();
  return (
    <Button variant="primary" icon={<Sparkles aria-hidden className="size-4" />} onClick={() => prefill(DEMO_PROMPT)}>
      Try the demo prompt
    </Button>
  );
}

function InvoicesPanel() {
  const wide = useIsWide();
  const { openInvoice } = useWorkspace();
  const invoices = useInvoices();
  const actions = useActions();
  const contacts = useContactsById();
  const rows = useMemo(() => buildInvoiceRows(invoices.data ?? [], contacts, actions.data ?? []), [invoices.data, contacts, actions.data]);
  const demo = useDemoPromptAction();

  if (invoices.isLoading) return <SkeletonRows rows={8} label="Loading invoices" />;
  if (invoices.isError) return <ErrorPanel message={(invoices.error as Error).message} onRetry={() => invoices.refetch()} />;
  if (rows.length === 0)
    return (
      <EmptyState icon={<FileText aria-hidden className="size-6" />} title="No invoices yet" action={demo}>
        Ask PaySasa to bill a client, for example <em>“Invoice John Doe $1,200 for the Q3 Video Campaign”</em>. It sends a PayPal invoice and it
        shows up here as <strong>Awaiting payment</strong>.
      </EmptyState>
    );
  return wide ? (
    <GridFrame>
      <Suspense fallback={<SkeletonRows rows={8} label="Loading grid" />}>
        <InvoicesGrid rows={rows} onOpen={openInvoice} />
      </Suspense>
    </GridFrame>
  ) : (
    <InvoiceCardList rows={rows} onOpen={openInvoice} />
  );
}

function PayoutsPanel() {
  const wide = useIsWide();
  const { openApproval, openInvoice } = useWorkspace();
  const actions = useActions();
  const contacts = useContactsById();
  const invoices = useInvoicesById();
  const rows = useMemo(() => buildActionRows(actions.data ?? [], contacts, invoices), [actions.data, contacts, invoices]);
  const demo = useDemoPromptAction();

  if (actions.isLoading) return <SkeletonRows rows={6} label="Loading payouts" />;
  if (actions.isError) return <ErrorPanel message={(actions.error as Error).message} onRetry={() => actions.refetch()} />;
  if (rows.length === 0)
    return (
      <EmptyState icon={<Wallet aria-hidden className="size-6" />} title="No payouts or reminders yet" action={demo}>
        Ask PaySasa to pay a collaborator once a client pays, for example <em>“Once paid, pay my editor 20%”</em>. The payout stays{" "}
        <strong>locked</strong> until the invoice is paid, then waits here for your approval.
      </EmptyState>
    );
  return wide ? (
    <GridFrame>
      <Suspense fallback={<SkeletonRows rows={6} label="Loading grid" />}>
        <PayoutsGrid rows={rows} onReview={openApproval} onOpenInvoice={openInvoice} />
      </Suspense>
    </GridFrame>
  ) : (
    <ActionCardList rows={rows} onReview={openApproval} onOpenInvoice={openInvoice} />
  );
}

function ActivityPanel() {
  const wide = useIsWide();
  const { openApproval, openInvoice } = useWorkspace();
  const activity = useActivity();
  const rows = useMemo(() => buildActivityRows(activity.data ?? []), [activity.data]);
  const onOpenEntity = useCallback(
    (r: ActivityRow) => {
      const { entity_type, entity_id } = r.entry;
      if (!entity_id) return;
      if (entity_type === "invoice") openInvoice(entity_id);
      else if (entity_type === "pending_action") openApproval(entity_id);
    },
    [openApproval, openInvoice],
  );
  if (activity.isLoading) return <SkeletonRows rows={8} label="Loading activity" />;
  if (activity.isError) return <ErrorPanel message={(activity.error as Error).message} onRetry={() => activity.refetch()} />;
  if (rows.length === 0)
    return (
      <EmptyState icon={<Activity aria-hidden className="size-6" />} title="Nothing has happened yet">
        Everything PaySasa, PayPal and you do is recorded here: invoices sent, payments received, payouts approved.
      </EmptyState>
    );
  return wide ? (
    <GridFrame>
      <Suspense fallback={<SkeletonRows rows={8} label="Loading grid" />}>
        <ActivityGrid rows={rows} onOpenEntity={onOpenEntity} />
      </Suspense>
    </GridFrame>
  ) : (
    <ActivityList rows={rows} onOpenEntity={onOpenEntity} />
  );
}

function Kpis() {
  const invoices = useInvoices();
  const actions = useActions();
  const rows = useMemo(() => buildInvoiceRows(invoices.data ?? [], new Map(), []), [invoices.data]);
  const awaiting = rows.filter((r) => r.status === "awaiting" || r.status === "overdue");
  const overdue = rows.filter((r) => r.status === "overdue");
  const monthAgo = Date.now() - 30 * 86_400_000;
  const paid = rows.filter((r) => r.status === "paid" && r.invoice.paid_at && new Date(r.invoice.paid_at).getTime() >= monthAgo);
  const approvals = (actions.data ?? []).filter((a) => a.status === "awaiting_approval").length;
  const loading = invoices.isLoading || actions.isLoading;

  const tiles: { label: string; value: string; sub: string; tone?: string; to?: string }[] = [
    { label: "Awaiting payment", value: formatTotals(totalsByCurrency(awaiting)) || "-", sub: `${awaiting.length} invoice${awaiting.length === 1 ? "" : "s"}` },
    { label: "Overdue", value: formatTotals(totalsByCurrency(overdue)) || "-", sub: `${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`, tone: overdue.length ? "text-danger" : undefined },
    { label: "Paid, last 30 days", value: formatTotals(totalsByCurrency(paid)) || "-", sub: `${paid.length} invoice${paid.length === 1 ? "" : "s"}`, tone: paid.length ? "text-success" : undefined },
    { label: "Needs your approval", value: String(approvals), sub: approvals ? "Review now" : "All clear", tone: approvals ? "text-warning" : undefined, to: "/approvals" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => {
        const body = (
          <dl>
            <dt className="text-[13px] text-muted">{t.label}</dt>
            <dd className={cn("mt-1 text-lg font-semibold tabular break-words", t.tone)}>{loading ? <Skeleton className="h-6 w-24" /> : t.value}</dd>
            <dd className="text-xs text-muted">{loading ? "" : t.sub}</dd>
          </dl>
        );
        const cls = "block rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-1";
        return t.to ? (
          <Link key={t.label} to={t.to} className={cn(cls, "transition-colors hover:border-accent")}>
            {body}
          </Link>
        ) : (
          <div key={t.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
