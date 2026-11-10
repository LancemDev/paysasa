import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER, makeInvoice } from "@/test/utils";
import { tables } from "@/test/supabaseMock";
import { useInvoices } from "./queries";

vi.mock("@/lib/supabase", async () => ({ supabase: (await import("@/test/supabaseMock")).supabaseMock }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: OWNER } }) }));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useInvoices", () => {
  beforeEach(() => {
    for (const key of Object.keys(tables)) delete tables[key];
  });

  it("shows USD rows in the profile's currency and keeps the original amount", async () => {
    tables.profiles = [{ id: OWNER, display_name: "Kwame", default_currency: "KES", created_at: "2026-01-01T00:00:00Z" }];
    tables.invoices = [makeInvoice()];

    const { result } = renderHook(() => useInvoices(), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.currency).toBe("KES"));
    expect(result.current.data?.[0]).toMatchObject({
      amount_minor: 15516000, // $1,200.00 at 129.3 KES/USD
      currency: "KES",
      source_amount_minor: 120000,
      source_currency: "USD",
    });
  });

  it("leaves rows in their own currency when the profile uses it", async () => {
    tables.profiles = [{ id: OWNER, display_name: "Kwame", default_currency: "USD", created_at: "2026-01-01T00:00:00Z" }];
    tables.invoices = [makeInvoice()];

    const { result } = renderHook(() => useInvoices(), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.currency).toBe("USD"));
    expect(result.current.data?.[0]).toMatchObject({ amount_minor: 120000 });
  });
});
