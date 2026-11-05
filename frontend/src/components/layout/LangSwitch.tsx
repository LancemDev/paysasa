import { cn } from "@/components/ui/cn";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

/** EN / SW toggle. A radiogroup, so screen readers announce the current language. */
export function LangSwitch({ className, tone = "default" }: { className?: string; tone?: "default" | "inverse" }) {
  const [{ lang }, update] = useSettings();
  const t = useT();
  const opts = [
    { key: "en", label: "EN", full: "English" },
    { key: "sw", label: "SW", full: "Kiswahili" },
  ] as const;
  return (
    <div
      role="radiogroup"
      aria-label={t("lang.label")}
      className={cn("inline-flex h-8 items-center rounded-full p-0.5 text-xs font-semibold", tone === "inverse" ? "bg-white/10" : "border border-border bg-surface-2", className)}
    >
      {opts.map((o) => {
        const on = lang === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            lang={o.key}
            title={o.full}
            onClick={() => update({ lang: o.key })}
            className={cn(
              "h-7 rounded-full px-2.5 transition-colors",
              on ? (tone === "inverse" ? "bg-lime text-ink-on-lime" : "bg-surface text-fg shadow-[0_0_0_1px_var(--border)]") : tone === "inverse" ? "text-white/70 hover:text-white" : "text-muted hover:text-fg",
            )}
          >
            <span aria-hidden>{o.label}</span>
            <span className="sr-only">{o.full}</span>
          </button>
        );
      })}
    </div>
  );
}
