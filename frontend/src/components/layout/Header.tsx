import * as DM from "@radix-ui/react-dropdown-menu";
import { LogOut, Menu, Settings } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { cn } from "@/components/ui/cn";
import { useAuth } from "@/auth/AuthProvider";
import { usePendingApprovals, useProfile } from "@/lib/queries";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { Logo } from "./Logo";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/approvals", label: "Approvals" },
  { to: "/payees", label: "Payees" },
  { to: "/settings", label: "Settings" },
];

export function Header() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const pending = usePendingApprovals().length;
  const name = profile?.display_name ?? user?.email ?? "";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4">
      <Link to="/" aria-label="PaySasa AI home" className="shrink-0 rounded">
        <span className="sm:hidden">
          <Logo compact />
        </span>
        <span className="hidden sm:inline">
          <Logo />
        </span>
      </Link>
      <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => cn("inline-flex h-9 items-center gap-2 rounded-[var(--radius-input)] px-3 font-medium", isActive ? "bg-surface-2 text-fg" : "text-muted hover:text-fg")}
          >
            {n.label}
            {n.to === "/approvals" && pending > 0 && <ApprovalCount n={pending} />}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {pending > 0 && (
          <Link to="/approvals" className="inline-flex h-9 items-center gap-2 rounded-full bg-warning-soft px-3 text-[13px] font-semibold whitespace-nowrap text-warning">
            <span className="size-2 rounded-full bg-warning" aria-hidden />
            <span className="hidden sm:inline">Needs your approval</span>
            <span className="sm:hidden">Approve</span>
            <ApprovalCount n={pending} />
          </Link>
        )}
        <ConnectionIndicator />
        <DM.Root>
          <DM.Trigger className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-1.5 hover:bg-surface-2 md:pr-3">
            <span aria-hidden className="grid size-7 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
              {name.slice(0, 1).toUpperCase() || "?"}
            </span>
            <span className="sr-only">Menu for </span>
            <span className="sr-only max-w-32 truncate text-[13px] md:not-sr-only">{name}</span>
            <Menu aria-hidden className="size-4 md:hidden" />
          </DM.Trigger>
          <DM.Portal>
            <DM.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-2">
              <DM.Label className="truncate px-2 py-1.5 text-xs text-muted">{user?.email}</DM.Label>
              <div className="md:hidden">
                {NAV.map((n) => (
                  <DM.Item key={n.to} asChild>
                    <Link to={n.to} className="flex items-center justify-between rounded px-2 py-2 outline-none data-[highlighted]:bg-surface-2">
                      {n.label}
                      {n.to === "/approvals" && pending > 0 && <ApprovalCount n={pending} />}
                    </Link>
                  </DM.Item>
                ))}
                <DM.Separator className="my-1 h-px bg-border" />
              </div>
              <DM.Item asChild>
                <Link to="/settings" className="hidden items-center gap-2 rounded px-2 py-2 outline-none data-[highlighted]:bg-surface-2 md:flex">
                  <Settings aria-hidden className="size-4" /> Settings
                </Link>
              </DM.Item>
              <DM.Item onSelect={() => void signOut()} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-danger outline-none data-[highlighted]:bg-danger-soft">
                <LogOut aria-hidden className="size-4" /> Sign out
              </DM.Item>
            </DM.Content>
          </DM.Portal>
        </DM.Root>
      </div>
    </header>
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
