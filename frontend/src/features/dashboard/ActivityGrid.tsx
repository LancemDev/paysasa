import type { ColDef, GetRowIdParams, GridApi } from "ag-grid-community";
import type { CustomCellRendererProps } from "ag-grid-react";
import { AgGridReact } from "ag-grid-react";
import { Bot, CreditCard, Settings2, User } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { formatDateTime } from "@/lib/dates";
import { gridTheme, setupAgGrid } from "./agGrid";
import { TimeCell } from "./cells";
import { GridToolbar } from "./GridToolbar";
import type { ActivityRow } from "./rows";
import { useGridTransactions } from "./useGridTransactions";

setupAgGrid();

const ACTOR_ICON = { agent: Bot, user: User, paypal: CreditCard, system: Settings2 };

function ActorCell(p: CustomCellRendererProps<ActivityRow>) {
  if (!p.data) return null;
  const Icon = ACTOR_ICON[p.data.entry.actor] ?? Settings2;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden className="size-4 text-muted" />
      {p.data.actorLabel}
    </span>
  );
}

const signature = (r: ActivityRow) => String(r.id);

export default function ActivityGrid({ rows, onOpenEntity }: { rows: ActivityRow[]; onOpenEntity: (row: ActivityRow) => void }) {
  const [api, setApi] = useState<GridApi<ActivityRow> | null>(null);
  useGridTransactions(api, rows, signature);
  const columnDefs = useMemo<ColDef<ActivityRow>[]>(
    () => [
      { colId: "created_at", field: "created_at", headerName: "When", cellRenderer: TimeCell, sort: "desc", width: 140, pinned: "left", getQuickFilterText: (p) => formatDateTime(p.value) },
      { colId: "actor", field: "actorLabel", headerName: "Who", cellRenderer: ActorCell, width: 160, filter: "agSetColumnFilter" },
      { colId: "message", field: "message", headerName: "What happened", flex: 2, minWidth: 280, tooltipField: "message", filter: "agTextColumnFilter" },
      { colId: "event", field: "event", headerName: "Event", width: 210, cellClass: "font-mono text-xs text-muted", filter: "agSetColumnFilter" },
    ],
    [],
  );
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, filter: true }), []);
  const getRowId = useCallback((p: GetRowIdParams<ActivityRow>) => String(p.data.id), []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <GridToolbar api={api} searchLabel="Search activity" columns={[{ id: "event", label: "Event" }, { id: "actor", label: "Who" }]} />
      <div className="min-h-0 flex-1">
        <AgGridReact<ActivityRow>
          theme={gridTheme}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          onGridReady={(e) => setApi(e.api)}
          onRowClicked={(e) => e.data && onOpenEntity(e.data)}
          animateRows
          tooltipShowDelay={400}
        />
      </div>
    </div>
  );
}
