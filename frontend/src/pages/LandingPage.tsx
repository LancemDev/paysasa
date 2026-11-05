import { ArrowRight, Check, CheckCircle2, FileText, Globe2, Languages, LayoutDashboard, Mail, ShieldCheck, Smartphone, Sparkles, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { LangSwitch } from "@/components/layout/LangSwitch";
import { Logo, LogoMark } from "@/components/layout/Logo";
import { ModeBanner } from "@/components/layout/ModeBanner";
import { FlowLine } from "@/components/ui/FlowLine";
import { WalletStack, type WalletCard } from "@/components/ui/WalletStack";
import { cn } from "@/components/ui/cn";
import { useAuth } from "@/auth/AuthProvider";
import { env } from "@/lib/env";
import { useT, type MsgKey } from "@/lib/i18n";

const HERO_CARDS: WalletCard[] = [
  { id: "p", kind: "Payout · PayPal", name: "Sarah (editor)", amount: "$240.00", meta: "Locked until paid", tone: "paper" },
  { id: "a", kind: "Invoice · PayPal", name: "Amina Studio, London", amount: "£300.00", meta: "Paid", tone: "mint" },
  { id: "j", kind: "Invoice · PayPal", name: "Daniel Carter, New York", amount: "$1,200.00", meta: "Due in 14 days", tone: "lime" },
];

/** Public landing page: what PaySasa is, who it's for, and a one-click path into the sandbox demo. */
export function LandingPage() {
  const { user, loading } = useAuth();
  const t = useT();
  if (!loading && user) return <Navigate to="/" replace />;
  return (
    <div className="min-h-full bg-bg">
      <ModeBanner />
      <Nav />
      <main>
        <Hero />
        <BuiltOn />
        <OldVsNew />
        <How />
        <Trust />
        <Features />
        <Persona />
        <FinalCta />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-[13px] text-muted sm:flex-row sm:px-6">
          <Logo />
          <p className="text-center">{t("land.footer")}</p>
        </div>
      </footer>
    </div>
  );
}

function Nav() {
  const t = useT();
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/welcome" aria-label={t("nav.home")}>
          <Logo />
        </Link>
        <nav aria-label="Sections" className="ml-6 hidden items-center gap-6 text-[14px] text-muted md:flex">
          <a href="#how" className="hover:text-fg">
            {t("land.how")}
          </a>
          <a href="#trust" className="hover:text-fg">
            {t("land.trustTitle")}
          </a>
        </nav>
        <nav aria-label="Account" className="ml-auto flex items-center gap-2">
          <LangSwitch />
          <Link to="/sign-in" className="hidden h-9 items-center rounded-full px-3.5 text-[14px] font-medium hover:bg-surface-2 sm:inline-flex">
            {t("land.signIn")}
          </Link>
          <Link to="/sign-up" className="inline-flex h-9 items-center rounded-full bg-forest px-4 text-[14px] font-medium text-white hover:bg-forest-2 dark:bg-lime dark:text-ink-on-lime">
            {t("land.create")}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Highlight({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span aria-hidden className="absolute inset-x-[-0.12em] top-[0.18em] bottom-[0.02em] -z-10 -rotate-[1.5deg] rounded-[0.2em] bg-lime" />
      {children}
    </span>
  );
}

function Hero() {
  const t = useT();
  const reduce = useReducedMotion();
  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] as const } });
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="ledger-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_20%,black_20%,transparent_70%)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.08fr_1fr] lg:pt-20 lg:pb-28">
        <div>
          <motion.p {...rise(0)} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[13px] font-medium text-muted">
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--chart-money)]" />
            {t("land.eyebrow")}
          </motion.p>
          <motion.h1 {...rise(0.05)} className="display isolate mt-6 text-balance text-[44px] leading-[1.02] sm:text-[64px] lg:text-[72px]">
            {t("land.h1a")} <Highlight>{t("land.h1b")}</Highlight> <span className="text-muted">{t("land.h1c")}</span>
          </motion.h1>
          <motion.p {...rise(0.12)} className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted">
            {t("land.sub")}
          </motion.p>
          <motion.div {...rise(0.18)} className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/sign-in"
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-lime px-6 text-[15px] font-semibold text-ink-on-lime shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)] transition-colors hover:bg-lime-2"
            >
              {t("land.cta")} <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a href="#how" className="inline-flex h-12 items-center rounded-full border border-border-strong bg-surface px-6 text-[15px] font-medium hover:bg-surface-2">
              {t("land.how")}
            </a>
          </motion.div>
          {env.demoLoginHint && (
            <p className="mt-4 text-[13px] text-muted">
              {t("land.judges")} <code className="rounded bg-surface-2 px-1.5 py-0.5 text-fg">{env.demoLoginHint}</code> {t("land.judgesNote")}
            </p>
          )}
          <motion.ul {...rise(0.24)} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
            {(["land.chip1", "land.chip2", "land.chip3"] as MsgKey[]).map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <Check aria-hidden className="size-4 text-[var(--chart-money)]" /> {t(k)}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.figure {...rise(0.1)} aria-label="Example: one request, an invoice and a locked payout" className="relative">
          <div className="grain relative overflow-hidden rounded-[28px] bg-forest px-6 pt-8 pb-6 text-white shadow-float sm:px-10">
            <div aria-hidden className="absolute -top-24 -right-16 size-80 rounded-full bg-[radial-gradient(circle,rgb(200_241_105/0.28),transparent_65%)]" />
            <div className="relative ml-auto w-fit max-w-[92%] rounded-2xl rounded-br-md bg-white/10 px-4 py-3 text-[14px] leading-relaxed ring-1 ring-white/15 backdrop-blur">
              {t("land.mockPrompt")}
            </div>
            <ol className="relative mt-4 space-y-1.5 text-[13px] text-white/80" aria-label="What PaySasa did">
              {(["land.mock1", "land.mock2", "land.mock3"] as MsgKey[]).map((k) => t(k)).map((s, i) => (
                <motion.li
                  key={s}
                  initial={reduce ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.25 }}
                  className="flex items-center gap-2"
                >
                  <span aria-hidden className="grid size-4 place-items-center rounded-full bg-lime text-ink-on-lime">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {s}
                </motion.li>
              ))}
            </ol>
            <WalletStack intro className="relative mt-2" cards={HERO_CARDS} label={t("land.walletLabel")} total="$1,440.00" hint={t("land.walletHint")} />
          </div>
          <div className="absolute -top-5 -left-4 hidden items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 shadow-float sm:flex">
            <ShieldCheck aria-hidden className="size-5 text-success" />
            <div className="text-[13px] leading-tight">
              <p className="font-semibold">{t("land.okTitle")}</p>
              <p className="text-muted">{t("land.okSub")}</p>
            </div>
          </div>
          <figcaption className="sr-only">Illustration of the live demo. The real thing runs against PayPal's sandbox.</figcaption>
        </motion.figure>
      </div>
    </section>
  );
}

