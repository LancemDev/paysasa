import type { GridApi } from "ag-grid-community";
import { useEffect, useRef } from "react";

/**
 * Keeps the grid in sync with query data through AG Grid transactions: the first load sets rowData, after that
 * only added/changed/removed rows are applied, so rows update in place (no reload, no scroll jump) and the
 * changed rows flash briefly.
 */
export function useGridTransactions<T extends { id: string | number }>(api: GridApi<T> | null, rows: T[] | undefined, signature: (row: T) => string) {
  const prev = useRef<Map<string | number, string> | null>(null);

  useEffect(() => {
    if (!api || !rows || api.isDestroyed()) return;
    if (prev.current === null) {
      api.setGridOption("rowData", rows);
      prev.current = new Map(rows.map((r) => [r.id, signature(r)]));
      return;
    }
    const before = prev.current;
    const next = new Map<string | number, string>();
    const add: T[] = [];
    const update: T[] = [];
    for (const r of rows) {
      const sig = signature(r);
      next.set(r.id, sig);
      const old = before.get(r.id);
      if (old === undefined) add.push(r);
      else if (old !== sig) update.push(r);
    }
    const remove = [...before.keys()].filter((id) => !next.has(id)).map((id) => ({ id }) as T);
    prev.current = next;
    if (!add.length && !update.length && !remove.length) return;

    const result = api.applyTransaction({ add, update, remove, addIndex: 0 });
    const changed = [...(result?.add ?? []), ...(result?.update ?? [])];
    if (changed.length) api.flashCells({ rowNodes: changed, flashDuration: 600, fadeDuration: 400 });
  }, [api, rows, signature]);
}
