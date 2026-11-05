import { useT } from "@/lib/i18n";
import { usePayPalMode } from "@/lib/paypalMode";

/** Always visible, and worded from what the server reports, so nobody is unsure whether real money moves. */
export function ModeBanner() {
  const t = useT();
  const mode = usePayPalMode();
  return (
    <div role="note" className="flex items-center justify-center gap-2 bg-forest px-3 py-1.5 text-center text-xs font-medium text-white/90">
      <span aria-hidden className="pulse-dot size-1.5 shrink-0 rounded-full bg-lime text-lime" />
      <span>{t(mode === "sandbox" ? "banner.sandbox" : mode === "live" ? "banner.live" : "banner.mock")}</span>
    </div>
  );
}
