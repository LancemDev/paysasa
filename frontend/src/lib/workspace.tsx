import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

/** Drawer and approval modal state lives in the URL (?invoice=…, ?approve=…), so it's deep-linkable. */
interface Workspace {
  invoiceId: string | null;
  approveId: string | null;
  openInvoice: (id: string) => void;
  openApproval: (id: string) => void;
  closeInvoice: () => void;
  closeApproval: () => void;
}

const Ctx = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: false },
      ),
    [setParams],
  );
  const value = useMemo<Workspace>(
    () => ({
      invoiceId: params.get("invoice"),
      approveId: params.get("approve"),
      openInvoice: (id) => set("invoice", id),
      openApproval: (id) => set("approve", id),
      closeInvoice: () => set("invoice", null),
      closeApproval: () => set("approve", null),
    }),
    [params, set],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Workspace {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
