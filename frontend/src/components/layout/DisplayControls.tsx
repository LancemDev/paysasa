import * as DM from "@radix-ui/react-dropdown-menu";
import { Accessibility, Check, Contrast, Moon, Sun, Type, Waves } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/components/ui/cn";
import { useT } from "@/lib/i18n";
import { useResolvedTheme, useSettings, type Settings } from "@/lib/settings";

const iconBtn = (tone: "default" | "inverse") =>
  cn(
    "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full transition-colors",
    tone === "inverse" ? "bg-white/10 text-white hover:bg-white/20" : "border border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2",
  );

/** One-tap light/dark switch. The icon shows what you'll switch to, and the label says it in words. */
export function ThemeToggle({ tone = "default" }: { tone?: "default" | "inverse" }) {
  const t = useT();
  const [, update] = useSettings();
  const resolved = useResolvedTheme();
  const next = resolved === "dark" ? "light" : "dark";
  const label = next === "dark" ? t("a11y.toDark") : t("a11y.toLight");
  return (
    <button type="button" onClick={() => update({ theme: next })} aria-label={label} title={label} className={iconBtn(tone)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={resolved}
          initial={{ y: 12, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -12, opacity: 0, rotate: 40 }}
          transition={{ duration: 0.2 }}
          className="grid place-items-center"
        >
          {resolved === "dark" ? <Sun aria-hidden className="size-[18px]" /> : <Moon aria-hidden className="size-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] outline-none data-[highlighted]:bg-surface-2";

/**
 * Display and accessibility menu: theme, text size, high contrast and reduced motion.
 * Built on Radix menu radio and checkbox items, so screen readers announce each state.
 */
export function AccessibilityMenu({ tone = "default" }: { tone?: "default" | "inverse" }) {
  const t = useT();
  const [s, update] = useSettings();
  return (
    <DM.Root>
      <DM.Trigger aria-label={t("a11y.menu")} title={t("a11y.menu")} className={iconBtn(tone)} data-tour="a11y">
        <Accessibility aria-hidden className="size-[18px]" />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="pop-in z-50 w-72 rounded-2xl border border-border bg-surface p-1.5 text-fg shadow-float">
          <DM.Label className="px-2.5 pt-2 pb-1 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">{t("a11y.theme")}</DM.Label>
          <DM.RadioGroup value={s.theme} onValueChange={(v) => update({ theme: v as Settings["theme"] })} className="grid grid-cols-3 gap-1 px-1 pb-1">
            {(
              [
                ["light", t("a11y.light"), Sun],
                ["dark", t("a11y.dark"), Moon],
                ["system", t("a11y.system"), Contrast],
              ] as const
            ).map(([v, label, Icon]) => (
              <DM.RadioItem
                key={v}
                value={v}
                onSelect={(e) => e.preventDefault()}
                className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-border py-2 text-[12px] font-medium outline-none data-[highlighted]:bg-surface-2 data-[state=checked]:border-forest data-[state=checked]:bg-lime-soft dark:data-[state=checked]:border-lime"
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </DM.RadioItem>
            ))}
          </DM.RadioGroup>

          <DM.Separator className="my-1 h-px bg-border" />
          <DM.Label className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
            <Type aria-hidden className="size-3.5" /> {t("a11y.text")}
          </DM.Label>
          <DM.RadioGroup value={s.textSize} onValueChange={(v) => update({ textSize: v as Settings["textSize"] })} className="grid grid-cols-3 gap-1 px-1 pb-1">
            {(
              [
                ["md", "A", "text-[13px]", t("a11y.textDefault")],
                ["lg", "A", "text-[16px]", t("a11y.textLarge")],
                ["xl", "A", "text-[19px]", t("a11y.textLarger")],
              ] as const
            ).map(([v, glyph, size, label]) => (
              <DM.RadioItem
                key={v}
                value={v}
                aria-label={label}
                onSelect={(e) => e.preventDefault()}
                className="grid h-11 cursor-pointer place-items-center rounded-xl border border-border font-semibold outline-none data-[highlighted]:bg-surface-2 data-[state=checked]:border-forest data-[state=checked]:bg-lime-soft dark:data-[state=checked]:border-lime"
              >
                <span aria-hidden className={size}>
                  {glyph}
                </span>
              </DM.RadioItem>
            ))}
          </DM.RadioGroup>

          <DM.Separator className="my-1 h-px bg-border" />
          <DM.CheckboxItem checked={s.highContrast} onCheckedChange={(v) => update({ highContrast: v === true })} onSelect={(e) => e.preventDefault()} className={item}>
            <Contrast aria-hidden className="size-4" />
            <span className="flex-1">{t("a11y.contrast")}</span>
            <Switch on={s.highContrast} />
          </DM.CheckboxItem>
          <DM.CheckboxItem checked={s.reduceMotion} onCheckedChange={(v) => update({ reduceMotion: v === true })} onSelect={(e) => e.preventDefault()} className={item}>
            <Waves aria-hidden className="size-4" />
            <span className="flex-1">{t("a11y.motion")}</span>
            <Switch on={s.reduceMotion} />
          </DM.CheckboxItem>
          <p className="px-2.5 pt-1.5 pb-2 text-[12px] leading-snug text-muted">{t("a11y.note")}</p>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-forest dark:bg-lime" : "bg-surface-3")}>
      <span className={cn("absolute top-0.5 grid size-4 place-items-center rounded-full bg-surface shadow-1 transition-transform", on ? "translate-x-4" : "translate-x-0.5")}>
        {on && <Check className="size-2.5 text-forest" strokeWidth={3} />}
      </span>
    </span>
  );
}
