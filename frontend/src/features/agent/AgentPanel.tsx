import { ArrowUp, ChevronDown, ChevronRight, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { DEMO_PROMPT, SUGGESTED_PROMPTS, actionCardsFromToolCalls } from "@/lib/agent";
import { useT } from "@/lib/i18n";
import { useConnectionStatus } from "@/lib/realtime";
import { LogoMark } from "@/components/layout/Logo";
import { VoiceButton } from "@/components/ui/VoiceButton";
import { ActionCards } from "./ActionCards";
import { AssistantText } from "./AssistantText";
import { useAgent, type AssistantMessage, type ChatMessage } from "./AgentProvider";
import { StepTrace } from "./StepTrace";

const MAX_CHARS = 2000;

export function AgentPanel({ onClose }: { onClose?: () => void }) {
  const t = useT();
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
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="relative">
          <LogoMark className="size-8" />
          <span aria-hidden className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface", busy ? "pulse-dot bg-lime-2 text-lime-2" : "bg-success")} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] leading-tight font-semibold">{t("agent.title")}</h2>
          <p className="truncate text-xs text-muted">{busy ? t("agent.working") : t("agent.subtitle")}</p>
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
  const t = useT();
  const { prefill, send, busy } = useAgent();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="display text-[26px]">{t("agent.hello")}</p>
        <p className="mt-2 text-muted">{t("agent.helloBody")}</p>
      </div>
      <div>
        <p className="eyebrow mb-2">{t("agent.tryDemo")}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send(DEMO_PROMPT)}
          className="group w-full rounded-2xl bg-forest p-4 text-left text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60 grain relative overflow-hidden"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-lime">
            <Sparkles aria-hidden className="size-3.5" /> {t("agent.kwame")}
          </span>
          <span className="mt-1.5 block text-[13.5px] leading-relaxed text-white/90">“{DEMO_PROMPT}”</span>
          <span aria-hidden className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-white/60 group-hover:text-white">
            {t("agent.send")} →
          </span>
        </button>
      </div>
      <div>
        <p className="eyebrow mb-2">{t("agent.orStart")}</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <Chip key={p.label} onClick={() => prefill(p.prompt)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </div>
      <p className="text-xs text-subtle">{t("agent.shortcut")}</p>
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-forest px-3.5 py-2.5 break-words whitespace-pre-wrap text-white dark:bg-surface-3 dark:text-fg">
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
        <div className="mb-2 rounded-2xl border border-border bg-bg px-3 py-2.5">
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
            "w-fit max-w-[95%] rounded-2xl rounded-bl-md px-3.5 py-2.5 break-words",
            message.status === "error" ? "border border-danger/30 bg-danger-soft" : message.status === "stopped" ? "bg-warning-soft" : "bg-surface-2",
          )}
          role={message.status === "error" ? "alert" : undefined}
        >
          <AssistantText text={message.text} />
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
  const t = useT();
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
      <div className="ask-ring flex items-end gap-2 rounded-[22px]! p-1.5 pl-2" data-busy={busy}>
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
          placeholder={placeholder ?? t("agent.placeholder")}
          aria-invalid={over}
          aria-describedby={over ? "agent-input-err" : undefined}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 outline-none focus-visible:outline-none"
        />
        {!busy && <VoiceButton size="sm" onText={(x) => setDraft(draft ? `${draft} ${x}` : x)} />}
        {busy ? (
          <IconButton label="Stop waiting for PaySasa" variant="secondary" size="sm" onClick={stop} icon={<Square aria-hidden className="size-3.5 fill-current" />} />
        ) : (
          <IconButton
            label="Send message"
            type="submit"
            variant="primary"
            size="sm"
            className="rounded-full!"
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
      className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-fg/40 hover:bg-surface-2"
    >
      {children}
    </button>
  );
}
