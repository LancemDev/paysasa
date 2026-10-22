import { env } from "../env";
import { supabase } from "../supabase";
import { ApiError } from "./errors";

type Json = Record<string, unknown> | unknown[] | undefined;

let onUnauthorized: (() => void) | null = null;
/** Called once when a token cannot be refreshed (session expired). */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function accessToken(forceRefresh = false): Promise<string | null> {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${env.apiBaseUrl}${path}`, { ...init, headers });
}

/** The one place the frontend talks to the FastAPI backend. Always resolves to data or throws ApiError. */
export async function request<T>(
  method: "GET" | "POST",
  path: string,
  opts: { body?: Json; signal?: AbortSignal; auth?: boolean } = {},
): Promise<T> {
  const init: RequestInit = {
    method,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  };
  const useAuth = opts.auth !== false;

  let res: Response;
  try {
    res = await send(path, init, useAuth ? await accessToken() : null);
    if (res.status === 401 && useAuth) {
      // The access token may have expired between refreshes; try once more with a fresh one.
      const fresh = await accessToken(true);
      if (fresh) res = await send(path, init, fresh);
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new ApiError({ kind: "aborted" });
    // fetch rejects on network failure, and on unhandled backend 500s (no CORS headers on those).
    throw new ApiError({ kind: "network", detail: e instanceof Error ? e.message : String(e) });
  }

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined; // plain-text error page; never shown to users
    }
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    const apiError = new ApiError({ kind: "http", status: res.status, code: err?.code, detail: err?.message });
    if (apiError.isUnauthorized && useAuth) onUnauthorized?.();
    throw apiError;
  }
  return data as T;
}
