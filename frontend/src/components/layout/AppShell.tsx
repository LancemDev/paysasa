import * as RD from "@radix-ui/react-dialog";
import { Sparkles } from "lucide-react";
import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { AgentPanel } from "@/features/agent/AgentPanel";
import { AgentProvider, useAgent } from "@/features/agent/AgentProvider";
import { ApprovalModal } from "@/features/approvals/ApprovalModal";
import { InvoiceDrawer } from "@/features/dashboard/InvoiceDrawer";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { RealtimeProvider } from "@/lib/realtime";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { Header } from "./Header";
import { ModeBanner } from "./ModeBanner";
import { RealtimeToasts } from "./RealtimeToasts";

/** Signed-in layout: dashboard in the main area, persistent agent panel on the right (desktop) or a sheet (mobile). */
export function AppShell() {
  return (
    <RealtimeProvider>
      <WorkspaceProvider>
        <AgentProvider>
          <Shell />
        </AgentProvider>
      </WorkspaceProvider>
    </RealtimeProvider>
  );
}

function Shell() {
  const desktop = useIsDesktop();
  const { approveId, closeApproval, openInvoice } = useWorkspace();
  return (
    <div className="flex h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded bg-surface p-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to main content
      </a>
      <ModeBanner />
      <Header />
      <div className="flex min-h-0 flex-1">
        <main id="main" className="min-w-0 flex-1 overflow-y-auto pb-24 lg:pb-0">
          <ErrorBoundary region="page">
            <Outlet />
          </ErrorBoundary>
        </main>
        {desktop && (
          <aside className="flex w-[400px] shrink-0 border-l border-border xl:w-[440px]">
            <ErrorBoundary region="assistant" className="m-4 h-fit rounded-[var(--radius-card)] border border-border bg-surface p-6">
              <div className="flex min-w-0 flex-1">
                <div className="w-full">
                  <AgentPanel />
                </div>
              </div>
            </ErrorBoundary>
          </aside>
        )}
      </div>
      {!desktop && <MobileAgent />}
      <ErrorBoundary region="invoice details" className="hidden">
        <InvoiceDrawer />
      </ErrorBoundary>
      <ErrorBoundary region="approval" className="hidden">
        <ApprovalModal actionId={approveId} onClose={closeApproval} onOpenInvoice={(id) => {
          closeApproval();
          openInvoice(id);
        }} />
      </ErrorBoundary>
      <RealtimeToasts />
    </div>
  );
}

function MobileAgent() {
  const { sheetOpen, setSheetOpen, busy } = useAgent();
  return (
    <RD.Root open={sheetOpen} onOpenChange={setSheetOpen}>
      <RD.Trigger asChild>
        <button
          type="button"
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 flex h-12 items-center justify-center gap-2 rounded-full bg-accent font-semibold text-accent-fg shadow-2 sm:left-auto sm:px-6"
        >
          <Sparkles aria-hidden className={busy ? "size-5 animate-pulse" : "size-5"} />
          {busy ? "PaySasa is working…" : "Ask PaySasa"}
        </button>
      </RD.Trigger>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <RD.Content aria-describedby={undefined} className="animate-in fixed inset-0 z-50 flex flex-col bg-surface pt-[env(safe-area-inset-top)]">
          <RD.Title className="sr-only">Ask PaySasa</RD.Title>
          <ErrorBoundary region="assistant">
            <AgentPanel onClose={() => setSheetOpen(false)} />
          </ErrorBoundary>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
