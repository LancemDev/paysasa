import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { env, type PayPalMode } from "@/lib/env";

/**
 * The PayPal mode the backend reports on /health. Falls back to VITE_PAYPAL_MODE only while
 * loading or if the server is older, so the banner always matches what the server really does.
 */
export function usePayPalMode(): PayPalMode {
  const { data } = useQuery({ queryKey: ["health"], queryFn: api.health, retry: 1, staleTime: 60_000 });
  return data?.paypal ?? env.paypalMode;
}
