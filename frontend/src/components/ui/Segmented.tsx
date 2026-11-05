import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
  badge?: ReactNode;
}

/** Accessible tablist (arrow keys, Home/End). Panels must use id `${idPrefix}-panel-${key}`. */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  idPrefix,
  label,
}: {
  items: SegmentItem<K>[];
  value: K;
  onChange: (k: K) => void;
  idPrefix: string;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % items.length;
    if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(items[next].key);
      refs.current[next]?.focus();
    }
  };
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-full border border-border bg-surface-2 p-1">
      {items.map((item, i) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              selected ? "bg-surface text-fg shadow-[0_1px_2px_rgb(14_26_20/0.08),0_0_0_1px_var(--border)]" : "text-muted hover:text-fg",
            )}
          >
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}
