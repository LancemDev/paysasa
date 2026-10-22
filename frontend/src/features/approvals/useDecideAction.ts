import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { PendingAction } from "@/types/api";
import { ApiError, api } from "@/lib/api";
import { qk, upsertInCache } from "@/lib/queries";

export type Decision = "approve" | "reject";

export type DecisionOutcome =
  | { kind: "idle" }
  | { kind: "pending"; decision: Decision }
  /** The backend answered; the live row's status says what happened. */
  | { kind: "answered"; decision: Decision }
  /** Someone else (another tab, a double click) already decided; message explains the current state. */
  | { kind: "conflict"; decision: Decision; message: string }
  /** We don't know if the request reached the backend; the live row (after refetch) tells us. */
  | { kind: "unknown"; decision: Decision }
  /** The request was refused before anything changed (validation, not found...). Safe to retry. */
  | { kind: "error"; decision: Decision; message: string };

/**
 * Approve or reject one pending action. Guards against double submits (a ref, not just disabled state),
 * never assumes success, and reconciles with the server after conflicts or unknown outcomes.
 */
export function useDecideAction(actionId: string) {
  const qc = useQueryClient();
  const inflight = useRef(false);
  const [outcome, setOutcome] = useState<DecisionOutcome>({ kind: "idle" });

  const run = useCallback(
    async (decision: Decision, text?: string) => {
      if (inflight.current) return;
      inflight.current = true;
      setOutcome({ kind: "pending", decision });
      try {
        const { action } =
          decision === "approve" ? await api.approveAction(actionId, text) : await api.rejectAction(actionId, text);
        upsertInCache<PendingAction>(qc, qk.actions, action);
        setOutcome({ kind: "answered", decision });
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError({ kind: "network" });
        if (err.isConflict) {
          await qc.refetchQueries({ queryKey: qk.actions });
          setOutcome({ kind: "conflict", decision, message: err.friendly });
        } else if (err.outcomeUnknown) {
          await qc.refetchQueries({ queryKey: qk.actions }).catch(() => undefined);
          setOutcome({ kind: "unknown", decision });
        } else {
          setOutcome({ kind: "error", decision, message: err.friendly });
        }
      } finally {
        inflight.current = false;
      }
    },
    [actionId, qc],
  );

  const reset = useCallback(() => setOutcome({ kind: "idle" }), []);
  return { outcome, approve: (message?: string) => run("approve", message), reject: (reason?: string) => run("reject", reason), reset };
}
