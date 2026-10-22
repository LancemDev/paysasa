import type { AutoGroupColumnDef, ColDef, GetRowIdParams, GridApi, RowClickedEvent } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useMemo, useState } from "react";
import { formatDate } from "@/lib/dates";
import { INVOICE_GROUP_ORDER } from "@/lib/status";
import { gridTheme, setupAgGrid } from "./agGrid";
import { ClientCell, DueCell, GroupInner, InvoiceStatusCell, TimeCell } from "./cells";
import { compareMoney, formatMoneyCell, moneyFilterValue, moneyValue, sumByCurrency } from "./gridMoney";
import { GridToolbar } from "./GridToolbar";
import type { InvoiceRow } from "./rows";
import { useGridTransactions } from "./useGridTransactions";

setupAgGrid();

const signature = (r: InvoiceRow) => `${r.invoice.updated_at}|${r.statusLabel}|${r.clientName}|${r.payoutsSummary}|${r.openApprovals}`;
const HIDEABLE = [
  { id: "description", label: "Description" },
  { id: "dueDate", label: "Due" },
  { id: "ref", label: "PayPal ID" },
  { id: "payoutsSummary", label: "Linked payouts" },
  { id: "created_at", label: "Created" },
  { id: "statusCol", label: "Status" },
];

export default function InvoicesGrid({ rows, onOpen }: { rows: InvoiceRow[]; onOpen: (id: string) => void }) {
  const [api, setApi] = useState<GridApi<InvoiceRow> | null>(null);
  const [grouped, setGrouped] = useState(true);
  useGridTransactions(api, rows, signature);

  const columnDefs = useMemo<ColDef<InvoiceRow>[]>(
    () => [
      { colId: "statusGroup", field: "statusLabel", headerName: "Status", rowGroup: true, hide: true },
      { colId: "client", field: "clientName", headerName: "Client", cellRenderer: ClientCell, minWidth: 180, flex: 1.2, pinned: "left", filter: "agTextColumnFilter", getQuickFilterText: (p) => `${p.data?.clientName} ${p.data?.clientEmail}` },
      { colId: "description", field: "description", headerName: "Description", minWidth: 200, flex: 1.5, filter: "agTextColumnFilter", tooltipField: "description" },
      {
        colId: "amount",
        headerName: "Amount",
        valueGetter: (p) => moneyValue(p.data?.amount_minor ?? null, p.data?.currency ?? null),
        valueFormatter: formatMoneyCell,
        comparator: compareMoney,
        aggFunc: sumByCurrency,
        filter: "agNumberColumnFilter",
        filterValueGetter: (p) => moneyFilterValue(p.data?.amount_minor ?? null, p.data?.currency ?? null),
        getQuickFilterText: (p) => (p.data ? `${p.data.currency} ${formatMoneyCell({ value: moneyValue(p.data.amount_minor, p.data.currency) } as never)}` : ""),
        type: "rightAligned",
        cellClass: "tabular font-medium",
        minWidth: 170,
        width: 190,
      },
      { colId: "currency", field: "currency", headerName: "Currency", filter: "agSetColumnFilter", width: 110, hide: true },
      { colId: "statusCol", field: "statusLabel", headerName: "Status", cellRenderer: InvoiceStatusCell, filter: "agSetColumnFilter", width: 170 },
      {
        colId: "dueDate",
        field: "dueDate",
        headerName: "Due",
        cellRenderer: DueCell,
        filter: "agDateColumnFilter",
        filterValueGetter: (p) => (p.data?.dueDate ? new Date(`${p.data.dueDate}T00:00:00`) : null),
        getQuickFilterText: (p) => formatDate(p.data?.dueDate),
        width: 150,
      },
      { colId: "ref", field: "ref", headerName: "PayPal ID", cellClass: "font-mono text-xs", width: 170, filter: "agTextColumnFilter" },
      { colId: "payoutsSummary", field: "payoutsSummary", headerName: "Linked payouts", minWidth: 180, flex: 1, tooltipField: "payoutsSummary" },
      { colId: "created_at", field: "created_at", headerName: "Created", cellRenderer: TimeCell, sort: "desc", width: 140, filter: "agDateColumnFilter", filterValueGetter: (p) => (p.data ? new Date(p.data.created_at) : null) },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, filter: true, suppressHeaderMenuButton: false }), []);
  const autoGroupColumnDef = useMemo<AutoGroupColumnDef<InvoiceRow>>(
    () => ({ headerName: "Status", minWidth: 230, pinned: "left", cellRendererParams: { innerRenderer: GroupInner, suppressCount: true } }),
    [],
  );
  const getRowId = useCallback((p: GetRowIdParams<InvoiceRow>) => p.data.id, []);
  const onRowClicked = useCallback((e: RowClickedEvent<InvoiceRow>) => {
    if (e.data && !e.node.group) onOpen(e.data.id);
  }, [onOpen]);

  const toggleGrouping = () => {
    const next = !grouped;
    setGrouped(next);
    api?.setRowGroupColumns(next ? ["statusGroup"] : []);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <GridToolbar api={api} searchLabel="Search invoices" columns={HIDEABLE}>
        <label className="inline-flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={grouped} onChange={toggleGrouping} />
          Group by status
        </label>
      </GridToolbar>
      <div className="min-h-0 flex-1">
        <AgGridReact<InvoiceRow>
          theme={gridTheme}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          autoGroupColumnDef={autoGroupColumnDef}
          groupDefaultExpanded={1}
          groupDisplayType="singleColumn"
          grandTotalRow="bottom"
          suppressAggFuncInHeader
          initialGroupOrderComparator={({ nodeA, nodeB }) => INVOICE_GROUP_ORDER.indexOf(String(nodeA.key)) - INVOICE_GROUP_ORDER.indexOf(String(nodeB.key))}
          getRowId={getRowId}
          onGridReady={(e) => setApi(e.api)}
          onRowClicked={onRowClicked}
          rowClass="cursor-pointer"
          animateRows
          tooltipShowDelay={400}
          overlayNoRowsTemplate="<span>No invoices match your search.</span>"
        />
      </div>
    </div>
  );
}
