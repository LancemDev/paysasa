import type { ApiErrorCode } from "@/types/api";

export type ApiErrorKind = "network" | "http" | "aborted";

/** Every failed API call becomes an ApiError with a message that is safe to show to users. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: ApiErrorCode | string;
  /** The backend's own message (may be technical). Never shown raw; see `friendly`. */
  readonly detail: string;
  readonly friendly: string;

  constructor(opts: { kind: ApiErrorKind; status?: number; code?: string; detail?: string }) {
    const status = opts.status ?? 0;
    const code = opts.code ?? (opts.kind === "network" ? "network" : "http_error");
    const friendly = friendlyMessage(opts.kind, status, code, opts.detail ?? "");
    super(friendly);
    this.name = "ApiError";
    this.kind = opts.kind;
    this.status = status;
    this.code = code;
    this.detail = opts.detail ?? "";
    this.friendly = friendly;
  }

  get isConflict() {
    return this.status === 409;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  /** The request may or may not have reached the server (network error, timeout, unhandled 5xx). */
  get outcomeUnknown() {
    return this.kind === "network" || this.status >= 500;
  }
}

export function friendlyMessage(kind: ApiErrorKind, status: number, code: string, detail: string): string {
  if (kind === "aborted") return "Stopped.";
  if (kind === "network") return "We couldn't reach PaySasa. Check your connection and try again.";
  switch (code) {
    case "unauthorized":
      return "Your session has expired. Please sign in again.";
    case "not_found":
      return "We couldn't find that item. It may have been removed.";
    case "conflict":
      return conflictMessage(detail);
    case "invalid_request":
      return detail ? `Some details weren't accepted: ${humanizeValidation(detail)}` : "Some details weren't accepted.";
    case "agent_failed":
      return "PaySasa couldn't finish that request. Check the dashboard for anything already done, then try again.";
  }
  if (status === 502 || status === 503 || status === 504) return "PaySasa is temporarily unavailable. Please try again shortly.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return "That didn't work. Please try again.";
}

function conflictMessage(detail: string): string {
  // Backend: "Action is submitted, not awaiting approval" / "A contact with email x already exists"
  const action = /^Action is (\w+)/.exec(detail);
  if (action) return `This was already handled. It's now ${action[1].replace(/_/g, " ")}.`;
  if (/already exists/i.test(detail)) return "A contact with that email already exists.";
  const invoice = /^Invoice is (\w+)/.exec(detail);
  if (invoice) return `That invoice is already ${invoice[1]}.`;
  return "This was already handled.";
}

function humanizeValidation(detail: string): string {
  // "message: String should have at most 2000 characters" -> "message should have at most 2000 characters"
  return detail.replace(/:\s*(String|Value|Input)\s+/i, " ").replace(/^\w/, (c) => c.toLowerCase());
}

export function toUserMessage(err: unknown): string {
  if (err instanceof ApiError) return err.friendly;
  return "Something went wrong. Please try again.";
}
