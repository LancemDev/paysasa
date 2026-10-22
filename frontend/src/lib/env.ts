/** Typed access to VITE_* variables. Missing required values are reported, not thrown, so the app can explain. */
const raw = import.meta.env;

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type PayPalMode = "mock" | "sandbox";

export const env = {
  apiBaseUrl: (raw.VITE_API_BASE_URL ?? "").replace(/\/+$/, ""),
  supabaseUrl: raw.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: raw.VITE_SUPABASE_ANON_KEY ?? "",
  paypalMode: (raw.VITE_PAYPAL_MODE === "sandbox" ? "sandbox" : "mock") as PayPalMode,
  enableDemo: raw.VITE_ENABLE_DEMO === "true",
  secondConfirmMinor: int(raw.VITE_APPROVAL_SECOND_CONFIRM_MINOR, 50_000),
  agGridLicenseKey: raw.VITE_AG_GRID_LICENSE_KEY ?? "",
};

export const missingEnv: string[] = [
  ["VITE_API_BASE_URL", env.apiBaseUrl],
  ["VITE_SUPABASE_URL", env.supabaseUrl],
  ["VITE_SUPABASE_ANON_KEY", env.supabaseAnonKey],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
