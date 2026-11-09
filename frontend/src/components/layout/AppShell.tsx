import * as RD from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { AgentPanel } from "@/features/agent/AgentPanel";
import { AgentProvider, useAgent } from "@/features/agent/AgentProvider";
import { ApprovalModal } from "@/features/approvals/ApprovalModal";
import { InvoiceDrawer } from "@/features/dashboard/InvoiceDrawer";
import { Tour } from "@/features/onboarding/Tour";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useT } from "@/lib/i18n";
import { RealtimeProvider } from "@/lib/realtime";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { Header, MobileTabBar } from "./Header";
import { RealtimeToasts } from "./RealtimeToasts";

/**
 * Signed-in layout. The dashboard gets the full width; the assistant is one keystroke (⌘K) or one tap away,
 * as a floating panel on desktop and a full-screen sheet on mobile. It never takes space while unused.
 */
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
  const t = useT();
  const desktop = useIsDesktop();
  const { approveId, closeApproval, openInvoice } = useWorkspace();
  const { sheetOpen, setSheetOpen } = useAgent();

  // ⌘K / Ctrl+K toggles the assistant from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSheetOpen(!sheetOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, setSheetOpen]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded bg-surface p-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t("nav.skip")}
      </a>
      <Header />
      <main id="main" className="min-w-0 flex-1 pb-28 md:pb-10">
        <ErrorBoundary region="page">
          <Outlet />
        </ErrorBoundary>
      </main>
      {desktop ? <DesktopAgent /> : <MobileAgent />}
      {!desktop && <MobileTabBar />}
      <Tour />
      <ErrorBoundary region="invoice details" className="hidden">
        <InvoiceDrawer />
      </ErrorBoundary>
      <ErrorBoundary region="approval" className="hidden">
        <ApprovalModal
          actionId={approveId}
          onClose={closeApproval}
          onOpenInvoice={(id) => {
            closeApproval();
            openInvoice(id);
          }}
        />
      </ErrorBoundary>
      <RealtimeToasts />
    </div>
  );
}

/** Floating, non-modal panel: you can keep using the dashboard (and watch it update) while the assistant works. */
function DesktopAgent() {
  const { sheetOpen, setSheetOpen } = useAgent();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sheetOpen) return;
    const id = requestAnimationFrame(() => ref.current?.querySelector<HTMLTextAreaElement>("#agent-input")?.focus());
    return () => cancelAnimationFrame(id);
  }, [sheetOpen]);
  return (
    <AnimatePresence>
      {sheetOpen && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, x: 24, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 24, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          onKeyDown={(e) => e.key === "Escape" && setSheetOpen(false)}
          className="fixed top-[5.5rem] right-4 bottom-4 z-40 flex w-[420px] flex-col overflow-hidden rounded-[var(--radius-sheet)] border border-border bg-surface shadow-float"
        >
          <ErrorBoundary region="assistant">
            <AgentPanel onClose={() => setSheetOpen(false)} />
          </ErrorBoundary>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MobileAgent() {
  const { sheetOpen, setSheetOpen } = useAgent();
  return (
    <RD.Root open={sheetOpen} onOpenChange={setSheetOpen}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <RD.Content aria-describedby={undefined} className="slide-in-right fixed inset-0 z-50 flex flex-col bg-surface pt-[env(safe-area-inset-top)]">
          <RD.Title className="sr-only">Ask PaySasa</RD.Title>
          <ErrorBoundary region="assistant">
            <AgentPanel onClose={() => setSheetOpen(false)} />
          </ErrorBoundary>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
