import { ArrowUp, ChevronDown, ChevronRight, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { DEMO_PROMPT, SUGGESTED_PROMPTS, actionCardsFromToolCalls } from "@/lib/agent";
import { useConnectionStatus } from "@/lib/realtime";
import { ActionCards } from "./ActionCards";
import { useAgent, type AssistantMessage, type ChatMessage } from "./AgentProvider";
import { StepTrace } from "./StepTrace";

const MAX_CHARS = 2000;

export function AgentPanel({ onClose }: { onClose?: () => void }) {
  const { messages, historyLoading, busy } = useAgent();
  const listRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  const clarification = last?.role === "assistant" ? last.clarification : null;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <section aria-label="PaySasa assistant" className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-accent-soft text-accent">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-tight">Ask PaySasa</h2>
          <p className="text-xs text-muted">Invoices, follow-ups and payouts. You approve every payment.</p>
        </div>
        {onClose && <IconButton label="Close assistant" onClick={onClose} icon={<X aria-hidden className="size-5" />} />}
      </header>

      <div ref={listRef} role="log" aria-live="polite" aria-relevant="additions text" aria-busy={busy} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {historyLoading && messages.length === 0 ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading conversation">
            <Skeleton className="ml-auto h-10 w-3/4" />
            <Skeleton className="h-16 w-5/6" />
          </div>
        ) : messages.length === 0 ? (
          <Welcome />
        ) : (
          <ol className="flex flex-col gap-4">
            {messages.map((m) => (
              <li key={m.id}>
                <Message message={m} />
              </li>
            ))}
          </ol>
        )}
      </div>

      <Composer clarificationOptions={clarification?.options ?? []} placeholder={clarification?.placeholder} />
    </section>
  );
}

function Welcome() {
  const { prefill, send, busy } = useAgent();
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--radius-card)] bg-surface-2 p-4">
        <p className="font-medium">Hi! Tell me what you need in plain words.</p>
        <p className="mt-1 text-muted">
          I can send PayPal invoices, check who hasn't paid, and set up payouts to your collaborators. Payouts always wait for your approval.
        </p>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Try the demo</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send(DEMO_PROMPT)}
          className="w-full rounded-[var(--radius-card)] border border-accent/40 bg-accent-soft p-3 text-left transition-colors hover:border-accent disabled:opacity-60"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-accent">
            <Sparkles aria-hidden className="size-3.5" /> Kwame's request (one tap)
          </span>
          <span className="mt-1 block text-[13px]">“{DEMO_PROMPT}”</span>
        </button>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Or start with</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <Chip key={p.label} onClick={() => prefill(p.prompt)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="ml-auto w-fit max-w-[88%] rounded-[var(--radius-card)] rounded-br-sm bg-accent px-3 py-2 break-words whitespace-pre-wrap text-accent-fg">
        <span className="sr-only">You said: </span>
        {message.text}
      </div>
    );
  }
  return <AssistantBubble message={message} />;
}

function AssistantBubble({ message }: { message: AssistantMessage }) {
  const { retry, busy } = useAgent();
  const cards = useMemo(() => actionCardsFromToolCalls(message.toolCalls), [message.toolCalls]);
  const running = message.status === "thinking";
  const [showSteps, setShowSteps] = useState(true);
  const hasSteps = running || message.steps.length > 0;

  return (
    <div className="max-w-full">
      <span className="sr-only">PaySasa: </span>
      {hasSteps && (
        <div className="mb-2 rounded-[var(--radius-card)] border border-border bg-bg/60 px-3 py-2">
          <button
            type="button"
            className="mb-1 flex items-center gap-1 text-xs font-semibold tracking-wide text-muted uppercase"
            aria-expanded={showSteps}
            onClick={() => setShowSteps((s) => !s)}
          >
            {showSteps ? <ChevronDown aria-hidden className="size-3.5" /> : <ChevronRight aria-hidden className="size-3.5" />}
            {running ? "Working on it" : `Steps (${message.steps.length})`}
          </button>
          {showSteps && <StepTrace steps={message.steps} running={running} />}
        </div>
      )}
      {message.text && (
        <div
          className={cn(
            "w-fit max-w-[95%] rounded-[var(--radius-card)] rounded-bl-sm px-3 py-2 break-words whitespace-pre-wrap",
            message.status === "error" ? "border border-danger/30 bg-danger-soft" : message.status === "stopped" ? "bg-warning-soft" : "bg-surface-2",
          )}
          role={message.status === "error" ? "alert" : undefined}
        >
          {message.text}
        </div>
      )}
      {(message.status === "error" || message.status === "stopped") && message.retryText && (
        <Button size="sm" variant="ghost" className="mt-1" disabled={busy} onClick={() => retry(message.id)} icon={<RotateCcw aria-hidden className="size-3.5" />}>
          Try again
        </Button>
      )}
      <ActionCards cards={cards} />
    </div>
  );
}

function Composer({ clarificationOptions, placeholder }: { clarificationOptions: string[]; placeholder?: string }) {
  const { draft, setDraft, send, stop, busy, focusToken } = useAgent();
  const status = useConnectionStatus();
  const offline = status === "offline";
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusToken > 0) {
      const el = ref.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [focusToken]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const submit = () => {
    if (busy || offline || !draft.trim() || draft.length > MAX_CHARS) return;
    void send(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  const over = draft.length > MAX_CHARS;

  return (
    <form
      className="shrink-0 border-t border-border bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {clarificationOptions.length > 0 && !busy && (
        <div className="mb-2 flex flex-wrap gap-2" aria-label="Quick replies">
          {clarificationOptions.map((o) => (
            <Chip key={o} onClick={() => void send(o)}>
              {o}
            </Chip>
          ))}
        </div>
      )}
      {offline && <p className="mb-2 text-[13px] text-warning">You're offline. Your message will be kept until you reconnect.</p>}
      <div className="flex items-end gap-2 rounded-[var(--radius-card)] border border-border-strong bg-surface p-1.5 focus-within:border-accent">
        <label htmlFor="agent-input" className="sr-only">
          Message PaySasa
        </label>
        <textarea
          id="agent-input"
          ref={ref}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? "e.g. Invoice Amina £300 for the logo refresh"}
          aria-invalid={over}
          aria-describedby={over ? "agent-input-err" : undefined}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 outline-none focus-visible:outline-none"
        />
        {busy ? (
          <IconButton label="Stop waiting for PaySasa" variant="secondary" size="sm" onClick={stop} icon={<Square aria-hidden className="size-3.5 fill-current" />} />
        ) : (
          <IconButton
            label="Send message"
            type="submit"
            variant="primary"
            size="sm"
            disabled={!draft.trim() || over || offline}
            icon={<ArrowUp aria-hidden className="size-4" />}
          />
        )}
      </div>
      {over && (
        <p id="agent-input-err" className="mt-1 text-[13px] text-danger">
          Messages can be up to {MAX_CHARS.toLocaleString()} characters ({draft.length.toLocaleString()} now).
        </p>
      )}
    </form>
  );
}

function Chip({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border-strong bg-surface px-3 py-1 text-[13px] font-medium transition-colors hover:border-accent hover:text-accent"
    >
      {children}
    </button>
  );
}
