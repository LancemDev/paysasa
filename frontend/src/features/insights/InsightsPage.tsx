import type { AgReportState, AgStudioApi, AgStudioMode } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { BarChart3, Pencil, RotateCcw, Save, Undo2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { env } from "@/lib/env";
import { useActions, useActivity, useContacts, useInvoices } from "@/lib/queries";
import { sampleHistory } from "./sampleHistory";
import { buildRows, buildStudioData, type StudioInput } from "./studioData";
import { PAGE_TITLES, defaultReport } from "./studioReport";
import { paysasaStudioTheme } from "./studioTheme";
import { InsightsDataContext } from "./widgets/insightsContext";
import { paysasaWidgets } from "./widgets/registry";

const STORAGE_KEY = "paysasa.insights.report.v1";

function loadSaved(): AgReportState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AgReportState;
  } catch {
    /* fall through to the default report */
  }
  return defaultReport;
}

/**
 * Insights: a self-serve AG Studio dashboard over PaySasa's live data. Users can rearrange it, add charts and
 * save their own layout (on this device). Two custom widgets keep the money guardrail visible.
 */
export default function InsightsPage() {
  const toast = useToast();
  const invoices = useInvoices();
  const actions = useActions();
  const contacts = useContacts();
  const activity = useActivity();
  const apiRef = useRef<AgStudioApi | null>(null);
  const [initialState] = useState(loadSaved);
  const [selectedPage, setSelectedPage] = useState(initialState.selectedPageId);
  const [pages, setPages] = useState(() => initialState.pages.map((p) => p.id));
  const [mode, setMode] = useState<AgStudioMode>("view");
  const [canUndo, setCanUndo] = useState(false);
  const [useSample, setUseSample] = useState(false);
  const loading = invoices.isLoading || actions.isLoading || contacts.isLoading || activity.isLoading;

  const input: StudioInput = useMemo(() => {
    const live: StudioInput = { invoices: invoices.data ?? [], actions: actions.data ?? [], contacts: contacts.data ?? [], activity: activity.data ?? [] };
    if (!useSample) return live;
    const s = sampleHistory();
    return {
      invoices: [...live.invoices, ...s.invoices],
      actions: [...live.actions, ...s.actions],
      contacts: [...live.contacts, ...s.contacts],
      activity: [...live.activity, ...s.activity],
    };
  }, [invoices.data, actions.data, contacts.data, activity.data, useSample]);
  const studioData = useMemo(() => buildStudioData(buildRows(input)), [input]);
  const widgetData = useMemo(() => ({ actions: input.actions, invoices: input.invoices, contacts: input.contacts, sample: useSample }), [input, useSample]);

  const selectPage = (id: string) => {
    const api = apiRef.current;
    if (api) api.setState({ ...api.getState(), selectedPageId: id });
    setSelectedPage(id);
  };
  const save = () => {
    const api = apiRef.current;
    if (!api) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(api.getState()));
    setMode("view");
    toast.success("Dashboard saved", "Your layout is saved on this device.");
  };
  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    apiRef.current?.setState(defaultReport);
    apiRef.current?.clearHistory();
    setPages(defaultReport.pages.map((p) => p.id));
    setSelectedPage(defaultReport.selectedPageId);
    toast.info("Dashboard reset to the PaySasa overview");
  };

  return (
    <div className="flex flex-col">
      <header className="mx-auto flex w-full max-w-[1320px] flex-wrap items-end gap-3 px-4 pt-8 pb-5 sm:px-6">
        <div className="mr-auto">
          <h1 className="display flex items-center gap-2 text-[36px]">
            <BarChart3 aria-hidden className="size-6 text-[var(--chart-money)]" /> Insights
          </h1>
          <p className="mt-1 text-[14px] text-muted">Build your own views of invoices, payouts and assistant activity. Drag, resize and save. Powered by AG Studio.</p>
        </div>
        {env.enableDemo && (
          <label className="inline-flex items-center gap-2 rounded-full border border-dashed border-warning/60 bg-warning-soft/50 px-3 py-1.5 text-[13px]">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={useSample} onChange={(e) => setUseSample(e.target.checked)} />
            Include sample history <span className="text-muted">(demo only)</span>
          </label>
        )}
        {mode === "view" ? (
          <Button size="sm" icon={<Pencil aria-hidden className="size-4" />} onClick={() => setMode("edit")}>
            Customise
          </Button>
        ) : (
          <>
            <Button size="sm" variant="ghost" disabled={!canUndo} onClick={() => apiRef.current?.undo()} icon={<Undo2 aria-hidden className="size-4" />}>
              Undo
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} icon={<RotateCcw aria-hidden className="size-4" />}>
              Reset
            </Button>
            <Button size="sm" variant="primary" onClick={save} icon={<Save aria-hidden className="size-4" />}>
              Save layout
            </Button>
          </>
        )}
      </header>
      <div className="flex items-center gap-3 border-y border-border bg-surface px-4 py-2.5 sm:px-6">
        <Segmented
          idPrefix="insights"
          label="Dashboard pages"
          value={selectedPage}
          onChange={selectPage}
          items={pages.map((id, i) => ({ key: id, label: PAGE_TITLES[id] ?? `Page ${i + 1}` }))}
        />
        {useSample && (
          <span role="status" className="rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-white dark:text-bg">
            Showing sample data
          </span>
        )}
      </div>
      <div role="tabpanel" id={`insights-panel-${selectedPage}`} aria-labelledby={`insights-tab-${selectedPage}`} className="h-[calc(100dvh-13rem)] min-h-[640px]">
        {loading ? (
          <SkeletonRows rows={10} label="Loading insights" />
        ) : (
          <InsightsDataContext.Provider value={widgetData}>
            <AgStudioProvider licenseKey={env.agStudioLicenseKey || undefined}>
              <AgStudio
                // Remount when switching sample data on/off so every widget re-reads its sources.
                key={useSample ? "sample" : "live"}
                style={{ height: "100%", width: "100%" }}
                theme={paysasaStudioTheme}
                layout={{ widgetBorderEnabled: true }}
                data={studioData}
                widgets={paysasaWidgets as never}
                initialState={initialState}
                mode={mode}
                onApiReady={(e) => {
                  apiRef.current = e.api;
                }}
                onStateUpdated={(e) => {
                  setCanUndo(e.api.getHistory().undo.length > 0);
                  setSelectedPage(e.state.selectedPageId);
                  setPages(e.state.pages.map((p) => p.id));
                }}
              />
            </AgStudioProvider>
          </InsightsDataContext.Provider>
        )}
      </div>
    </div>
  );
}
