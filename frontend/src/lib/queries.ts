import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ActivityLogEntry, AgentRun, Contact, Invoice, PendingAction, Profile, Uuid } from "@/types/api";
import { useAuth } from "@/auth/AuthProvider";
import { usePollInterval } from "./realtime";
import { supabase } from "./supabase";

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

export class ReadError extends Error {
  constructor(what: string) {
    super(`We couldn't load your ${what}. Check your connection and try again.`);
    this.name = "ReadError";
  }
}

async function read<T>(what: string, run: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await run();
  if (error) throw new ReadError(what);
  return data as T;
}

export const fetchers = {
  invoices: () =>
    read<Invoice[]>("invoices", () => supabase.from("invoices").select("*").order("created_at", { ascending: false }).limit(500)),
  actions: () =>
    read<PendingAction[]>("payouts", () =>
      supabase.from("pending_actions").select("*").order("created_at", { ascending: false }).limit(500),
    ),
  contacts: () => read<Contact[]>("contacts", () => supabase.from("contacts").select("*").order("name")),
  activity: () =>
    read<ActivityLogEntry[]>("activity", () =>
      supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(300),
    ),
  profile: (userId: Uuid) =>
    read<Profile | null>("profile", () => supabase.from("profiles").select("*").eq("id", userId).maybeSingle()),
  agentRuns: () =>
    read<AgentRun[]>("conversation", () =>
      supabase.from("agent_runs").select("*").order("created_at", { ascending: false }).limit(15),
    ),
  agentRun: (id: Uuid) =>
    read<AgentRun | null>("assistant run", () => supabase.from("agent_runs").select("*").eq("id", id).maybeSingle()),
};

function useLive<T>(key: readonly unknown[], fn: () => Promise<T>, enabled = true) {
  const refetchInterval = usePollInterval();
  const { user } = useAuth();
  return useQuery({ queryKey: key, queryFn: fn, enabled: enabled && !!user, refetchInterval });
}

export const useInvoices = () => useLive(qk.invoices, fetchers.invoices);
export const useActions = () => useLive(qk.actions, fetchers.actions);
export const useContacts = () => useLive(qk.contacts, fetchers.contacts);
export const useActivity = () => useLive(qk.activity, fetchers.activity);

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.profile,
    queryFn: () => fetchers.profile(user!.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}

export function useAgentRun(id: Uuid | null | undefined) {
  return useQuery({
    queryKey: qk.agentRun(id ?? ""),
    queryFn: () => fetchers.agentRun(id!),
    enabled: !!id,
    staleTime: Infinity,
  });
}

export function useContactsById() {
  const { data } = useContacts();
  return useMemo(() => new Map((data ?? []).map((c) => [c.id, c])), [data]);
}

export function useInvoicesById() {
  const { data } = useInvoices();
  return useMemo(() => new Map((data ?? []).map((i) => [i.id, i])), [data]);
}

export function usePendingApprovals() {
  const { data } = useActions();
  return useMemo(
    () =>
      (data ?? [])
        .filter((a) => a.status === "awaiting_approval")
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [data],
  );
}

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
