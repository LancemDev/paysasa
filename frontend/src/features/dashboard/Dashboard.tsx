import { Activity, AlertTriangle, CheckCircle2, FileText, Lock, Mail, Sparkles, Wallet } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorPanel } from "@/components/ui/EmptyState";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Segmented } from "@/components/ui/Segmented";
import { SkeletonRows, Skeleton } from "@/components/ui/Skeleton";
import { WalletStack, type WalletCard } from "@/components/ui/WalletStack";
import { cn } from "@/components/ui/cn";
import { AskBar } from "@/features/agent/AskBar";
import { useAgent } from "@/features/agent/AgentProvider";
import { FirstRunChecklist } from "@/features/onboarding/FirstRunChecklist";
import { useIsWide } from "@/hooks/useMediaQuery";
import { DEMO_PROMPT } from "@/lib/agent";
import { dueLabel, relativeTime } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { formatMoney, formatTotals, totalsByCurrency } from "@/lib/money";
import { useActions, useActivity, useContactsById, useInvoices, useInvoicesById, useProfile } from "@/lib/queries";
import { actionStatusDisplay } from "@/lib/status";
import { useWorkspace } from "@/lib/workspace";
import type { Contact, PendingAction } from "@/types/api";
import { ActionCardList, ActivityList, InvoiceCardList } from "./CardLists";
import { buildActionRows, buildActivityRows, buildInvoiceRows, type ActivityRow, type InvoiceRow } from "./rows";

const InvoicesGrid = lazy(() => import("./InvoicesGrid"));
const PayoutsGrid = lazy(() => import("./PayoutsGrid"));
const ActivityGrid = lazy(() => import("./ActivityGrid"));

type Tab = "invoices" | "payouts" | "activity";
const MONTH_AGO = () => Date.now() - 30 * 86_400_000;

/** Everything the dashboard derives from live data, computed once. */
function useMoney() {
  const invoices = useInvoices();
  const actions = useActions();
  const contacts = useContactsById();
  const rows = useMemo(() => buildInvoiceRows(invoices.data ?? [], contacts, actions.data ?? []), [invoices.data, contacts, actions.data]);
  const list = actions.data ?? [];
  const awaiting = rows.filter((r) => r.status === "awaiting" || r.status === "overdue");
  const overdue = rows.filter((r) => r.status === "overdue");
  const paid30 = rows.filter((r) => r.status === "paid" && r.invoice.paid_at && new Date(r.invoice.paid_at).getTime() >= MONTH_AGO());
  const payouts = list.filter((a) => a.type === "payout");
  const owed = payouts.filter((a) => ["locked", "awaiting_approval", "approved", "executing"].includes(a.status));
  const approvals = list.filter((a) => a.status === "awaiting_approval");
  return {
    loading: invoices.isLoading || actions.isLoading,
    rows,
    awaiting,
    overdue,
    paid30,
    payouts,
    owed,
    approvals,
    actions: list,
    contacts,
  };
}

