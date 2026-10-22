import { FlaskConical } from "lucide-react";
import { env } from "@/lib/env";

/** Always visible so judges and users know no real money moves. */
export function ModeBanner() {
  const sandbox = env.paypalMode === "sandbox";
  return (
    <div role="note" className="flex items-center justify-center gap-2 bg-[#1e293b] px-3 py-1.5 text-center text-xs font-medium text-white">
      <FlaskConical aria-hidden className="size-3.5 shrink-0" />
      <span>
        {sandbox ? "PayPal sandbox mode" : "Test mode: PayPal is simulated"}. No real money moves.
      </span>
    </div>
  );
}
