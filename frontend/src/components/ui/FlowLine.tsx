import { Lock } from "lucide-react";
import { cn } from "./cn";

/** Daniel → you → Sarah, as a simple money path. */
export function FlowLine({
  from = "Daniel",
  via = "You",
  to = "Sarah",
  inAmount = "$1,200",
  outAmount = "$240",
  locked = true,
}: {
  from?: string;
  via?: string;
  to?: string;
  inAmount?: string;
  outAmount?: string;
  locked?: boolean;
}) {
  const node = (label: string, cls: string) => (
    <span className="flex flex-col items-center gap-1">
      <span className={cn("grid size-9 place-items-center rounded-full text-[13px] font-semibold", cls)}>{label.slice(0, 1)}</span>
      <span className="text-[12px] text-muted">{label}</span>
    </span>
  );
  const edge = (amount: string, locked?: boolean) => (
    <span className="relative -mt-5 flex flex-1 flex-col items-center">
      <span className="tabular mb-1 text-[12px] font-semibold">{amount}</span>
      <span className="h-px w-full bg-[repeating-linear-gradient(90deg,var(--border-strong)_0_6px,transparent_6px_10px)]" />
      {locked && <Lock aria-hidden className="absolute top-[18px] size-3 bg-surface text-locked" />}
    </span>
  );
  return (
    <div className="flex items-center gap-2 px-1">
      {node(from, "bg-info-soft text-info")}
      {edge(inAmount)}
      {node(via, "bg-forest text-lime")}
      {edge(outAmount, locked)}
      {node(to, "bg-lime-soft text-forest dark:text-lime")}
    </div>
  );
}

