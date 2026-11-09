import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Logo } from "@/components/layout/Logo";
import { useAuth } from "@/auth/AuthProvider";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Check them and try again.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first. Check your inbox for the link.";
  if (/already registered|already exists/i.test(message)) return "An account with this email already exists. Try signing in.";
  if (/password should be at least/i.test(message)) return "Use a password of at least 6 characters.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Please wait a minute and try again.";
  if (/fetch|network/i.test(message)) return "We couldn't reach the sign-in service. Check your connection.";
  return "That didn't work. Please try again.";
}

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="grid flex-1 lg:grid-cols-[1fr_1.1fr]">
        <aside className="grain relative hidden flex-col justify-between overflow-hidden bg-forest p-10 text-white lg:flex">
          <div aria-hidden className="absolute -top-32 -left-24 size-[480px] rounded-full bg-[radial-gradient(circle,rgb(200_241_105/0.22),transparent_65%)]" />
          <Link to="/welcome" className="relative w-fit" aria-label="PaySasa home">
            <Logo tone="inverse" />
          </Link>
          <div className="relative max-w-md">
            <p className="display text-[40px] leading-[1.05]">Invoice the client. Pay the team. Approve once.</p>
            <ul className="mt-8 space-y-3 text-[15px] text-white/80">
              {["Real PayPal invoices from one sentence", "Your team's share waits, locked, until the client pays", "Nothing moves without your tap"].map((x) => (
                <li key={x} className="flex items-center gap-3">
                  <span aria-hidden className="grid size-5 place-items-center rounded-full bg-lime text-[11px] font-bold text-ink-on-lime">✓</span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-[13px] text-white/50">PayPal sandbox demo. No real money moves.</p>
        </aside>
        <main className="flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-[400px]">
            <Link to="/welcome" className="mb-8 flex justify-center lg:hidden" aria-label="PaySasa home">
              <Logo />
            </Link>
            <h1 className="display text-[34px]">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 text-[13.5px] text-muted">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}

export function SignInPage() {
  const { user, expired } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(friendlyAuthError(err.message));
    else navigate(from, { replace: true });
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Invoicing and payouts, with you in control."
      footer={
        <>
          New to PaySasa? <Link className="font-medium text-accent underline-offset-2 hover:underline" to="/sign-up">Create an account</Link>
        </>
      }
    >
      {expired && (
        <p role="status" className="mb-5 rounded-xl bg-warning-soft p-3 text-[13px]">
          Your session expired. Please sign in again.
        </p>
      )}
      {env.demoLoginHint && (
        <p className="mb-5 rounded-xl border border-border bg-lime-soft p-3 text-[13px]">
          Demo account (PayPal sandbox): <code>{env.demoLoginHint}</code>
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <Link to="/reset-password" className="text-center text-[13px] text-accent underline-offset-2 hover:underline">
          Forgot your password?
        </Link>
      </form>
    </AuthLayout>
  );
}

export function SignUpPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/` } });
    setBusy(false);
    if (err) setError(friendlyAuthError(err.message));
    else if (!data.session) setSent(true);
  };

  if (sent)
    return (
      <AuthLayout title="Check your email" subtitle={`We sent a confirmation link to ${email}. Open it to finish signing up.`}>
        <Link to="/sign-in" className="text-accent underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    );

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <>
          Already have an account? <Link className="font-medium text-accent underline-offset-2 hover:underline" to="/sign-in">Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="new-password" required hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/update-password` });
    setBusy(false);
    if (err) setError(friendlyAuthError(err.message));
    else setSent(true);
  };
  return (
    <AuthLayout title="Reset your password" subtitle={sent ? undefined : "We'll email you a link to choose a new one."} footer={<Link className="text-accent underline-offset-2 hover:underline" to="/sign-in">Back to sign in</Link>}>
      {sent ? (
        <p role="status">If an account exists for {email}, a reset link is on its way.</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function UpdatePasswordPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!loading && !user)
    return (
      <AuthLayout title="Link expired" subtitle="This password reset link is no longer valid.">
        <Link to="/reset-password" className="text-accent underline-offset-2 hover:underline">
          Request a new link
        </Link>
      </AuthLayout>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(friendlyAuthError(err.message));
    else navigate("/", { replace: true });
  };
  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." />
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={busy}>
          Save password
        </Button>
      </form>
    </AuthLayout>
  );
}
