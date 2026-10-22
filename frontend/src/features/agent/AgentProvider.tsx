import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentRun, ToolCallLog } from "@/types/api";
import { ApiError, api } from "@/lib/api";
import { detectClarification, stepFromToolCall, stepsFromToolCalls, type AgentStep, type Clarification } from "@/lib/agent";
import { fetchers, qk } from "@/lib/queries";
import { useConnectionStatus, useRealtimeEvents } from "@/lib/realtime";

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  status: "thinking" | "done" | "error" | "stopped";
  text?: string;
  runId?: string;
  toolCalls: ToolCallLog[];
  steps: AgentStep[];
  clarification?: Clarification | null;
  /** For error/stopped messages: the prompt to resend. */
  retryText?: string;
}

export type ChatMessage = UserMessage | AssistantMessage;

interface AgentCtx {
  messages: ChatMessage[];
  historyLoading: boolean;
  busy: boolean;
  draft: string;
  setDraft: (text: string) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  retry: (messageId: string) => void;
  /** Mobile: the agent is a full-screen sheet. */
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  /** Put text in the composer (and open the sheet on mobile). */
  prefill: (text: string) => void;
  focusToken: number;
}

const Ctx = createContext<AgentCtx | null>(null);
let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

function fromRun(run: AgentRun): ChatMessage[] {
  const user: UserMessage = { id: `${run.id}-u`, role: "user", text: run.user_message };
  const calls = Array.isArray(run.tool_calls) ? run.tool_calls : [];
  const assistant: AssistantMessage = {
    id: `${run.id}-a`,
    role: "assistant",
    runId: run.id,
    status: run.status === "failed" ? "error" : run.status === "running" ? "stopped" : "done",
    text:
      run.status === "failed"
        ? "PaySasa couldn't finish this request."
        : run.status === "running"
          ? "This request was still running when you left. Check the dashboard for results."
          : (run.reply ?? ""),
    toolCalls: calls,
    steps: stepsFromToolCalls(calls),
    clarification: null,
  };
  return [user, assistant];
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const connection = useConnectionStatus();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<{ assistantId: string; runId: string | null; known: Set<string> } | null>(null);
  const [busy, setBusy] = useState(false);

  const history = useQuery({ queryKey: qk.agentRuns, queryFn: fetchers.agentRuns, staleTime: Infinity, retry: 1 });
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !history.data) return;
    hydrated.current = true;
    const restored = [...history.data].reverse().flatMap(fromRun);
    // Only the most recent reply can still be an open question.
    const last = restored[restored.length - 1];
    if (last?.role === "assistant" && last.status === "done") last.clarification = detectClarification(last.text ?? "", last.toolCalls);
    setMessages((cur) => [...restored, ...cur]);
  }, [history.data]);

  const patch = useCallback((id: string, fn: (m: AssistantMessage) => AssistantMessage) => {
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === "assistant" ? fn(m) : m)));
  }, []);

  // Live step trace: the backend logs each tool call to activity_log while the request is still running.
  useRealtimeEvents((e) => {
    const p = pendingRef.current;
    if (!p || e.table !== "activity_log") return;
    const row = e.row;
    if (row.actor !== "agent" || !row.event.startsWith("agent.") || row.entity_type !== "agent_run" || !row.entity_id) return;
    if (p.known.has(row.entity_id)) return;
    if (p.runId && p.runId !== row.entity_id) return;
    p.runId = row.entity_id;
    const d = row.details as { tool?: string; args?: Record<string, unknown>; result?: unknown };
    patch(p.assistantId, (m) => ({
      ...m,
      steps: [...m.steps, stepFromToolCall({ name: d.tool ?? row.event.slice(6), args: d.args ?? {}, result: (d.result ?? {}) as never }, m.steps.length)],
    }));
  });

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || pendingRef.current) return;
      const assistantId = nextId();
      setMessages((ms) => [
        ...ms.map((m) => (m.role === "assistant" && m.clarification ? { ...m, clarification: null } : m)),
        { id: nextId(), role: "user", text },
        { id: assistantId, role: "assistant", status: "thinking", toolCalls: [], steps: [] },
      ]);
      setDraft("");
      setBusy(true);
      const known = new Set(
        messages.flatMap((m) => (m.role === "assistant" && m.runId ? [m.runId] : [])),
      );
      pendingRef.current = { assistantId, runId: null, known };
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await api.sendAgentMessage(text, controller.signal);
        let calls: ToolCallLog[] | null = null;
        try {
          const run = await fetchers.agentRun(res.run_id);
          calls = run?.tool_calls ?? null;
        } catch {
          calls = null; // keep the live steps we already have
        }
        patch(assistantId, (m) => {
          const toolCalls = calls ?? m.toolCalls;
          return {
            ...m,
            status: "done",
            text: res.reply,
            runId: res.run_id,
            toolCalls,
            steps: calls ? stepsFromToolCalls(calls) : m.steps,
            clarification: detectClarification(res.reply, toolCalls),
          };
        });
        if (connection !== "live") {
          void qc.invalidateQueries({ queryKey: qk.invoices });
          void qc.invalidateQueries({ queryKey: qk.actions });
          void qc.invalidateQueries({ queryKey: qk.contacts });
          void qc.invalidateQueries({ queryKey: qk.activity });
        }
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError({ kind: "network" });
        if (err.kind === "aborted") {
          patch(assistantId, (m) => ({
            ...m,
            status: "stopped",
            text: "Stopped waiting. PaySasa may still finish this in the background, so check the dashboard before asking again.",
            retryText: text,
          }));
        } else {
          patch(assistantId, (m) => ({ ...m, status: "error", text: err.friendly, retryText: text }));
          setDraft((d) => d || text); // preserve the user's input
        }
        void qc.invalidateQueries({ queryKey: qk.invoices });
        void qc.invalidateQueries({ queryKey: qk.actions });
      } finally {
        pendingRef.current = null;
        abortRef.current = null;
        setBusy(false);
      }
    },
    [messages, patch, qc, connection],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(
    (messageId: string) => {
      const m = messages.find((x) => x.id === messageId);
      if (m?.role === "assistant" && m.retryText) {
        setDraft("");
        void send(m.retryText);
      }
    },
    [messages, send],
  );

  const prefill = useCallback((text: string) => {
    setDraft(text);
    setSheetOpen(true);
    setFocusToken((t) => t + 1);
  }, []);

  const value = useMemo<AgentCtx>(
    () => ({
      messages,
      historyLoading: history.isLoading,
      busy,
      draft,
      setDraft,
      send,
      stop,
      retry,
      sheetOpen,
      setSheetOpen,
      prefill,
      focusToken,
    }),
    [messages, history.isLoading, busy, draft, send, stop, retry, sheetOpen, prefill, focusToken],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgent(): AgentCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAgent must be used inside AgentProvider");
  return ctx;
}
