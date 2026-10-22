import { ArrowRight, Bot, CheckCircle2, FileText, Globe2, Lock, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { Logo } from "@/components/layout/Logo";
import { ModeBanner } from "@/components/layout/ModeBanner";
import { useAuth } from "@/auth/AuthProvider";
import { DEMO_PROMPT } from "@/lib/agent";
import { env } from "@/lib/env";

const STEPS: { icon: ReactNode; title: string; body: string }[] = [
  { icon: <Sparkles className="size-5" />, title: "Ask in plain words", body: "“Invoice John $1,200 for the Q3 campaign. Once paid, pay my editor 20%.”" },
  { icon: <FileText className="size-5" />, title: "PaySasa sends a PayPal invoice", body: "The agent finds the client, creates the invoice and shows every step it took." },
  { icon: <Lock className="size-5" />, title: "The payout waits, locked", body: "Sarah's $240 is queued, but nothing can move until John's payment lands." },
  { icon: <Globe2 className="size-5" />, title: "The client pays via PayPal", body: "A PayPal webhook updates the dashboard live. The payout unlocks." },
  { icon: <ShieldCheck className="size-5" />, title: "You approve, once", body: "A clear approval shows exactly who gets what. Nothing is sent without you." },
  { icon: <Wallet className="size-5" />, title: "PayPal Payouts sends it", body: "The payout goes out with an idempotency key and a full audit trail." },
];

/** Public landing page: what PaySasa is, who it's for, and a one-click path into the sandbox demo. */
export function LandingPage() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/" replace />;
  return (
    <div className="min-h-full bg-bg">
      <ModeBanner />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link to="/sign-in" className="rounded-[var(--radius-input)] px-3 py-2 font-medium hover:bg-surface-2">
            Sign in
          </Link>
          <Link to="/sign-up" className="rounded-[var(--radius-input)] bg-accent px-3 py-2 font-medium text-accent-fg hover:bg-accent-hover">
            Create account
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-[13px] font-medium text-accent">
              <Bot aria-hidden className="size-4" /> Agentic finance for African freelancers
            </p>
            <h1 className="text-[34px] leading-tight font-semibold tracking-tight sm:text-[44px]">
              Invoice the world. Pay your team. <span className="text-accent">Approve every payout.</span>
            </h1>
            <p className="mt-4 max-w-xl text-[16px] text-muted">
              PaySasa AI turns one sentence into a PayPal invoice, watches for the payment, and lines up payouts to your collaborators. It
              never moves money on its own: every payout waits for your approval.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/sign-in" className="inline-flex h-12 items-center gap-2 rounded-[var(--radius-input)] bg-accent px-5 text-base font-semibold text-accent-fg shadow-1 hover:bg-accent-hover">
                Open the live demo <ArrowRight aria-hidden className="size-4" />
              </Link>
              <a href="#how" className="inline-flex h-12 items-center rounded-[var(--radius-input)] border border-border-strong bg-surface px-5 text-base font-medium hover:bg-surface-2">
                How it works
              </a>
            </div>
            {env.demoLoginHint && (
              <p className="mt-4 text-[13px] text-muted">
                Judges: sign in with <code className="rounded bg-surface-2 px-1.5 py-0.5 text-fg">{env.demoLoginHint}</code> (PayPal sandbox, no real money).
              </p>
            )}
          </div>

          <figure aria-label="Example: one request, two PayPal actions" className="rounded-[var(--radius-sheet)] border border-border bg-surface p-4 shadow-2">
            <div className="ml-auto w-fit max-w-[90%] rounded-[var(--radius-card)] rounded-br-sm bg-accent px-3 py-2 text-[13px] text-accent-fg">{DEMO_PROMPT}</div>
            <ol className="mt-4 space-y-1.5 text-[13px]" aria-label="What PaySasa did">
              {["Found contact John Doe", "Sent $1,200.00 invoice to John Doe", "Found contact Sarah (my editor)", "Scheduled payout to Sarah: $240.00, locked until paid"].map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <CheckCircle2 aria-hidden className="size-4 text-success" /> {s}
                </li>
              ))}
            </ol>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-[var(--radius-card)] border border-border p-3">
                <p className="text-xs text-muted">Invoice via PayPal</p>
                <p className="tabular text-lg font-semibold">$1,200.00</p>
                <p className="text-[13px]">John Doe · Awaiting payment</p>
              </div>
              <div className="rounded-[var(--radius-card)] border border-border p-3">
                <p className="text-xs text-muted">Payout via PayPal</p>
                <p className="tabular text-lg font-semibold">$240.00</p>
                <p className="flex items-center gap-1 text-[13px]">
                  <Lock aria-hidden className="size-3.5" /> Locked until John pays
                </p>
              </div>
            </div>
            <figcaption className="mt-3 text-xs text-muted">Illustration of the live demo. The real thing runs against PayPal's sandbox.</figcaption>
          </figure>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-3">
            <Pillar title="The problem">
              Freelancers in Nairobi, Lagos and Cape Town bill clients abroad, chase late payments by hand, then work out and send each collaborator's
              share. It's slow, error-prone and easy to forget.
            </Pillar>
            <Pillar title="Who it's for">
              Kwame, a designer in Nairobi with clients in the US, UK and South Africa and a junior editor who gets 20% of each job. And everyone like
              him running a business from a phone.
            </Pillar>
            <Pillar title="What changes">
              One sentence does the paperwork. PayPal handles invoicing and payouts across currencies. The agent does the busywork; Kwame keeps the final
              say on every payout.
            </Pillar>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-14 sm:px-6">
          <h2 className="text-[26px] font-semibold">How it works</h2>
          <p className="mt-1 text-muted">The full loop, from request to payout, in the three-minute demo.</p>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-1">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
                    {s.icon}
                  </span>
                  <span className="text-xs font-semibold text-muted">STEP {i + 1}</span>
                </div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-[13px] text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="grid gap-6 rounded-[var(--radius-sheet)] border border-border bg-surface p-6 shadow-1 md:grid-cols-2">
            <div>
              <h2 className="flex items-center gap-2 text-[22px] font-semibold">
                <ShieldCheck aria-hidden className="size-6 text-accent" /> The agent proposes. You approve.
              </h2>
              <ul className="mt-3 space-y-2 text-[14px]">
                {[
                  "Payouts stay locked until the linked invoice is actually paid.",
                  "Every payout needs your explicit approval, with a second check for large amounts.",
                  "Double clicks can't pay twice: approvals are idempotent end to end.",
                  "Reminders to clients are drafts you edit and send, never automatic.",
                  "Every action by the agent, PayPal and you is in an audit log.",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-[22px] font-semibold">Built with</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                {[
                  ["PayPal Invoicing API", "Invoices clients"],
                  ["PayPal Payouts API", "Pays collaborators"],
                  ["PayPal Webhooks", "Live payment status"],
                  ["AI agent with tools", "Understands requests"],
                  ["AG Grid + AG Studio", "Live grids, self-serve dashboards"],
                  ["Supabase + Render", "Realtime data, hosting"],
                ].map(([name, what]) => (
                  <li key={name} className="rounded-[var(--radius-card)] bg-surface-2 p-3">
                    <p className="font-semibold">{name}</p>
                    <p className="text-muted">{what}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-[13px] text-muted">PaySasa AI · Built for the PayPal AI Hackathon · Sandbox only</footer>
    </div>
  );
}

function Pillar({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold tracking-wide text-accent uppercase">{title}</h2>
      <p className="mt-2 text-[15px]">{children}</p>
    </div>
  );
}
