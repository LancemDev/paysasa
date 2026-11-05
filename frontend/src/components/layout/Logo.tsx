/** PaySasa mark: a loop that closes (money out, money back) with a lime "now" dot. "Sasa" means "now" in Kiswahili. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className}>
      <rect width="32" height="32" rx="9" fill="var(--forest)" />
      <path d="M9 20.5a7.5 7.5 0 1 1 7 4.5" fill="none" stroke="var(--lime)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="25" r="2.2" fill="var(--lime)" />
    </svg>
  );
}

export function Logo({ compact, tone = "default" }: { compact?: boolean; tone?: "default" | "inverse" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      {!compact && (
        <span className={`font-[family-name:var(--font-display)] text-[19px] font-medium tracking-[-0.02em] ${tone === "inverse" ? "text-white" : "text-fg"}`}>
          PaySasa
        </span>
      )}
    </span>
  );
}
