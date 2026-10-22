import type { QueryClient } from "@tanstack/react-query";
import type { Uuid } from "@/types/api";

/** Dashboard reads go straight to Supabase (RLS: own rows only). Writes go through the FastAPI backend. */
export const qk = {
  invoices: ["invoices"] as const,
  actions: ["actions"] as const,
  contacts: ["contacts"] as const,
  activity: ["activity"] as const,
  profile: ["profile"] as const,
  agentRuns: ["agentRuns"] as const,
  agentRun: (id: Uuid) => ["agentRun", id] as const,
};

// --- cache helpers used by realtime and mutations ------------------------------

type Row = { id: string | number; created_at: string };

/** Insert or replace a row in a list query, keeping newest-first order. Returns the previous row, if any. */
export function upsertInCache<T extends Row>(qc: QueryClient, key: readonly unknown[], row: T): T | undefined {
  let previous: T | undefined;
  qc.setQueryData<T[]>(key, (old) => {
    if (!old) return old; // not loaded yet; the initial fetch will include it
    const idx = old.findIndex((r) => r.id === row.id);
    if (idx >= 0) {
      previous = old[idx];
      const next = old.slice();
      next[idx] = { ...old[idx], ...row };
      return next;
    }
    return [row, ...old].sort((a, b) => b.created_at.localeCompare(a.created_at));
  });
  return previous;
}

export function findInCache<T extends Row>(qc: QueryClient, key: readonly unknown[], id: T["id"]): T | undefined {
  return qc.getQueryData<T[]>(key)?.find((r) => r.id === id);
}
