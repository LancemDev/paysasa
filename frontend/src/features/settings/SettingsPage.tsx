import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { useAuth } from "@/auth/AuthProvider";
import { env } from "@/lib/env";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import { useProfile } from "@/lib/queries";
import { useSettings, type Settings } from "@/lib/settings";
import { LangSwitch } from "@/components/layout/LangSwitch";
import { useT } from "@/lib/i18n";

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const profile = useProfile();
  const [settings, update] = useSettings();
  const toast = useToast();
  const t = useT();
  const currency = profile.data?.default_currency?.trim() || "USD";
  const [threshold, setThreshold] = useState(minorToDecimalString(settings.secondConfirmMinor, 2));
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  const saveThreshold = () => {
    const m = /^\d+(\.\d{1,2})?$/.exec(threshold.trim().replace(/,/g, ""));
    if (!m) {
      setThresholdError("Enter an amount like 500 or 500.00.");
      return;
    }
    const [whole, frac = ""] = threshold.trim().replace(/,/g, "").split(".");
    const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
    if (minor <= 0) {
      setThresholdError("Use an amount above zero.");
      return;
    }
    setThresholdError(null);
    update({ secondConfirmMinor: minor });
    toast.success("Safety limit saved", `Payouts of ${formatMoney(minor, currency)} or more need a second confirmation.`);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-8 sm:px-6">
      <h1 className="display text-[36px]">{t("settings.title")}</h1>

      <Section title="Profile">
        {profile.isLoading ? (
          <Skeleton className="h-12" />
        ) : (
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2">
            <dt className="text-muted">Name</dt>
            <dd>{profile.data?.display_name ?? "Not set"}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="break-all">{user?.email}</dd>
            <dt className="text-muted">Default currency</dt>
            <dd>{currency}</dd>
          </dl>
        )}
        <p className="mt-3 text-[13px] text-muted">Your profile is set up by the PaySasa team for now; editing it here is coming later.</p>
      </Section>

      <Section title="Payout safety">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            className="flex-1"
            label={`Second confirmation at or above (${currency})`}
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            error={thresholdError}
            hint="Large payouts ask you to confirm twice. Stored on this device."
          />
          <Button onClick={saveThreshold}>Save</Button>
        </div>
      </Section>

      <Section title="Language">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted">English or Kiswahili. The assistant understands both.</p>
          <LangSwitch />
        </div>
      </Section>

      <Section title="Appearance">
        <fieldset>
          <legend className="sr-only">Theme</legend>
          <div className="grid grid-cols-3 gap-2">
            {(["system", "light", "dark"] as Settings["theme"][]).map((th) => (
              <label key={th} className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-input)] border p-2.5 capitalize", settings.theme === th ? "border-forest bg-lime-soft font-medium dark:border-lime" : "border-border hover:border-border-strong")}>
                <input type="radio" name="theme" className="sr-only" checked={settings.theme === th} onChange={() => update({ theme: th })} />
                {th === "system" ? "Match device" : th}
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section title="Environment">
        <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-[13px]">
          <dt className="text-muted">PayPal</dt>
          <dd>{env.paypalMode === "sandbox" ? "Sandbox (test accounts, no real money)" : "Mock (simulated by the server, no real money)"}</dd>
          <dt className="text-muted">Server</dt>
          <dd className="break-all">{env.apiBaseUrl}</dd>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => update({ setupDone: false })}>
            Replay the welcome tour
          </Button>
          <Button size="sm" variant="ghost" onClick={() => update({ onboardingDismissed: false })}>
            Show the payment cycle again
          </Button>
        </div>
      </Section>

      <Button variant="danger-ghost" className="self-start" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5" aria-label={title}>
      <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}