export function Dashboard() {
  const [params, setParams] = useSearchParams();
  const tab = (["invoices", "payouts", "activity"].includes(params.get("tab") ?? "") ? params.get("tab") : "invoices") as Tab;
  const setTab = (t: Tab) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("tab", t);
      return n;
    });
  const t = useT();
  const m = useMoney();

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 pt-6 sm:px-6 sm:pt-8">
      <div className="grid items-end gap-5 lg:grid-cols-[1fr_minmax(0,560px)]">
        <Greeting m={m} />
        <AskBar />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <MoneyCard m={m} className="lg:col-span-8" />
        <NeedsYou m={m} className="lg:col-span-4" />
      </div>

      <FirstRunChecklist />

      <div className="grid gap-5 lg:grid-cols-3">
        <CashFlow m={m} />
        <Clients m={m} />
        <Team m={m} />
      </div>

      <section data-tour="ledger" aria-label="Your money" className="card flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="display text-[20px]">{t("dash.recent")}</h2>
          <Segmented<Tab>
            idPrefix="dash"
            label="Dashboard views"
            value={tab}
            onChange={setTab}
            items={[
              { key: "invoices", label: t("dash.tab.invoices"), badge: <Count n={m.rows.length} /> },
              {
                key: "payouts",
                label: t("dash.tab.payouts"),
                badge: m.approvals.length ? <Count n={m.approvals.length} tone="warning" label="need approval" /> : <Count n={m.actions.length} />,
              },
              { key: "activity", label: t("dash.tab.activity") },
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

type Money = ReturnType<typeof useMoney>;

/* ------------------------------------------------------------------ greeting */

function Greeting({ m }: { m: Money }) {
  const t = useT();
  const { data: profile } = useProfile();
  const hour = new Date().getHours();
  const hello = t(hour < 12 ? "dash.hello.morning" : hour < 18 ? "dash.hello.afternoon" : "dash.hello.evening");
  const awaiting = formatTotals(totalsByCurrency(m.awaiting));
  const parts = [
    m.approvals.length ? (m.approvals.length === 1 ? t("dash.st.approvals1") : t("dash.st.approvalsN", { n: m.approvals.length })) : null,
    awaiting ? t("dash.st.awaiting", { x: awaiting }) : null,
    m.overdue.length ? t("dash.st.overdue", { n: m.overdue.length }) : null,
  ].filter(Boolean);
  return (
    <div>
      {/* "Dashboard" stays the page heading for screen readers and tests; the greeting is the visible title. */}
      <h1 className="display text-[34px] sm:text-[40px]">
        <span className="sr-only">Dashboard: </span>
        {hello}
        {profile?.display_name ? `, ${profile.display_name}` : ""}.
      </h1>
      <p className="mt-1.5 text-[15px] text-muted" aria-live="polite">
        {m.loading ? t("dash.loading") : parts.length ? `${parts.join(" · ")}.` : t("dash.allClear")}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- money card */

function MoneyCard({ m, className }: { m: Money; className?: string }) {
  const t = useT();
  const { openInvoice, openApproval } = useWorkspace();
  const waiting = formatTotals(totalsByCurrency(m.awaiting));
  const paid = formatTotals(totalsByCurrency(m.paid30));
  const owed = formatTotals(totalsByCurrency(m.owed.map((a) => ({ amount_minor: a.amount_minor, currency: a.currency }))));
  const overdue = formatTotals(totalsByCurrency(m.overdue));

  // Wallet: the newest open invoices and payouts that make up the total.
  const cards: WalletCard[] = useMemo(() => {
    const inv: WalletCard[] = m.rows
      .filter((r) => r.status !== "cancelled")
      .slice(0, 2)
      .map((r) => ({
        id: `i:${r.id}`,
        kind: "Invoice · PayPal",
        name: r.clientName,
        amount: formatMoney(r.amount_minor, r.currency),
        meta: r.status === "paid" ? "Paid" : dueLabel(r.dueDate),
        tone: r.status === "paid" ? "mint" : "lime",
      }));
    const pay: WalletCard[] = m.payouts.slice(0, 1).map((a) => ({
      id: `a:${a.id}`,
      kind: "Payout · PayPal",
      name: m.contacts.get(a.payee_contact_id ?? "")?.name ?? "Payee",
      amount: a.amount_minor != null ? formatMoney(a.amount_minor, a.currency) : "—",
      meta: actionStatusDisplay(a.status, "payout").label,
      tone: "paper",
    }));
    return [...pay, ...inv];
  }, [m.rows, m.payouts, m.contacts]);

  const select = (id: string) => (id.startsWith("i:") ? openInvoice(id.slice(2)) : openApproval(id.slice(2)));

  return (
    <section data-tour="money" aria-labelledby="money-h" className={cn("grain relative overflow-hidden rounded-[var(--radius-sheet)] bg-forest text-white", className)}>
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-[420px] rounded-full bg-[radial-gradient(circle,rgb(200_241_105/0.22),transparent_65%)]" />
      <div className="relative grid gap-6 p-6 sm:p-7 md:grid-cols-[1fr_300px] md:items-center">
        <div className="min-w-0">
          <h2 id="money-h" className="text-[12px] font-semibold tracking-[0.16em] text-lime/85 uppercase">
            {t("dash.waiting")}
          </h2>
          <p className="display tabular mt-2 text-[44px] leading-none break-words sm:text-[56px]">{m.loading ? <Skeleton className="h-12 w-56 bg-white/10" /> : waiting || formatMoney(0, "USD")}</p>
          <p className="mt-2 text-[14px] text-white/70">
            {m.awaiting.length ? `${m.awaiting.length} ${m.awaiting.length === 1 ? t("dash.invoice") : t("dash.invoices")}` : t("dash.nothingOutstanding")}
            {m.overdue.length > 0 && (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1 font-medium text-[#ffb4a8]">
                  <AlertTriangle aria-hidden className="size-3.5" /> {overdue} {t("dash.overdue").toLowerCase()}
                </span>
              </>
            )}
          </p>
          <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10">
            <Stat label={t("dash.paid30")} value={paid || t("dash.nothingYet")} sub={`${m.paid30.length} ${m.paid30.length === 1 ? t("dash.invoice") : t("dash.invoices")}`} />
            <Stat label={t("dash.owedTeam")} value={owed || t("dash.nothingYet")} sub={t("dash.payoutsLine", { n: m.owed.length, m: m.approvals.length })} />
          </dl>
        </div>
        <div className="hidden md:block">
          {cards.length > 0 ? (
            <WalletStack
              cards={cards}
              label={waiting ? t("land.walletLabel") : t("dash.paid30")}
              total={waiting || paid || formatMoney(0, "USD")}
              onSelect={select}
              hint={t("dash.walletHint")}
            />
          ) : (
            <EmptyWallet />
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-forest/80 p-4">
      <dt className="text-[12.5px] text-white/65">{label}</dt>
      <dd className="tabular mt-1 truncate text-[20px] font-semibold">{value}</dd>
      <dd className="text-[12px] text-white/55">{sub}</dd>
    </div>
  );
}

function EmptyWallet() {
  const t = useT();
  const { prefill } = useAgent();
  return (
    <div className="rounded-2xl border border-dashed border-white/20 p-5 text-center">
      <Wallet aria-hidden className="mx-auto size-7 text-lime" />
      <p className="mt-2 text-[14px] font-medium">{t("dash.firstInvoice")}</p>
      <p className="mt-1 text-[13px] text-white/65">{t("dash.firstInvoiceBody")}</p>
      <Button size="sm" variant="cta" className="mt-4" onClick={() => prefill(DEMO_PROMPT)} icon={<Sparkles aria-hidden className="size-3.5" />}>
        {t("dash.fillKwame")}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ needs you */

interface Todo {
  id: string;
  icon: ReactNode;
  title: ReactNode;
  sub: string;
  action: ReactNode;
  tone: "warning" | "danger";
}

function NeedsYou({ m, className }: { m: Money; className?: string }) {
  const t = useT();
  const { openApproval, openInvoice } = useWorkspace();
  const { prefill } = useAgent();
  const todos: Todo[] = [
    ...m.approvals.map<Todo>((a) => {
      const payee = m.contacts.get(a.payee_contact_id ?? "");
      return {
        id: a.id,
        tone: "warning",
        icon: a.type === "payout" ? <Wallet className="size-4" /> : <Mail className="size-4" />,
        title:
          a.type === "payout" ? t("dash.todo.send", { x: formatMoney(a.amount_minor ?? 0, a.currency), name: payee?.name ?? "payee" }) : t("dash.todo.reminder"),
        sub: a.type === "payout" ? `${t("dash.todo.clientPaid")} · ${relativeTime(a.updated_at)}` : a.summary,
        action: (
          <Button size="sm" variant="primary" onClick={() => openApproval(a.id)}>
            {t("dash.review")}
          </Button>
        ),
      };
    }),
    ...m.overdue
      .filter((r) => !m.actions.some((a) => a.type === "invoice_reminder" && a.trigger_invoice_id === r.id && a.status === "awaiting_approval"))
      .map<Todo>((r) => ({
        id: r.id,
        tone: "danger",
        icon: <AlertTriangle className="size-4" />,
        title: t("dash.todo.owes", { name: r.clientName, x: formatMoney(r.amount_minor, r.currency) }),
        sub: `${t("dash.todo.late", { n: r.daysOverdue })} · ${r.description}`,
        action: (
          <Button size="sm" variant="secondary" onClick={() => prefill(`Draft a polite reminder to ${r.clientName} about the overdue invoice for ${r.description}.`)}>
            {t("dash.remind")}
          </Button>
        ),
      })),
  ];

  return (
    <section data-tour="needs" aria-labelledby="needs-h" className={cn("card flex flex-col", className)}>
      <header className="flex items-center gap-2 border-b border-border px-5 py-4">
        <h2 id="needs-h" className="display flex-1 text-[20px]">
          {t("dash.needsYou")}
        </h2>
        {todos.length > 0 && <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-white tabular dark:text-bg">{todos.length}</span>}
        <Link to="/approvals" className="text-[13px] font-medium text-muted hover:text-fg">
          {t("nav.approvals")} →
        </Link>
      </header>
      {m.loading ? (
        <SkeletonRows rows={3} label="Loading" />
      ) : todos.length === 0 ? (
        <div className="flex flex-col items-start gap-2 p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-success-soft text-success">
            <CheckCircle2 aria-hidden className="size-5" />
          </span>
          <p className="font-semibold">{t("dash.needsYouEmpty")}</p>
          <p className="text-[13px] text-muted">{t("dash.needsYouEmptyBody")}</p>
          <LockedPreview actions={m.actions} contacts={m.contacts} />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {todos.slice(0, 4).map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-5 py-3.5">
              <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-xl", x.tone === "warning" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger")}>
                {x.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{x.title}</p>
                <p className="truncate text-[12.5px] text-muted">{x.sub}</p>
              </div>
              {x.action}
            </li>
          ))}
          {todos.length > 4 && (
            <li className="px-5 py-3 text-[13px]">
              <Link to="/approvals" className="font-medium text-accent hover:underline">
                +{todos.length - 4} more
              </Link>
            </li>
          )}
          {/* Invoice shortcut keeps the list useful when only payouts are listed */}
          {m.overdue.length > 0 && (
            <li className="px-5 py-2.5 text-[12.5px] text-muted">
              <button type="button" className="hover:text-fg" onClick={() => openInvoice(m.overdue[0].id)}>
                Oldest overdue: {m.overdue[0].description} →
              </button>
            </li>
          )}
        </ul>
      )}
      <Latest />
    </section>
  );
}

/** The last few things that happened, so the card always tells you something. */
function Latest() {
  const t = useT();
  const activity = useActivity();
  const { openInvoice, openApproval } = useWorkspace();
  const rows = (activity.data ?? []).slice(0, 3);
  if (!rows.length) return null;
  return (
    <div className="mt-auto border-t border-border px-5 py-4">
      <p className="eyebrow mb-2.5">{t("dash.latest")}</p>
      <ol className="space-y-2.5">
        {rows.map((e) => (
          <li key={e.id} className="flex gap-2.5 text-[13px]">
            <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", e.actor === "paypal" ? "bg-info" : e.actor === "agent" ? "bg-[var(--chart-money)]" : "bg-fg")} />
            <button
              type="button"
              className="min-w-0 flex-1 text-left hover:text-fg"
              onClick={() => e.entity_id && (e.entity_type === "invoice" ? openInvoice(e.entity_id) : e.entity_type === "pending_action" ? openApproval(e.entity_id) : undefined)}
            >
              <span className="line-clamp-1">{e.message}</span>
              <span className="text-[12px] text-subtle">
                {e.actor === "paypal" ? "PayPal" : e.actor === "agent" ? "Assistant" : "You"} · {relativeTime(e.created_at)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** When nothing needs approval, show what's coming (locked payouts), so the card is never just empty. */
function LockedPreview({ actions, contacts }: { actions: PendingAction[]; contacts: Map<string, Contact> }) {
  const t = useT();
  const locked = actions.filter((a) => a.status === "locked").slice(0, 2);
  if (!locked.length) return null;
  return (
    <ul className="mt-3 w-full space-y-2">
      {locked.map((a) => (
        <li key={a.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px]">
          <Lock aria-hidden className="size-3.5 text-locked" />
          <span className="min-w-0 flex-1 truncate">
            {contacts.get(a.payee_contact_id ?? "")?.name ?? "Payee"} · <span className="tabular">{formatMoney(a.amount_minor ?? 0, a.currency)}</span>
          </span>
          <span className="text-xs text-muted">{t("dash.unlocks")}</span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- side panels */

function Panel({ title, figure, caption, children }: { title: string; figure: string; caption: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="card flex flex-col p-5">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <p className="display tabular mt-3 text-[28px] leading-none">{figure}</p>
      <p className="mt-1 text-[12.5px] text-muted">{caption}</p>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

/** Single-series column chart: paid per month for the main currency, with per-bar hover tooltips. */
function CashFlow({ m }: { m: Money }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const currency = useMemo(() => {
    const c = new Map<string, number>();
    m.rows.forEach((r) => c.set(r.currency, (c.get(r.currency) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  }, [m.rows]);
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const inMonth = (iso: string | null) => {
        if (!iso) return false;
        const x = new Date(iso);
        return `${x.getFullYear()}-${x.getMonth()}` === key;
      };
      const paid = m.rows.filter((r) => r.currency === currency && r.status === "paid" && inMonth(r.invoice.paid_at)).reduce((s, r) => s + r.amount_minor, 0);
      const billed = m.rows.filter((r) => r.currency === currency && inMonth(r.invoice.sent_at ?? r.invoice.created_at)).reduce((s, r) => s + r.amount_minor, 0);
      return { label: d.toLocaleString(undefined, { month: "short" }), paid, billed };
    });
  }, [m.rows, currency]);
  const max = Math.max(...months.map((x) => x.paid), 1);
  const total = months.reduce((s, x) => s + x.paid, 0);
  const H = 96;

  return (
    <Panel title={`${t("dash.cashflow")} (${currency})`} figure={formatMoney(total, currency)} caption={t("dash.paid6m")}>
      <div className="relative mt-auto">
        <svg viewBox={`0 0 300 ${H + 20}`} className="w-full overflow-visible" role="img" aria-label={`Paid per month in ${currency}: ${months.map((x) => `${x.label} ${formatMoney(x.paid, currency)}`).join(", ")}`}>
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1="0" x2="300" y1={H - f * H} y2={H - f * H} stroke="var(--gridline)" strokeWidth="1" />
          ))}
          {months.map((x, i) => {
            const bw = 22;
            const cx = 25 + i * 50;
            const h = x.paid ? Math.max(4, (x.paid / max) * (H - 8)) : 0;
            const r = Math.min(4, h);
            const y = H - h;
            return (
              <g key={x.label + i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={cx - 25} y="0" width="50" height={H + 20} fill="transparent" />
                {h > 0 ? (
                  <path
                    d={`M${cx - bw / 2},${H} V${y + r} Q${cx - bw / 2},${y} ${cx - bw / 2 + r},${y} H${cx + bw / 2 - r} Q${cx + bw / 2},${y} ${cx + bw / 2},${y + r} V${H} Z`}
                    fill="var(--chart-money)"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                ) : (
                  <rect x={cx - bw / 2} y={H - 2} width={bw} height="2" rx="1" fill="var(--border-strong)" />
                )}
                <text x={cx} y={H + 15} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">
                  {x.label}
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-2"
            style={{ left: `${((25 + hover * 50) / 300) * 100}%` }}
          >
            <p className="font-semibold">{months[hover].label}</p>
            <p className="tabular">Paid {formatMoney(months[hover].paid, currency)}</p>
            <p className="tabular text-muted">Billed {formatMoney(months[hover].billed, currency)}</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Breakdown({ items }: { items: { label: string; n: number; dot: string }[] }) {
  return (
    <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-4">
      {items.map((x) => (
        <div key={x.label}>
          <dt className="flex items-center gap-1.5 text-[12px] text-muted">
            <span aria-hidden className={cn("size-2 rounded-full", x.dot)} />
            {x.label}
          </dt>
          <dd className="tabular mt-0.5 text-[18px] font-semibold">{x.n}</dd>
        </div>
      ))}
    </dl>
  );
}

function BarList({ items, empty }: { items: { key: string; label: string; value: string; share: number; note?: ReactNode }[]; empty: string }) {
  if (!items.length) return <p className="mb-4 rounded-xl border border-dashed border-border p-3 text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="mb-4 space-y-3">
      {items.map((x) => (
        <li key={x.key}>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="min-w-0 truncate font-medium">{x.label}</span>
            <span className="tabular shrink-0">{x.value}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-[var(--chart-money)]" style={{ width: `${Math.max(4, x.share * 100)}%` }} />
          </div>
          {x.note && <div className="mt-1 text-[12px] text-muted">{x.note}</div>}
        </li>
      ))}
    </ul>
  );
}

function Clients({ m }: { m: Money }) {
  const t = useT();
  const billed = formatTotals(totalsByCurrency(m.rows));
  const clientCount = new Set(m.rows.map((r) => r.invoice.contact_id)).size;
  const items = useMemo(() => {
    const by = new Map<string, { name: string; rows: InvoiceRow[] }>();
    m.rows.forEach((r) => {
      const k = `${r.invoice.contact_id}|${r.currency}`;
      const e = by.get(k) ?? { name: r.clientName, rows: [] };
      e.rows.push(r);
      by.set(k, e);
    });
    const list = [...by.entries()].map(([k, e]) => {
      const cur = e.rows[0].currency;
      const billed = e.rows.reduce((s, r) => s + r.amount_minor, 0);
      const paid = e.rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount_minor, 0);
      return { key: k, label: e.name, billed, paid, cur, late: e.rows.some((r) => r.status === "overdue") };
    });
    const max = Math.max(...list.map((x) => x.billed), 1);
    return list
      .sort((a, b) => b.billed - a.billed)
      .slice(0, 4)
      .map((x) => ({
        key: x.key,
        label: x.label,
        value: formatMoney(x.billed, x.cur),
        share: x.billed / max,
        note: (
          <>
            {formatMoney(x.paid, x.cur)} paid{x.late && <span className="ml-1 font-medium text-danger">· late</span>}
          </>
        ),
      }));
  }, [m.rows]);
  return (
    <Panel title={t("dash.clients")} figure={billed || formatMoney(0, "USD")} caption={t("dash.billedTo", { n: clientCount })}>
      <BarList items={items} empty={t("dash.noClients")} />
      <Breakdown
        items={[
          { label: t("dash.b.paid"), n: m.rows.filter((r) => r.status === "paid").length, dot: "bg-success" },
          { label: t("dash.b.awaiting"), n: m.rows.filter((r) => r.status === "awaiting").length, dot: "bg-info" },
          { label: t("dash.b.overdue"), n: m.overdue.length, dot: "bg-danger" },
        ]}
      />
    </Panel>
  );
}

function Team({ m }: { m: Money }) {
  const t = useT();
  const items = useMemo(() => {
    const by = new Map<string, PendingAction[]>();
    m.payouts.forEach((a) => {
      const k = `${a.payee_contact_id}|${a.currency}`;
      by.set(k, [...(by.get(k) ?? []), a]);
    });
    const list = [...by.entries()].map(([k, as]) => {
      const total = as.reduce((s, a) => s + (a.amount_minor ?? 0), 0);
      const sent = as.filter((a) => a.status === "submitted" || a.status === "succeeded").reduce((s, a) => s + (a.amount_minor ?? 0), 0);
      const locked = as.filter((a) => a.status === "locked").length;
      const ready = as.filter((a) => a.status === "awaiting_approval").length;
      return { key: k, name: m.contacts.get(as[0].payee_contact_id ?? "")?.name ?? "Payee", total, sent, cur: as[0].currency, locked, ready };
    });
    const max = Math.max(...list.map((x) => x.total), 1);
    return list
      .sort((a, b) => b.total - a.total)
      .slice(0, 4)
      .map((x) => ({
        key: x.key,
        label: x.name,
        value: formatMoney(x.total, x.cur),
        share: x.total / max,
        note: [x.sent ? `${formatMoney(x.sent, x.cur)} sent` : null, x.ready ? `${x.ready} ready to approve` : null, x.locked ? `${x.locked} locked` : null].filter(Boolean).join(" · "),
      }));
  }, [m.payouts, m.contacts]);
  const sent = formatTotals(totalsByCurrency(m.payouts.filter((a) => a.status === "submitted" || a.status === "succeeded").map((a) => ({ amount_minor: a.amount_minor, currency: a.currency }))));
  const people = new Set(m.payouts.map((a) => a.payee_contact_id)).size;
  return (
    <Panel title={t("dash.team")} figure={sent || formatMoney(0, "USD")} caption={t("dash.sentTo", { n: people })}>
      <BarList items={items} empty={t("dash.noTeam")} />
      <Breakdown
        items={[
          { label: t("dash.b.locked"), n: m.payouts.filter((a) => a.status === "locked").length, dot: "bg-locked" },
          { label: t("dash.b.toApprove"), n: m.approvals.filter((a) => a.type === "payout").length, dot: "bg-warning" },
          { label: t("dash.b.sent"), n: m.payouts.filter((a) => a.status === "submitted" || a.status === "succeeded").length, dot: "bg-success" },
        ]}
      />
    </Panel>
  );
}

/* --------------------------------------------------------------- the ledger */

function Count({ n, tone, label }: { n?: number; tone?: "warning"; label?: string }) {
  if (n == null) return null;
  return (
    <span className={cn("rounded-full px-1.5 text-xs tabular", tone === "warning" ? "bg-warning text-white dark:text-bg" : "bg-surface-3 text-muted")}>
      {n}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  );
}

/** Grid height follows the data, so a few rows never leave a tall empty box. */
function GridFrame({ rows, children }: { rows: number; children: ReactNode }) {
  // toolbar (57) + header (42) + rows (48 each) + a little air
  const h = Math.min(640, Math.max(260, 57 + 42 + rows * 48 + 12));
  return <div style={{ height: h }}>{children}</div>;
}

function DemoAction() {
  const t = useT();
  const { prefill } = useAgent();
  return (
    <Button variant="primary" icon={<Sparkles aria-hidden className="size-4" />} onClick={() => prefill(DEMO_PROMPT)}>
      {t("dash.tryDemo")}
    </Button>
  );
}

function InvoicesPanel() {
  const t = useT();
  const wide = useIsWide();
  const { openInvoice } = useWorkspace();
  const invoices = useInvoices();
  const actions = useActions();
  const contacts = useContactsById();
  const rows = useMemo(() => buildInvoiceRows(invoices.data ?? [], contacts, actions.data ?? []), [invoices.data, contacts, actions.data]);

  if (invoices.isLoading) return <SkeletonRows rows={6} label="Loading invoices" />;
  if (invoices.isError) return <ErrorPanel message={(invoices.error as Error).message} onRetry={() => invoices.refetch()} />;
  if (rows.length === 0)
    return (
      <EmptyState icon={<FileText aria-hidden className="size-5" />} title={t("dash.noInvoices")} action={<DemoAction />}>
        {t("dash.noInvoicesBody")}
      </EmptyState>
    );
  return wide ? (
    <GridFrame rows={rows.length + new Set(rows.map((r) => r.statusLabel)).size + 1}>
      <Suspense fallback={<SkeletonRows rows={6} label="Loading grid" />}>
        <InvoicesGrid rows={rows} onOpen={openInvoice} />
      </Suspense>
    </GridFrame>
  ) : (
    <InvoiceCardList rows={rows} onOpen={openInvoice} />
  );
}

function PayoutsPanel() {
  const t = useT();
  const wide = useIsWide();
  const { openApproval, openInvoice } = useWorkspace();
  const actions = useActions();
  const contacts = useContactsById();
  const invoices = useInvoicesById();
  const rows = useMemo(() => buildActionRows(actions.data ?? [], contacts, invoices), [actions.data, contacts, invoices]);

  if (actions.isLoading) return <SkeletonRows rows={5} label="Loading payouts" />;
  if (actions.isError) return <ErrorPanel message={(actions.error as Error).message} onRetry={() => actions.refetch()} />;
  if (rows.length === 0)
    return (
      <EmptyState icon={<Wallet aria-hidden className="size-5" />} title={t("dash.noPayouts")} action={<DemoAction />}>
        {t("dash.noPayoutsBody")}
      </EmptyState>
    );
  return wide ? (
    <GridFrame rows={rows.length + new Set(rows.map((r) => r.stageLabel)).size + 1}>
      <Suspense fallback={<SkeletonRows rows={5} label="Loading grid" />}>
        <PayoutsGrid rows={rows} onReview={openApproval} onOpenInvoice={openInvoice} />
      </Suspense>
    </GridFrame>
  ) : (
    <ActionCardList rows={rows} onReview={openApproval} onOpenInvoice={openInvoice} />
  );
}

function ActivityPanel() {
  const t = useT();
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
  if (activity.isLoading) return <SkeletonRows rows={6} label="Loading activity" />;
  if (activity.isError) return <ErrorPanel message={(activity.error as Error).message} onRetry={() => activity.refetch()} />;
  if (rows.length === 0)
    return (
      <EmptyState icon={<Activity aria-hidden className="size-5" />} title={t("dash.noActivity")}>
        {t("dash.noActivityBody")}
      </EmptyState>
    );
  return wide ? (
    <GridFrame rows={rows.length}>
      <Suspense fallback={<SkeletonRows rows={6} label="Loading grid" />}>
        <ActivityGrid rows={rows} onOpenEntity={onOpenEntity} />
      </Suspense>
    </GridFrame>
  ) : (
    <ActivityList rows={rows} onOpenEntity={onOpenEntity} />
  );
}

