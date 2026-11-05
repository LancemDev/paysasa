import * as DM from "@radix-ui/react-dropdown-menu";
import { BarChart3, CheckSquare, Compass, LayoutGrid, LogOut, Settings, Sparkles, Users } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { Link, NavLink } from "react-router-dom";
import { cn } from "@/components/ui/cn";
import { useAuth } from "@/auth/AuthProvider";
import { useAgent } from "@/features/agent/AgentProvider";
import { useT, type MsgKey } from "@/lib/i18n";
import { usePendingApprovals, useProfile } from "@/lib/queries";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { AccessibilityMenu, ThemeToggle } from "./DisplayControls";
import { LangSwitch } from "./LangSwitch";
import { Logo } from "./Logo";

const prefetchInsights = () => void import("@/features/insights/InsightsPage");

const NAV: { to: string; key: MsgKey; end?: boolean; icon: typeof LayoutGrid }[] = [
  { to: "/", key: "nav.dashboard", end: true, icon: LayoutGrid },
  { to: "/approvals", key: "nav.approvals", icon: CheckSquare },
  { to: "/payees", key: "nav.payees", icon: Users },
  { to: "/insights", key: "nav.insights", icon: BarChart3 },
];

export function Header() {
  const t = useT();
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const pending = usePendingApprovals().length;
  const name = profile?.display_name ?? user?.email ?? "";
  const [, updateSettings] = useSettings();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:px-6">
        <Link to="/" aria-label={t("nav.home")} className="shrink-0 rounded-lg">
          <span className="sm:hidden">
            <Logo compact />
          </span>
          <span className="hidden sm:inline">
            <Logo />
          </span>
        </Link>
        <nav aria-label="Main" className="ml-6 hidden items-center gap-0.5 md:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              // Start fetching AG Studio as soon as the user shows intent, so Insights opens quickly.
              onMouseEnter={n.to === "/insights" ? prefetchInsights : undefined}
              onFocus={n.to === "/insights" ? prefetchInsights : undefined}
              className={({ isActive }) =>
                cn(
                  "relative inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium transition-colors",
                  isActive ? "bg-surface text-fg shadow-[0_0_0_1px_var(--border)]" : "text-muted hover:text-fg",
                )
              }
            >
              {t(n.key)}
              {n.to === "/approvals" && pending > 0 && <ApprovalCount n={pending} />}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {pending > 0 && (
            <Link
              to="/approvals"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-warning-soft px-3 text-[13px] font-semibold whitespace-nowrap text-warning ring-1 ring-warning/20 ring-inset"
            >
              <span className="pulse-dot size-2 rounded-full bg-warning text-warning" aria-hidden />
              <span className="lg:hidden">{t("approve.short")}</span>
              <span className="sr-only lg:not-sr-only">{t("approve.badge")}</span>
              <ApprovalCount n={pending} />
            </Link>
          )}
          <ConnectionIndicator />
          <span className="hidden sm:contents">
            <LangSwitch />
          </span>
          <ThemeToggle />
          <AccessibilityMenu />
          <AskButton />
          <DM.Root>
            <DM.Trigger className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface p-1 hover:border-border-strong md:pr-3">
              <span aria-hidden className="grid size-7 place-items-center rounded-full bg-forest text-[12px] font-semibold text-lime">
                {name.slice(0, 1).toUpperCase() || "?"}
              </span>
              <span className="sr-only">Menu for </span>
              <span className="sr-only max-w-28 truncate text-[13px] font-medium md:not-sr-only">{name}</span>
            </DM.Trigger>
            <DM.Portal>
              <DM.Content align="end" sideOffset={8} className="pop-in z-50 min-w-56 rounded-2xl border border-border bg-surface p-1.5 shadow-float">
                <DM.Label className="truncate px-2.5 py-2 text-xs text-muted">{user?.email}</DM.Label>
                <div className="px-2.5 pb-2 sm:hidden">
                  <LangSwitch />
                </div>
                <DM.Item asChild>
                  <Link to="/settings" className="flex items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-surface-2">
                    <Settings aria-hidden className="size-4" /> {t("nav.settings")}
                  </Link>
                </DM.Item>
                <DM.Item onSelect={() => updateSettings({ setupDone: false })} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-surface-2">
                  <Compass aria-hidden className="size-4" /> {t("nav.tour")}
                </DM.Item>
                <DM.Separator className="my-1 h-px bg-border" />
                <DM.Item onSelect={() => void signOut()} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-danger outline-none data-[highlighted]:bg-danger-soft">
                  <LogOut aria-hidden className="size-4" /> {t("nav.signOut")}
                </DM.Item>
              </DM.Content>
            </DM.Portal>
          </DM.Root>
        </div>
      </div>
    </header>
  );
}

/** Desktop entry point for the assistant (mobile uses the centre tab). */
function AskButton() {
  const t = useT();
  const { sheetOpen, setSheetOpen, busy } = useAgent();
  return (
    <button
      type="button"
      onClick={() => setSheetOpen(!sheetOpen)}
      aria-expanded={sheetOpen}
      aria-keyshortcuts="Meta+K Control+K"
      data-tour="assistant"
      className="hidden h-9 items-center gap-2 rounded-full bg-forest px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-forest-2 lg:inline-flex dark:bg-lime dark:text-ink-on-lime dark:hover:bg-lime-2"
    >
      <Sparkles aria-hidden className={cn("size-4 text-lime dark:text-ink-on-lime", busy && "animate-pulse")} />
      {busy ? t("agent.working") : t("agent.ask")}
      <kbd aria-hidden className="rounded-md bg-white/10 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-white/70 dark:bg-black/10 dark:text-ink-on-lime/70">
        ⌘K
      </kbd>
    </button>
  );
}

/** Mobile bottom tabs: thumb-reachable navigation with the assistant in the centre. */
export function MobileTabBar() {
  const t = useT();
  const pending = usePendingApprovals().length;
  const { setSheetOpen, busy } = useAgent();
  const tab = "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";
  const left = NAV.slice(0, 2);
  const right = NAV.slice(2);
  const item = (n: (typeof NAV)[number]) => (
    <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn(tab, isActive ? "text-fg" : "text-muted")}>
      {({ isActive }) => (
        <>
          <span className={cn("relative grid h-7 w-12 place-items-center rounded-full transition-colors", isActive && "bg-surface-3")}>
            <n.icon aria-hidden className="size-[18px]" />
            {n.to === "/approvals" && pending > 0 && (
              <span aria-hidden className="absolute -top-0.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] leading-4 font-semibold text-white dark:text-bg">
                {pending}
              </span>
            )}
          </span>
          {t(n.key)}
          {n.to === "/approvals" && pending > 0 && <span className="sr-only"> ({pending} waiting)</span>}
        </>
      )}
    </NavLink>
  );
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div className="flex h-16 items-stretch px-1">
        {left.map(item)}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            data-tour="assistant"
            className="-mt-6 grid size-14 place-items-center rounded-full bg-forest text-lime shadow-float ring-4 ring-bg dark:bg-lime dark:text-ink-on-lime"
          >
            <Sparkles aria-hidden className={cn("size-6", busy && "animate-pulse")} />
            <span className="sr-only">{busy ? t("agent.working") : t("agent.ask")}</span>
          </button>
        </div>
        {right.map(item)}
      </div>
    </nav>
  );
}

function ApprovalCount({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-warning px-1.5 text-xs text-white tabular dark:text-bg">
      {n}
      <span className="sr-only"> waiting for approval</span>
    </span>
  );
}

