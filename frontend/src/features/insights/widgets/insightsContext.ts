import { createContext, useContext } from "react";
import type { Contact, Invoice, PendingAction } from "@/types/api";

/** Live (or demo sample) rows for the custom Studio widgets, which render as portals inside our React tree. */
export interface InsightsData {
  actions: PendingAction[];
  invoices: Invoice[];
  contacts: Contact[];
  sample: boolean;
}

export const InsightsDataContext = createContext<InsightsData>({ actions: [], invoices: [], contacts: [], sample: false });
export const useInsightsData = () => useContext(InsightsDataContext);