function BuiltOn() {
  const t = useT();
  const items = ["PayPal Invoicing", "PayPal Payouts", "PayPal Webhooks", "Claude", "AG Grid", "AG Studio", "Supabase", "Render"];
  return (
    <section aria-label={t("land.builtOn")} className="border-y border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 sm:px-6">
        <span className="eyebrow">{t("land.builtOn")}</span>
        {items.map((x) => (
          <span key={x} className="text-[14px] font-semibold tracking-tight text-subtle">
            {x}
          </span>
        ))}
      </div>
    </section>
  );
}

function OldVsNew() {
  const t = useT();
  const old: MsgKey[] = ["land.old1", "land.old2", "land.old3", "land.old4", "land.old5"];
  const neu: MsgKey[] = ["land.new1", "land.new2", "land.new3", "land.new4", "land.new5"];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <div className="grid overflow-hidden rounded-[28px] border border-border md:grid-cols-2">
        <div className="bg-surface-2 p-8 sm:p-10">
          <h2 className="display text-[30px] text-muted">{t("land.oldTitle")}</h2>
          <ul className="mt-6 space-y-4">
            {old.map((k) => (
              <li key={k} className="flex gap-3 text-[15px] text-muted">
                <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
                  <X className="size-3" strokeWidth={3} />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <div className="grain relative bg-forest p-8 text-white sm:p-10">
          <h2 className="display relative text-[30px]">
            {t("land.newTitle")}
            <span aria-hidden className="ml-1 text-lime">.</span>
          </h2>
          <ul className="relative mt-6 space-y-4">
            {neu.map((k) => (
              <li key={k} className="flex gap-3 text-[15px] text-white/90">
                <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-lime" />
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function How() {
  const t = useT();
  const steps: [MsgKey, MsgKey, ReactNode][] = [
    ["land.step1", "land.step1b", <Sparkles key="s" className="size-5" />],
    ["land.step2", "land.step2b", <FileText key="f" className="size-5" />],
    ["land.step3", "land.step3b", <ShieldCheck key="c" className="size-5" />],
  ];
  return (
    <section id="how" className="scroll-mt-20 border-y border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr] lg:py-28">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow">{t("land.how")}</p>
          <h2 className="display mt-3 text-[40px] sm:text-[48px]">{t("land.howTitle")}</h2>
        </div>
        <ol className="divide-y divide-border">
          {steps.map(([title, body, icon], i) => (
            <li key={title} className="group flex gap-6 py-8 first:pt-0 last:pb-0">
              <span aria-hidden className="display tabular w-16 shrink-0 text-[64px] leading-none text-border-strong transition-colors duration-300 group-hover:text-[var(--chart-money)]">
                {i + 1}
              </span>
              <div>
                <h3 className="flex items-center gap-2 text-[20px] font-semibold">
                  <span className={cn("grid size-9 place-items-center rounded-xl", i === 2 ? "bg-lime text-ink-on-lime" : "bg-surface-2 text-fg")}>{icon}</span>
                  {t(title)}
                </h3>
                <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">{t(body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Trust() {
  const t = useT();
  const rules: MsgKey[] = ["land.trust1", "land.trust2", "land.trust3", "land.trust4", "land.trust5"];
  return (
    <section id="trust" className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
      <div>
        <h2 className="display text-[40px] sm:text-[48px]">{t("land.trustTitle")}</h2>
        <p className="mt-3 max-w-md text-[16px] text-muted">{t("land.trustSub")}</p>
        <ul className="mt-8 space-y-3.5">
          {rules.map((k, i) => (
            <li key={k} className="flex gap-3 text-[15px]">
              <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-lime-soft text-[12px] font-semibold text-forest dark:text-lime">
                {i + 1}
              </span>
              {t(k)}
            </li>
          ))}
        </ul>
      </div>
      {/* A faithful mini version of the real approval screen */}
      <div aria-hidden className="relative">
        <div className="absolute -inset-6 -z-10 rounded-[36px] bg-[radial-gradient(60%_60%_at_50%_40%,var(--lime-soft),transparent_70%)]" />
        <div className="mx-auto max-w-md rounded-[24px] border border-border bg-surface shadow-float">
          <div className="border-b border-border px-6 py-5">
            <p className="display text-[22px]">Approve payout</p>
            <p className="text-[13px] text-muted">Money only moves after you approve.</p>
          </div>
          <div className="space-y-4 px-6 py-5">
            <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4">
              <p className="font-semibold">This will send $240.00 USD to Sarah via PayPal.</p>
              <p className="mt-0.5 text-[13px] text-muted">Once PayPal accepts it, it can't be undone.</p>
            </div>
            <FlowLine />
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-[13.5px]">
              <dt className="text-muted">Triggered by</dt>
              <dd>
                Daniel Carter paid $1,200.00 <span className="ml-1 rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-medium text-success">Paid</span>
              </dd>
              <dt className="text-muted">Proposed by</dt>
              <dd>PaySasa assistant, from your request</dd>
            </dl>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            <span className="text-[14px] font-medium text-danger">Reject…</span>
            <span className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-forest px-4 text-[14px] font-medium text-white dark:bg-lime dark:text-ink-on-lime">
              <ShieldCheck className="size-4" /> Approve and send $240.00
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const t = useT();
  const items: { title: MsgKey; body: MsgKey; icon: ReactNode; className?: string; visual?: ReactNode }[] = [
    {
      title: "land.feat1",
      body: "land.feat1b",
      icon: <LayoutDashboard className="size-5" />,
      className: "md:col-span-2",
      visual: (
        <div aria-hidden className="mt-6 grid grid-cols-3 gap-2">
          {[
            ["Waiting", "$1,200", "bg-surface"],
            ["Overdue", "£300", "bg-danger-soft"],
            ["To approve", "1", "bg-warning-soft"],
          ].map(([l, v, c]) => (
            <div key={l} className={cn("rounded-xl border border-border p-3", c)}>
              <p className="text-[11px] text-muted">{l}</p>
              <p className="tabular text-[18px] font-semibold">{v}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "land.feat2",
      body: "land.feat2b",
      icon: <Mail className="size-5" />,
      visual: (
        <p aria-hidden className="mt-5 rounded-xl rounded-bl-sm border border-border bg-surface p-3 text-[13px] text-muted italic">
          “Hi Amina, a quick nudge on the logo invoice from last month…”
        </p>
      ),
    },
    { title: "land.feat3", body: "land.feat3b", icon: <Globe2 className="size-5" /> },
    { title: "land.feat4", body: "land.feat4b", icon: <Languages className="size-5" /> },
    { title: "land.feat5", body: "land.feat5b", icon: <Smartphone className="size-5" /> },
  ];
  return (
    <section className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <h2 className="display max-w-2xl text-[40px] sm:text-[48px]">{t("land.featTitle")}</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {items.map((f) => (
            <article
              key={f.title}
              className={cn(
                "rounded-[22px] border border-border bg-surface-2 p-6 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:shadow-2",
                f.className,
              )}
            >
              <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-surface text-fg ring-1 ring-border">
                {f.icon}
              </span>
              <h3 className="mt-4 text-[18px] font-semibold">{t(f.title)}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{t(f.body)}</p>
              {f.visual}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Persona() {
  const t = useT();
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <figure className="grid items-center gap-8 rounded-[28px] border border-border bg-surface p-8 sm:p-10 md:grid-cols-[auto_1fr]">
        <div aria-hidden className="grid size-24 place-items-center rounded-full bg-forest font-[family-name:var(--font-display)] text-[40px] text-lime">K</div>
        <div>
          <p className="eyebrow">{t("land.personaTag")}</p>
          <blockquote className="display mt-3 text-[24px] leading-snug sm:text-[28px]">{t("land.persona")}</blockquote>
          <figcaption className="mt-4 text-[14px] text-muted">Kwame · Video editor · Nairobi</figcaption>
        </div>
      </figure>
    </section>
  );
}

function FinalCta() {
  const t = useT();
  return (
    <section className="relative overflow-hidden bg-lime text-ink-on-lime">
      <p aria-hidden className="display pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 text-[220px] leading-none whitespace-nowrap opacity-[0.07] select-none">
        sasa sasa sasa
      </p>
      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <LogoMark className="size-12" />
        <h2 className="display mt-6 text-[44px] leading-[1.02] sm:text-[64px]">{t("land.finalTitle")}</h2>
        <p className="mt-4 max-w-xl text-[17px] opacity-80">{t("land.finalSub")}</p>
        <Link to="/sign-in" className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-forest px-7 text-[15px] font-semibold text-white shadow-float transition-transform hover:scale-[1.03]">
          {t("land.cta2")} <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}

