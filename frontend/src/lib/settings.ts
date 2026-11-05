import { useCallback, useEffect, useSyncExternalStore } from "react";
import { env } from "./env";

/** Device-local preferences (the backend has no settings/profile endpoint). */
export interface Settings {
  theme: "system" | "light" | "dark";
  /** Payouts at or above this many minor units need a second confirmation. */
  secondConfirmMinor: number;
  onboardingDismissed: boolean;
  /** Interface language. Swahili covers the landing page and the main app surfaces. */
  lang: "en" | "sw";
  /** The first-run setup guide was finished or skipped. */
  setupDone: boolean;
  /** Accessibility: text size, high contrast and motion (on top of the OS settings). */
  textSize: "md" | "lg" | "xl";
  highContrast: boolean;
  reduceMotion: boolean;
}

const KEY = "paysasa.settings.v1";
const defaults: Settings = { theme: "system", secondConfirmMinor: env.secondConfirmMinor, onboardingDismissed: false, lang: "en", setupDone: false, textSize: "md", highContrast: false, reduceMotion: false };
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

/** Keeps <html lang> in sync with the chosen language, for screen readers and hyphenation. */
export function useApplyLang() {
  const [{ lang }] = useSettings();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
}

/** Resolved light/dark, following the OS when the theme is "system". */
export function useResolvedTheme(): "light" | "dark" {
  const [{ theme }] = useSettings();
  const dark = useSyncExternalStore(
    (l) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", l);
      return () => mq.removeEventListener("change", l);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return theme === "dark" || (theme === "system" && dark) ? "dark" : "light";
}

/** Text size, contrast and motion preferences go on <html data-*>, where the CSS tokens pick them up. */
export function useApplyDisplay() {
  const [{ textSize, highContrast, reduceMotion }] = useSettings();
  useEffect(() => {
    const d = document.documentElement.dataset;
    d.text = textSize;
    d.contrast = highContrast ? "high" : "normal";
    d.motion = reduceMotion ? "reduce" : "system";
  }, [textSize, highContrast, reduceMotion]);
}
