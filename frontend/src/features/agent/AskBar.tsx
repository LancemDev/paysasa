import { ArrowUp, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { cn } from "@/components/ui/cn";
import { DEMO_PROMPT } from "@/lib/agent";
import { useT } from "@/lib/i18n";
import { useAgent } from "./AgentProvider";

/**
 * The fastest way to act: type a request where you already are. It sends to the same agent and opens the
 * assistant so you can watch the steps. The ring sweeps only while PaySasa is working.
 */
export function AskBar({ className }: { className?: string }) {
  const t = useT();
  const { send, busy, setSheetOpen, prefill } = useAgent();
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    setSheetOpen(true);
    void send(v);
    setText("");
  };
  return (
    <div className={cn("flex flex-col gap-2.5", className)} data-tour="ask">
      <form onSubmit={submit} className="ask-ring flex h-14 items-center gap-2 pr-1.5 pl-4 shadow-1" data-busy={busy}>
        <Sparkles aria-hidden className={cn("size-5 shrink-0 text-forest-3 dark:text-lime", busy && "animate-pulse")} />
        <label htmlFor="ask-bar" className="sr-only">
          {t("agent.ask")}
        </label>
        <input
          id="ask-bar"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("agent.barPlaceholder")}
          maxLength={2000}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle focus-visible:outline-none"
        />
        <kbd aria-hidden className="hidden rounded-md border border-border px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-subtle sm:block">
          ⌘K
        </kbd>
        <button
          type="submit"
          disabled={!text.trim() || busy}
          aria-label={t("agent.send")}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-ink-on-lime transition-[transform,opacity] hover:bg-lime-2 active:scale-95 disabled:opacity-40"
        >
          <ArrowUp aria-hidden className="size-5" strokeWidth={2.4} />
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => prefill(DEMO_PROMPT)}
          className="rounded-full bg-forest px-3 py-1 text-[12.5px] font-medium text-lime transition-colors hover:bg-forest-2"
        >
          {t("agent.kwame")}
        </button>
        {(
          [
            ["chip.unpaid", "chip.unpaidPrompt"],
            ["chip.approval", "chip.approvalPrompt"],
          ] as const
        ).map(([label, prompt]) => (
          <button
            key={label}
            type="button"
            onClick={() => prefill(t(prompt))}
            className="rounded-full border border-border bg-surface px-3 py-1 text-[12.5px] font-medium text-muted transition-colors hover:border-border-strong hover:text-fg"
          >
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  );
}
