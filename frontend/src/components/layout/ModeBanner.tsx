import { env } from "@/lib/env";
import { useT } from "@/lib/i18n";

/** Always visible so judges and users know no real money moves. */
export function ModeBanner() {
  const t = useT();
  const sandbox = env.paypalMode === "sandbox";
  return (
    <div role="note" className="flex items-center justify-center gap-2 bg-forest px-3 py-1.5 text-center text-xs font-medium text-white/90">
      <span aria-hidden className="pulse-dot size-1.5 shrink-0 rounded-full bg-lime text-lime" />
      <span>{sandbox ? t("banner.sandbox") : t("banner.mock")}</span>
    </div>
  );
}
