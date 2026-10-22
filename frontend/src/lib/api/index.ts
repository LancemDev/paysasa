import type {
  ActionResponse,
  AgentMessageResponse,
  CreateContactRequest,
  CreateContactResponse,
  HealthResponse,
  RunChaseResponse,
  SimulatePaidResponse,
  Uuid,
} from "@/types/api";
import { request } from "./client";

export { ApiError, toUserMessage } from "./errors";
export { setUnauthorizedHandler } from "./client";

export const api = {
  health: () => request<HealthResponse>("GET", "/health", { auth: false }),

  sendAgentMessage: (message: string, signal?: AbortSignal) =>
    request<AgentMessageResponse>("POST", "/api/agent/message", { body: { message }, signal }),

  approveAction: (id: Uuid, message?: string) =>
    request<ActionResponse>("POST", `/api/actions/${id}/approve`, { body: message ? { message } : {} }),

  rejectAction: (id: Uuid, reason?: string) =>
    request<ActionResponse>("POST", `/api/actions/${id}/reject`, { body: reason ? { reason } : {} }),

  createContact: (body: CreateContactRequest) =>
    request<CreateContactResponse>("POST", "/api/contacts", { body: body as unknown as Record<string, unknown> }),

  // Demo/rehearsal helpers: only mounted when the backend has ENABLE_DEV_ROUTES=true.
  dev: {
    simulatePaid: (invoiceId: Uuid) => request<SimulatePaidResponse>("POST", `/dev/simulate-paid/${invoiceId}`),
    runChase: () => request<RunChaseResponse>("POST", "/dev/run-chase"),
  },
};
