import * as DM from "@radix-ui/react-dropdown-menu";
import type { GridApi } from "ag-grid-community";
import { Check, Columns3, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/** Quick search + column visibility for an AG Grid. */
export function GridToolbar<T>({
  api,
  searchLabel,
  columns,
  children,
}: {
  api: GridApi<T> | null;
  searchLabel: string;
  /** Hideable columns (colId -> label). */
  columns: { id: string; label: string }[];
  children?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [, force] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => api?.setGridOption("quickFilterText", search), 120);
    return () => window.clearTimeout(t);
  }, [api, search]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <div className="relative min-w-48 flex-1">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
        <label className="sr-only" htmlFor={`${searchLabel}-search`}>
          {searchLabel}
        </label>
        <input
          id={`${searchLabel}-search`}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchLabel}
          className="h-9 w-full rounded-[var(--radius-input)] border border-border bg-surface pr-3 pl-8 focus-visible:border-accent"
        />
      </div>
      {children}
      <DM.Root onOpenChange={() => force((n) => n + 1)}>
        <DM.Trigger asChild>
          <Button size="sm" variant="secondary" icon={<Columns3 aria-hidden className="size-4" />}>
            Columns
          </Button>
        </DM.Trigger>
        <DM.Portal>
          <DM.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-2">
            <DM.Label className="px-2 py-1.5 text-xs font-semibold text-muted uppercase">Show columns</DM.Label>
            {columns.map((c) => {
              const visible = api?.getColumn(c.id)?.isVisible() ?? true;
              return (
                <DM.CheckboxItem
                  key={c.id}
                  checked={visible}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) => {
                    api?.setColumnsVisible([c.id], !!v);
                    force((n) => n + 1);
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
                >
                  <span className="grid size-4 place-items-center rounded border border-border-strong">
                    <DM.ItemIndicator>
                      <Check aria-hidden className="size-3" />
                    </DM.ItemIndicator>
                  </span>
                  {c.label}
                </DM.CheckboxItem>
              );
            })}
          </DM.Content>
        </DM.Portal>
      </DM.Root>
    </div>
  );
}
