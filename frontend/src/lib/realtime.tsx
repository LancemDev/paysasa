import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ActivityLogEntry, Contact, Invoice, PendingAction, RealtimeTable } from "@/types/api";
import { useAuth } from "@/auth/AuthProvider";
import { qk, upsertInCache } from "./queryKeys";
import { supabase } from "./supabase";

export type ConnectionStatus = "connecting" | "live" | "polling" | "offline";

export type RealtimeEvent =
  | { table: "invoices"; row: Invoice; previous?: Invoice }
  | { table: "pending_actions"; row: PendingAction; previous?: PendingAction }
  | { table: "contacts"; row: Contact; previous?: Contact }
  | { table: "activity_log"; row: ActivityLogEntry; previous?: undefined };

type Listener = (e: RealtimeEvent) => void;

interface Ctx {
  status: ConnectionStatus;
  subscribe: (fn: Listener) => () => void;
}

const RealtimeContext = createContext<Ctx>({ status: "connecting", subscribe: () => () => {} });

export const POLL_MS = 15_000;

const KEY_BY_TABLE: Record<RealtimeTable, readonly unknown[]> = {
  invoices: qk.invoices,
  pending_actions: qk.actions,
  contacts: qk.contacts,
  activity_log: qk.activity,
};

/**
 * One Supabase Realtime channel for the four published tables. Changes are written into the TanStack Query
 * cache (so grids update in place) and fanned out to listeners (toasts, the agent's live step trace).
 * If the channel can't connect, queries fall back to polling every 15s.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listeners = useRef(new Set<Listener>());
  const [channelStatus, setChannelStatus] = useState<ConnectionStatus>("connecting");
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setChannelStatus("connecting");
    let wasLive = false;
    const channel = supabase.channel(`paysasa-${user.id}`);
    (Object.keys(KEY_BY_TABLE) as RealtimeTable[]).forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `owner_id=eq.${user.id}` },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (payload.eventType === "DELETE") return; // the backend never deletes these rows
          const row = payload.new as never;
          const previous = upsertInCache(qc, KEY_BY_TABLE[table], row);
          const event = { table, row, previous } as RealtimeEvent;
          listeners.current.forEach((fn) => fn(event));
        },
      );
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setChannelStatus("live");
        // Catch anything that changed while we were disconnected.
        if (wasLive) qc.invalidateQueries();
        wasLive = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setChannelStatus("polling");
      }
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const status: ConnectionStatus = !online ? "offline" : channelStatus;
  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);
  const value = useMemo<Ctx>(() => ({ status, subscribe }), [status, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export const useConnectionStatus = () => useContext(RealtimeContext).status;

/** Poll only when realtime is not live. */
export function usePollInterval(): number | false {
  const status = useConnectionStatus();
  return status === "live" ? false : POLL_MS;
}

export function useRealtimeEvents(fn: Listener) {
  const { subscribe } = useContext(RealtimeContext);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
