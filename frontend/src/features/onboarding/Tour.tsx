import * as RD from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Lock, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LogoMark } from "@/components/layout/Logo";
import { Step, Stepper } from "@/components/ui/Stepper";
import { cn } from "@/components/ui/cn";
import { useSettings } from "@/lib/settings";

/**
 * First sign-in guidance, in two parts:
 * 1. A short welcome (3 steps): what PaySasa does, the one rule (you approve money), and language.
 * 2. An optional spotlight tour of the dashboard: one highlighted area at a time, with Back / Next / Skip.
 * Both can be replayed from Settings. Esc always gets you out.
 */
export function Tour() {
  const [settings, update] = useSettings();
  const [touring, setTouring] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const welcome = !settings.setupDone && !touring;

  // ?tour=1 replays the welcome and tour (handy for judges and the demo video).
  useEffect(() => {
    if (params.get("tour") !== "1") return;
    update({ setupDone: false });
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("tour");
        return n;
      },
      { replace: true },
    );
  }, [params, setParams, update]);

  const startTour = () => {
    update({ setupDone: true });
    if (pathname !== "/") navigate("/");
    // Let the dashboard render before measuring targets.
    setTimeout(() => setTouring(true), 250);
  };

  return (
    <>
      <RD.Root open={welcome} onOpenChange={(o) => !o && update({ setupDone: true })}>
        <RD.Portal>
          <RD.Overlay className="animate-in fixed inset-0 z-[60] bg-[rgb(7_17_12/0.5)] backdrop-blur-[3px]" />
          <RD.Content
            aria-describedby={undefined}
            className="pop-in fixed inset-x-3 bottom-3 z-[60] overflow-hidden rounded-[24px] border border-border bg-surface shadow-float sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[min(520px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2"
          >
            <RD.Title className="sr-only">Welcome to PaySasa</RD.Title>
            <Welcome onTour={startTour} onSkip={() => update({ setupDone: true })} />
          </RD.Content>
        </RD.Portal>
      </RD.Root>
      {touring && <Spotlight onEnd={() => setTouring(false)} />}
    </>
  );
}

