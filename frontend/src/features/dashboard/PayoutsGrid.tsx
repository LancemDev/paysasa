import type { AutoGroupColumnDef, ColDef, GetRowIdParams, GridApi, RowClassRules } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useMemo, useState } from "react";
import { ACTION_STAGES } from "@/lib/status";
import { gridTheme, setupAgGrid } from "./agGrid";
import { ActionStatusCell, GroupInner, ReviewCell, TimeCell, TriggerCell } from "./cells";
import { compareMoney, formatMoneyCell, moneyFilterValue, moneyValue, sumByCurrency } from "./gridMoney";
import { GridToolbar } from "./GridToolbar";
import type { ActionRow } from "./rows";
import { useGridTransactions } from "./useGridTransactions";

setupAgGrid();

const STAGE_ORDER = Object.values(ACTION_STAGES).sort((a, b) => a.order - b.order).map((s) => s.label);
const signature = (r: ActionRow) => `${r.action.updated_at}|${r.triggerLabel}|${r.payeeName}|${r.triggerPaid}`;
const HIDEABLE = [
  { id: "type", label: "Type" },
  { id: "summary", label: "Summary" },
  { id: "trigger", label: "Trigger invoice" },
  { id: "created_at", label: "Created" },
];
const rowClassRules: RowClassRules<ActionRow> = { "row-locked": (p) => p.data?.action.status === "locked" };

export default function PayoutsGrid({ rows, onReview, onOpenInvoice }: { rows: ActionRow[]; onReview: (id: string) => void; onOpenInvoice: (id: string) => void }) {
  const [api, setApi] = useState<GridApi<ActionRow> | null>(null);
  useGridTransactions(api, rows, signature);

  const columnDefs = useMemo<ColDef<ActionRow>[]>(
    () => [
      { colId: "stage", field: "stageLabel", headerName: "Stage", rowGroup: true, hide: true },
      { colId: "status", headerName: "Status", field: "statusDisplay.label", cellRenderer: ActionStatusCell, filter: "agSetColumnFilter", width: 190 },
      { colId: "payee", field: "payeeName", headerName: "Recipient / client", minWidth: 150, flex: 1, filter: "agTextColumnFilter" },
      { colId: "type", field: "typeLabel", headerName: "Type", width: 110, filter: "agSetColumnFilter" },
      {
        colId: "amount",
        headerName: "Amount",
        valueGetter: (p) => moneyValue(p.data?.amount_minor ?? null, p.data?.currency ?? null),
        valueFormatter: formatMoneyCell,
        comparator: compareMoney,
        aggFunc: sumByCurrency,
        filter: "agNumberColumnFilter",
        filterValueGetter: (p) => moneyFilterValue(p.data?.amount_minor ?? null, p.data?.currency ?? null),
        type: "rightAligned",
        cellClass: "tabular font-medium",
        width: 180,
      },
      { colId: "summary", field: "summary", headerName: "Summary", hide: true, minWidth: 220, flex: 1.4, tooltipField: "summary", filter: "agTextColumnFilter" },
      { colId: "trigger", field: "triggerLabel", headerName: "Trigger invoice", minWidth: 240, flex: 1.2, cellRenderer: TriggerCell, cellRendererParams: { onOpenInvoice } },
      { colId: "created_at", field: "created_at", headerName: "Created", cellRenderer: TimeCell, sort: "desc", width: 140 },
      { colId: "review", headerName: "", cellRenderer: ReviewCell, cellRendererParams: { onReview }, pinned: "right", width: 130, cellClass: "flex items-center", sortable: false, filter: false, resizable: false, suppressHeaderMenuButton: true },
    ],
    [onReview, onOpenInvoice],
  );
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, filter: true }), []);
  const autoGroupColumnDef = useMemo<AutoGroupColumnDef<ActionRow>>(
    () => ({ headerName: "Stage", minWidth: 240, pinned: "left", cellRendererParams: { innerRenderer: GroupInner, suppressCount: true } }),
    [],
  );
  const getRowId = useCallback((p: GetRowIdParams<ActionRow>) => p.data.id, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <GridToolbar api={api} searchLabel="Search payouts and reminders" columns={HIDEABLE} />
      <div className="min-h-0 flex-1">
        <AgGridReact<ActionRow>
          theme={gridTheme}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          autoGroupColumnDef={autoGroupColumnDef}
          groupDefaultExpanded={1}
          suppressAggFuncInHeader
          grandTotalRow="bottom"
          initialGroupOrderComparator={({ nodeA, nodeB }) => STAGE_ORDER.indexOf(String(nodeA.key)) - STAGE_ORDER.indexOf(String(nodeB.key))}
          getRowId={getRowId}
          rowClassRules={rowClassRules}
          onGridReady={(e) => setApi(e.api)}
          onRowClicked={(e) => e.data && !e.node.group && onReview(e.data.id)}
          rowClass="cursor-pointer"
          animateRows
          tooltipShowDelay={400}
        />
      </div>
    </div>
  );
}
