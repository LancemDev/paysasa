import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { TextField, inputClass } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { useAuth } from "@/auth/AuthProvider";
import { env } from "@/lib/env";
import { usePayPalMode } from "@/lib/paypalMode";
import { CURRENCY_LABELS, DEFAULT_CURRENCY, SELECTABLE_CURRENCIES, formatMoney, minorToDecimalString } from "@/lib/money";
import { useProfile } from "@/lib/queries";
import { qk } from "@/lib/queryKeys";
import { api, toUserMessage } from "@/lib/api";
import { useSettings, type Settings } from "@/lib/settings";
import { LangSwitch } from "@/components/layout/LangSwitch";
import { AccessibilityMenu } from "@/components/layout/DisplayControls";
import { useT } from "@/lib/i18n";

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const profile = useProfile();
  const qc = useQueryClient();
  const [settings, update] = useSettings();
  const paypalMode = usePayPalMode();
  const toast = useToast();
  const t = useT();
  const currency = profile.data?.default_currency?.trim() || DEFAULT_CURRENCY;
  const [threshold, setThreshold] = useState(minorToDecimalString(settings.secondConfirmMinor, 2));
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState(currency);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const currencySelectId = useId();

  useEffect(() => {
    setSelectedCurrency(profile.data?.default_currency?.trim() || DEFAULT_CURRENCY);
  }, [profile.data?.default_currency]);

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

  const saveCurrency = async () => {
    if (selectedCurrency === currency) return;
    setSavingCurrency(true);
    try {
      await api.updateProfile({ default_currency: selectedCurrency });
      await qc.invalidateQueries({ queryKey: qk.profile });
      toast.success("Default currency saved", `New invoices and amounts will default to ${selectedCurrency}.`);
    } catch (e) {
      toast.error("Couldn't save currency", toUserMessage(e));
    } finally {
      setSavingCurrency(false);
    }
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
          </dl>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={currencySelectId} className="text-[13px] font-medium">
              Default currency
            </label>
            <select
              id={currencySelectId}
              className={cn(inputClass, "h-11")}
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              disabled={profile.isLoading || savingCurrency}
            >
              {SELECTABLE_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {CURRENCY_LABELS[code] ?? code}
                </option>
              ))}
            </select>
            <p className="text-[13px] text-muted">Used when you create invoices without specifying a currency. You can still choose another supported currency per invoice.</p>
          </div>
          <Button onClick={() => void saveCurrency()} disabled={profile.isLoading || savingCurrency || selectedCurrency === currency}>
            {savingCurrency ? "Saving…" : "Save"}
          </Button>
        </div>
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

      <Section title="Accessibility">
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-medium">High contrast</span>
              <span className="text-[13px] text-muted">Darker text and stronger borders.</span>
            </span>
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={settings.highContrast} onChange={(e) => update({ highContrast: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-medium">Reduce motion</span>
              <span className="text-[13px] text-muted">Turns off animations, even if your device allows them.</span>
            </span>
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={settings.reduceMotion} onChange={(e) => update({ reduceMotion: e.target.checked })} />
          </label>
          <fieldset>
            <legend className="font-medium">Text size</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ["md", "Default"],
                  ["lg", "Large"],
                  ["xl", "Larger"],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className={cn("flex cursor-pointer items-center justify-center rounded-[var(--radius-input)] border p-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus)]", settings.textSize === v ? "border-forest bg-lime-soft font-medium dark:border-lime" : "border-border hover:border-border-strong")}>
                  <input type="radio" name="textSize" className="sr-only" checked={settings.textSize === v} onChange={() => update({ textSize: v })} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="flex items-center gap-2 text-[13px] text-muted">
            Also in the header: <AccessibilityMenu />
          </p>
        </div>
      </Section>

      <Section title="Appearance">
        <fieldset>
          <legend className="sr-only">Theme</legend>
          <div className="grid grid-cols-3 gap-2">
            {(["system", "light", "dark"] as Settings["theme"][]).map((th) => (
              <label key={th} className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-input)] border p-2.5 capitalize has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus)]", settings.theme === th ? "border-forest bg-lime-soft font-medium dark:border-lime" : "border-border hover:border-border-strong")}>
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
          <dd>{paypalMode === "sandbox" ? "Sandbox (test accounts, no real money)" : paypalMode === "live" ? "Live (real money)" : "Mock (simulated by the server, no real money)"}</dd>
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
