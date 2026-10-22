export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      <svg aria-hidden viewBox="0 0 32 32" className="size-7">
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M10 22V10h7a4.5 4.5 0 0 1 0 9h-4" fill="none" stroke="var(--accent-fg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <span className="text-base">
          PaySasa <span className="text-accent">AI</span>
        </span>
      )}
    </span>
  );
}
