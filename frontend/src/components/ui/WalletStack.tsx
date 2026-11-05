import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "./cn";

export interface WalletCard {
  id: string;
  kind: string;
  name: string;
  amount: string;
  meta?: string;
  status?: ReactNode;
  tone: "lime" | "paper" | "mint";
}

const TONES: Record<WalletCard["tone"], string> = {
  lime: "bg-[linear-gradient(140deg,#d9f78f_0%,#c8f169_45%,#a9d94a_100%)] text-[#0b2a1e]",
  paper: "bg-[linear-gradient(140deg,#ffffff_0%,#f3f1ea_60%,#e7e4d9_100%)] text-[#0e1a14]",
  mint: "bg-[linear-gradient(140deg,#e4f1e6_0%,#c7e2cd_55%,#a8cfb2_100%)] text-[#0b2a1e]",
};

const spring = { type: "spring" as const, stiffness: 260, damping: 22 };

/**
 * A wallet of money "cards" (invoices and payouts). Cards rest tucked in the pocket, fan out on hover, focus
 * or tap, and one can be pulled up. Adapted from a physical card-wallet pattern: the pocket shows the total,
 * the cards show what makes it up. Works with keyboard (cards are buttons) and respects reduced motion.
 */
export function WalletStack({
  cards,
  label,
  total,
  hint,
  onSelect,
  intro,
  className,
}: {
  cards: WalletCard[];
  label: string;
  total: string;
  hint?: string;
  /** If given, picking a card calls this (e.g. open the invoice). Otherwise the card is pulled up in place. */
  onSelect?: (id: string) => void;
  /** Fan the cards out briefly on first view, to show they're interactive. */
  intro?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!intro || reduce) return;
    const a = setTimeout(() => setHover(true), 900);
    const b = setTimeout(() => setHover(false), 2600);
    return () => (clearTimeout(a), clearTimeout(b));
  }, [intro, reduce]);
  const [active, setActive] = useState<string | null>(null);
  const shown = cards.slice(0, 3);
  const n = shown.length;
  const open = hover || active !== null;

  return (
    <div className={cn("relative mx-auto w-full max-w-[340px] pt-14 select-none", className)}>
      <div
        className="relative h-[250px] [perspective:1200px]"
        onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && (setHover(false), setActive(null))}
        onFocus={() => setHover(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && (setHover(false), setActive(null))}
      >
        {/* Back of the wallet, for depth */}
        <div aria-hidden className="absolute inset-x-1 bottom-0 h-[150px] translate-y-2 rounded-[22px] bg-[#04140d]" />

        {/* Cards */}
        <div className="absolute inset-x-5 bottom-[40px] h-[150px]">
          {shown.map((c, i) => {
            const isActive = active === c.id;
            const fromTop = n - 1 - i; // 0 = front-most card
            const y = isActive ? -150 : open ? -72 - fromTop * 40 : -42 - fromTop * 14;
            return (
              <motion.button
                key={c.id}
                type="button"
                onClick={() => (onSelect ? onSelect(c.id) : setActive(isActive ? null : c.id))}
                initial={false}
                animate={{
                  y,
                  scale: isActive ? 1.04 : 1 - fromTop * 0.035,
                  rotateX: open && !isActive ? -6 : 0,
                }}
                transition={reduce ? { duration: 0 } : spring}
                style={{ zIndex: isActive ? 30 : 10 + i, transformOrigin: "bottom center" }}
                className={cn(
                  "absolute inset-x-0 top-0 h-[150px] overflow-hidden rounded-[18px] p-4 text-left shadow-[0_18px_40px_-14px_rgb(0_0_0/0.55)] ring-1 ring-black/5 outline-offset-4",
                  TONES[c.tone],
                )}
              >
                <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-white/25 blur-2xl" />
                <span className="relative flex items-start justify-between gap-2">
                  <span className="text-[10.5px] font-semibold tracking-[0.14em] uppercase opacity-70">{c.kind}</span>
                  {c.status}
                </span>
                <span className="relative mt-1 block truncate text-[15px] font-semibold">{c.name}</span>
                <span className="relative mt-5 flex items-end justify-between gap-2">
                  <span className="display tabular text-[26px] leading-none">{c.amount}</span>
                  {c.meta && <span className="text-[11px] font-medium opacity-70">{c.meta}</span>}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Pocket */}
        <motion.div
          aria-hidden={false}
          onClick={() => setHover((h) => !h)}
          initial={false}
          animate={{ rotateX: open ? 6 : 0, y: open ? 4 : 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 20 }}
          style={{ transformOrigin: "bottom center" }}
          className="grain absolute inset-x-0 bottom-0 z-20 flex h-[150px] flex-col justify-end overflow-hidden rounded-[22px] bg-[radial-gradient(120%_90%_at_20%_0%,#1a5a42_0%,#0b3d2c_45%,#062619_100%)] p-5 text-white shadow-[0_30px_60px_-18px_rgb(0_0_0/0.7)] ring-1 ring-white/10"
        >
          <span aria-hidden className="absolute inset-2.5 rounded-[16px] border border-dashed border-white/15" />
          <span aria-hidden className="absolute inset-x-10 top-0 h-1 rounded-b-lg bg-black/40 blur-[1px]" />
          <span className="relative text-[11px] font-semibold tracking-[0.18em] text-lime/80 uppercase">{label}</span>
          <span className="display tabular relative mt-1 text-[34px] leading-none">{total}</span>
        </motion.div>
      </div>
      {hint && <p className="mt-3 text-center text-xs text-white/70">{hint}</p>}
    </div>
  );
}
