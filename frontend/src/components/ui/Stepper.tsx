import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { Check } from "lucide-react";
import { Children, Fragment, useLayoutEffect, useState, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Multi-step container with sliding steps and a container that eases to each step's height.
 * Adapted from an "AnimatedStepper" pattern onto PaySasa tokens: forest/lime indicators, Fraunces titles,
 * keyboard-reachable indicators and reduced-motion support.
 */
export function Stepper({
  children,
  onDone,
  doneLabel = "Done",
  nextLabel = "Continue",
  backLabel = "Back",
  footerExtra,
}: {
  children: ReactNode;
  onDone: () => void;
  doneLabel?: string;
  nextLabel?: string;
  backLabel?: string;
  /** Rendered on the left of the footer on the last step (e.g. a secondary choice). */
  footerExtra?: ReactNode;
}) {
  const steps = Children.toArray(children);
  const total = steps.length;
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const last = step === total;
  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  return (
    <div className="flex flex-col">
      <ol className="flex items-center px-6 pt-6 pb-2" aria-label={`Step ${step} of ${total}`}>
        {steps.map((_, i) => {
          const n = i + 1;
          const status = n === step ? "active" : n < step ? "complete" : "inactive";
          return (
            <Fragment key={n}>
              <li>
                <button
                  type="button"
                  onClick={() => n < step && go(n)}
                  disabled={n >= step}
                  aria-label={`Step ${n}${status === "complete" ? " (done)" : status === "active" ? " (current)" : ""}`}
                  aria-current={status === "active" ? "step" : undefined}
                  className={cn(
                    "relative grid size-9 place-items-center rounded-full border-2 text-[13px] font-semibold transition-colors duration-300",
                    status === "complete" && "border-forest bg-forest text-lime dark:border-lime dark:bg-lime dark:text-ink-on-lime",
                    status === "active" && "border-forest bg-surface text-fg dark:border-lime",
                    status === "inactive" && "border-border bg-surface-2 text-subtle",
                  )}
                >
                  {status === "active" && <motion.span layoutId="stepper-glow" aria-hidden className="absolute -inset-1.5 rounded-full bg-lime/45 blur-[3px] dark:bg-lime/20" />}
                  <span className="relative">{status === "complete" ? <Check aria-hidden className="size-4" /> : n}</span>
                </button>
              </li>
              {n < total && (
                <li aria-hidden className="relative mx-3 h-[2px] flex-1 overflow-hidden rounded-full bg-border">
                  <motion.span
                    className="absolute inset-0 origin-left bg-forest dark:bg-lime"
                    initial={false}
                    animate={{ scaleX: step > n ? 1 : 0 }}
                    transition={{ duration: 0.45, ease: [0.33, 1, 0.68, 1] }}
                  />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>

      <Slide step={step} dir={dir}>
        {steps[step - 1]}
      </Slide>

      <div className="flex items-center gap-3 px-6 pt-2 pb-6">
        {step > 1 ? (
          <button type="button" onClick={() => go(step - 1)} className="text-[13.5px] font-medium text-muted hover:text-fg">
            {backLabel}
          </button>
        ) : (
          <span />
        )}
        <div className="ml-auto flex items-center gap-2">
          {last && footerExtra}
          <button
            type="button"
            onClick={() => (last ? onDone() : go(step + 1))}
            className="inline-flex h-11 items-center justify-center rounded-full bg-forest px-6 text-[14px] font-semibold text-white transition-[background-color,transform] hover:bg-forest-2 active:scale-95 dark:bg-lime dark:text-ink-on-lime"
          >
            {last ? doneLabel : nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const variants: Variants = {
  enter: (d: number) => ({ x: d >= 0 ? 24 : -24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d >= 0 ? -24 : 24, opacity: 0 }),
};

function Slide({ step, dir, children }: { step: number; dir: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [h, setH] = useState<number | "auto">("auto");
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  // Follow the current step's height, including when its content changes (ResizeObserver).
  useLayoutEffect(() => {
    if (!el) return;
    setH(el.offsetHeight);
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return (
    <motion.div className="relative overflow-hidden px-6" animate={{ height: h }} transition={reduce ? { duration: 0 } : { type: "spring", damping: 26, stiffness: 220 }}>
      <AnimatePresence initial={false} mode="wait" custom={dir}>
        <motion.div
          key={step}
          ref={setEl}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={reduce ? { duration: 0 } : { x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.18 } }}
          className="py-4"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="display text-[28px]">{title}</h2>
      <div className="mt-3 text-[14.5px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}
