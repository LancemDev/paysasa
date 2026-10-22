import { studioTheme } from "ag-studio";

// AG Studio theme built from PaySasa's CSS tokens (src/index.css), so light/dark and brand changes apply to
// Studio's canvas, widgets, grids and charts together. Chart series use the validated categorical palette.
const v = (name: string) => `var(--${name})`;
const line = (name: string) => ({ width: 1, color: v(name) });
const palette = Object.fromEntries(
  Array.from({ length: 8 }, (_, i) => [
    [`chartPaletteFills${i + 1}Color`, v(`chart-${i + 1}`)],
    [`chartPaletteStrokes${i + 1}Color`, v(`chart-${i + 1}`)],
  ]).flat(),
);
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const paysasaStudioTheme = studioTheme.withParams({
  fontFamily: FONT,
  fontSize: 14,
  textColor: v("text"),
  foregroundColor: v("text"),
  subtleTextColor: v("text-muted"),
  backgroundColor: v("surface"),
  borderColor: v("border"),
  accentColor: v("accent"),
  iconColor: v("text-muted"),
  rowHoverColor: v("surface-2"),

  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: v("bg"),
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: v("bg"),
  studioCanvasPadding: 16,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: FONT,

  studioWidgetBackgroundColor: v("surface"),
  studioWidgetBorder: line("border"),
  studioWidgetBorderRadius: 10,
  studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: FONT,
  studioWidgetTitleFontSize: 15,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: v("text"),
  studioWidgetSubtitleFontFamily: FONT,
  studioWidgetSubtitleFontSize: 13,
  studioWidgetSubtitleTextColor: v("text-muted"),
  studioWidgetCaptionFontFamily: FONT,
  studioWidgetCaptionFontSize: 12,
  studioWidgetCaptionTextColor: v("text-muted"),
  studioWidgetResizeBorderColor: v("accent"),

  studioPanelContainerBackgroundColor: v("surface"),
  studioPanelContainerBorder: line("border"),
  studioPanelContainerBorderRadius: 0,
  studioPanelDividerColor: v("border"),
  studioPanelDividerActiveColor: v("accent"),
  studioPanelSectionBorderColor: v("border"),
  studioPanelHeaderFontFamily: FONT,
  studioPanelHeaderFontWeight: 600,
  studioPanelChevronButtonHoverBackgroundColor: v("surface-2"),
  studioPanelChevronButtonHoverColor: v("accent"),
  studioToggleButtonActiveBackgroundColor: v("accent-soft"),
  studioToggleButtonActiveBorderColor: v("accent"),
  studioToggleButtonActiveColor: v("accent"),

  gridFontFamily: FONT,
  gridFontSize: 13,
  gridCellTextColor: v("text"),
  gridHeaderBackgroundColor: v("surface"),
  gridHeaderTextColor: v("text-muted"),
  gridHeaderFontWeight: 600,
  gridHeaderFontSize: 12,
  gridRowHeight: 38,
  gridRowBorder: line("gridline"),
  gridHeaderRowBorder: line("border"),
  gridPinnedRowBorder: line("border"),
  gridRowHoverColor: v("surface-2"),
  gridWrapperBorder: false,

  chartFontFamily: FONT,
  chartTextColor: v("text"),
  chartSubtleTextColor: v("text-muted"),
  chartAxisLineColor: v("border"),
  chartGridLineColor: v("gridline"),
  ...palette,
});
