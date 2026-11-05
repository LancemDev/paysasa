import {
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  DateFilterModule,
  HighlightChangesModule,
  ModuleRegistry,
  NumberFilterModule,
  QuickFilterModule,
  RowApiModule,
  RowStyleModule,
  TextFilterModule,
  TooltipModule,
  themeQuartz,
} from "ag-grid-community";
import { AggregationModule, LicenseManager, RowGroupingModule, SetFilterModule } from "ag-grid-enterprise";
import { env } from "@/lib/env";

let registered = false;

/** Register only the AG Grid modules we use (keeps the lazy chunk small). */
export function setupAgGrid() {
  if (registered) return;
  registered = true;
  if (env.agGridLicenseKey) LicenseManager.setLicenseKey(env.agGridLicenseKey);
  ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    ClientSideRowModelApiModule,
    RowApiModule,
    ColumnApiModule,
    TextFilterModule,
    NumberFilterModule,
    DateFilterModule,
    SetFilterModule,
    QuickFilterModule,
    HighlightChangesModule,
    CellStyleModule,
    RowStyleModule,
    TooltipModule,
    RowGroupingModule,
    AggregationModule,
  ]);
}

/** Quartz theme wired to our CSS tokens, so light/dark switch with the app. */
export const gridTheme = themeQuartz.withParams({
  fontFamily: "inherit",
  fontSize: 14,
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--text)",
  headerBackgroundColor: "var(--surface-2)",
  headerTextColor: "var(--text-muted)",
  headerFontWeight: 500,
  headerFontSize: 12.5,
  borderColor: "var(--border)",
  rowHoverColor: "var(--surface-2)",
  selectedRowBackgroundColor: "var(--accent-soft)",
  accentColor: "var(--accent)",
  oddRowBackgroundColor: "var(--surface)",
  cellHorizontalPadding: 14,
  rowHeight: 48,
  rowBorder: { color: "var(--border)" },
  headerHeight: 42,
  wrapperBorderRadius: 0,
  wrapperBorder: false,
  valueChangeValueHighlightBackgroundColor: "var(--flash)",
  rangeSelectionBorderColor: "var(--accent)",
  inputFocusBorder: { color: "var(--accent)" },
});