function Welcome({ onTour, onSkip }: { onTour: () => void; onSkip: () => void }) {
  const [{ lang }, update] = useSettings();
  return (
    <>
      <div className="grain relative flex h-28 items-end overflow-hidden bg-forest px-6 pb-4">
        <div aria-hidden className="absolute -top-16 -right-10 size-56 rounded-full bg-[radial-gradient(circle,rgb(200_241_105/0.35),transparent_65%)]" />
        <LogoMark className="relative size-10" />
        <p className="relative ml-3 text-[13px] font-medium text-white/80">Sandbox account · no real money</p>
      </div>
      <Stepper
        onDone={onTour}
        doneLabel={lang === "sw" ? "Nionyeshe" : "Show me around"}
        nextLabel={lang === "sw" ? "Endelea" : "Continue"}
        backLabel={lang === "sw" ? "Rudi" : "Back"}
        footerExtra={
          <button type="button" onClick={onSkip} className="h-11 rounded-full px-4 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-fg">
            {lang === "sw" ? "Ruka" : "Skip tour"}
          </button>
        }
      >
        <Step title={lang === "sw" ? "Karibu PaySasa" : "Welcome to PaySasa"}>
          <p>{lang === "sw" ? "Andika unachohitaji kwa maneno yako. PaySasa inashughulikia mengine." : "Type what you need in your own words. PaySasa handles the rest."}</p>
          <ul className="mt-4 space-y-2.5 text-fg">
            {[
              [<FileText key="f" className="size-4" />, lang === "sw" ? "Inatuma ankara halisi ya PayPal kwa mteja wako" : "Sends a real PayPal invoice to your client"],
              [<Lock key="l" className="size-4" />, lang === "sw" ? "Inafunga mgao wa timu hadi mteja alipe" : "Locks your team's share until the client pays"],
              [<Wallet key="w" className="size-4" />, lang === "sw" ? "Inakuandalia malipo ili uidhinishe" : "Gets the payout ready for you to approve"],
            ].map(([icon, text], i) => (
              <li key={i} className="flex items-center gap-3">
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-xl bg-lime-soft text-forest dark:text-lime">
                  {icon}
                </span>
                <span className="text-[14px]">{text}</span>
              </li>
            ))}
          </ul>
        </Step>
        <Step title={lang === "sw" ? "Wewe ndiye unaamua" : "Money only moves when you say so"}>
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-2 p-4">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
            <p className="text-fg">
              {lang === "sw"
                ? "Msaidizi anaweza kupendekeza malipo, lakini hawezi kuyatuma. Kila malipo yanakuja kwako na skrini moja wazi: nani, kiasi gani, na kwa nini."
                : "The assistant can suggest a payout, but it can't send one. Every payout comes to you as one clear screen: who, how much, and why."}
            </p>
          </div>
          <p className="mt-3">
            {lang === "sw" ? "Ukiona kitufe cha njano " : "When you see the "}
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[12.5px] font-semibold text-warning">{lang === "sw" ? "Inasubiri idhini yako" : "Needs your approval"}</span>
            {lang === "sw" ? ", kuna kitu kinakusubiri." : " badge, something is waiting for you."}
          </p>
        </Step>
        <Step title={lang === "sw" ? "Chagua lugha yako" : "Pick your language"}>
          <div role="radiogroup" aria-label="Language" className="grid grid-cols-2 gap-3">
            {(
              [
                ["en", "English", "Hello! Invoice Daniel $1,200."],
                ["sw", "Kiswahili", "Habari! Mtumie Daniel ankara ya $1,200."],
              ] as const
            ).map(([k, name, sample]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={lang === k}
                lang={k}
                onClick={() => update({ lang: k })}
                className={cn(
                  "rounded-2xl border-2 p-4 text-left transition-colors",
                  lang === k ? "border-forest bg-lime-soft dark:border-lime" : "border-border hover:border-border-strong",
                )}
              >
                <span className="block text-[15px] font-semibold text-fg">{name}</span>
                <span className="mt-1 block text-[12.5px] text-muted">“{sample}”</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px]">
            {lang === "sw" ? "Unaweza kubadilisha wakati wowote juu kulia. Msaidizi anaelewa lugha zote mbili." : "Change it any time at the top right. The assistant understands both."}
          </p>
        </Step>
      </Stepper>
    </>
  );
}

interface TourStep {
  target: string;
  title: { en: string; sw: string };
  body: { en: string; sw: string };
}

const STEPS: TourStep[] = [
  {
    target: '[data-tour="ask"]',
    title: { en: "Start here", sw: "Anza hapa" },
    body: {
      en: "Type a request the way you'd text an assistant. Try the dark “Kwame's request” chip to see the whole flow in one tap.",
      sw: "Andika ombi kama unavyomtumia msaidizi ujumbe. Jaribu kitufe cheusi “Ombi la Kwame” kuona mzunguko mzima kwa mguso mmoja.",
    },
  },
  {
    target: '[data-tour="money"]',
    title: { en: "Your money at a glance", sw: "Pesa zako kwa mtazamo mmoja" },
    body: {
      en: "What clients owe you, what came in this month, and what you owe your team. Hover the wallet to see the invoices behind the total.",
      sw: "Wateja wanachokudai, kilichoingia mwezi huu, na unachodaiwa na timu yako. Elekeza kwenye pochi kuona ankara zilizo nyuma ya jumla.",
    },
  },
  {
    target: '[data-tour="needs"]',
    title: { en: "Things that need you", sw: "Mambo yanayokuhitaji" },
    body: {
      en: "Payouts ready to approve and late invoices show up here first. If it's empty, you're done for the day.",
      sw: "Malipo yaliyo tayari kuidhinishwa na ankara zilizochelewa huonekana hapa kwanza. Ikiwa tupu, umemaliza kwa leo.",
    },
  },
  {
    target: '[data-tour="cycle"]',
    title: { en: "Follow the full loop", sw: "Fuata mzunguko mzima" },
    body: {
      en: "Six steps from invoice to payout. The highlighted step tells you what to do next.",
      sw: "Hatua sita kutoka ankara hadi malipo. Hatua iliyoangaziwa inakuambia ufanye nini baadaye.",
    },
  },
  {
    target: '[data-tour="ledger"]',
    title: { en: "Every invoice and payout", sw: "Kila ankara na malipo" },
    body: {
      en: "Grouped by status with totals per currency. Click any row to see the full PayPal trail.",
      sw: "Zimepangwa kwa hali na jumla kwa kila sarafu. Bofya safu yoyote kuona historia kamili ya PayPal.",
    },
  },
  {
    target: '[data-tour="assistant"]',
    title: { en: "The assistant is always one tap away", sw: "Msaidizi yupo kila wakati" },
    body: {
      en: "Open it from here, or press ⌘K / Ctrl K on any page. It shows every step it takes.",
      sw: "Mfungue hapa, au bonyeza ⌘K / Ctrl K kwenye ukurasa wowote. Anaonyesha kila hatua anayochukua.",
    },
  },
];

function visible(sel: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function Spotlight({ onEnd }: { onEnd: () => void }) {
  const [{ lang }] = useSettings();
  const steps = STEPS.filter((s) => visible(s.target));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[i];

  const measure = useCallback(() => {
    const el = step && visible(step.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    const el = step && visible(step.target);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    measure();
    const id = setInterval(measure, 120); // follows smooth scroll and layout shifts
    const stop = setTimeout(() => clearInterval(id), 900);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    nextRef.current?.focus();
    return () => {
      clearInterval(id);
      clearTimeout(stop);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEnd();
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEnd, steps.length]);

  if (!step) return null;
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(340, vw - 24);
  const below = rect ? rect.bottom + 180 < vh || rect.top < 200 : true;
  const top = rect ? (below ? Math.min(rect.bottom + pad + 12, vh - 200) : Math.max(12, rect.top - pad - 12 - 176)) : vh / 2 - 90;
  const left = rect ? Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 12) : vw / 2 - cardW / 2;
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {/* Click-blocker + dimmed page with a hole around the target */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {rect && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute rounded-[22px] ring-2 ring-lime"
          initial={false}
          animate={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
          style={{ boxShadow: "0 0 0 9999px rgb(7 17 12 / 0.58)" }}
        />
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="absolute rounded-2xl border border-border bg-surface p-5 shadow-float"
          style={{ top, left, width: cardW }}
        >
          <p className="eyebrow flex items-center gap-1.5">
            <Sparkles aria-hidden className="size-3.5 text-forest-3 dark:text-lime" />
            {i + 1} / {steps.length}
          </p>
          <h2 id="tour-title" className="display mt-2 text-[22px]">
            {step.title[lang]}
          </h2>
          <p id="tour-body" className="mt-2 text-[14px] leading-relaxed text-muted">
            {step.body[lang]}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={onEnd} className="text-[13px] font-medium text-muted hover:text-fg">
              {lang === "sw" ? "Ruka" : "Skip"}
            </button>
            <div className="ml-auto flex gap-2">
              {i > 0 && (
                <button type="button" onClick={() => setI(i - 1)} className="h-9 rounded-full border border-border px-4 text-[13px] font-medium hover:bg-surface-2">
                  {lang === "sw" ? "Rudi" : "Back"}
                </button>
              )}
              <button
                ref={nextRef}
                type="button"
                onClick={() => (last ? onEnd() : setI(i + 1))}
                className="h-9 rounded-full bg-forest px-4 text-[13px] font-semibold text-white hover:bg-forest-2 dark:bg-lime dark:text-ink-on-lime"
              >
                {last ? (lang === "sw" ? "Nimeelewa" : "Got it") : lang === "sw" ? "Endelea" : "Next"}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
