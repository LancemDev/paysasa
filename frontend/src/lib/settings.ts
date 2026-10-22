import { useCallback, useEffect, useSyncExternalStore } from "react";
import { env } from "./env";

/** Device-local preferences (the backend has no settings/profile endpoint). */
export interface Settings {
  theme: "system" | "light" | "dark";
  /** Payouts at or above this many minor units need a second confirmation. */
  secondConfirmMinor: number;
  onboardingDismissed: boolean;
}

const KEY = "paysasa.settings.v1";
const defaults: Settings = { theme: "system", secondConfirmMinor: env.secondConfirmMinor, onboardingDismissed: false };
const listeners = new Set<() => void>();
let cache: Settings | null = null;

function load(): Settings {
  if (cache) return cache;
  try {
    cache = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    cache = { ...defaults };
  }
  return cache!;
}

export function updateSettings(patch: Partial<Settings>) {
  cache = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode: keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    load,
    () => defaults,
  );
  return [s, useCallback(updateSettings, [])];
}

/** Applies the theme to <html data-theme>, following prefers-color-scheme when set to "system". */
export function useApplyTheme() {
  const [{ theme }] = useSettings();
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}
