"use client";

// Every route handler in app/api answers with { success, data | error }. This
// unwraps that envelope into a value or a typed error. It lives here rather
// than under one service so every feature fails the same way, and a new service
// does not arrive with its own copy of the logic.
//
// The upstream FastAPI service does not speak this envelope. The route handler
// puts it on, which is the same boundary where the payload is validated, so a
// raw upstream shape never reaches a component.

export interface VividApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown
): VividApiError {
  const error = new Error(message) as VividApiError;
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function parseBody(text: string): unknown | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function fallbackCode(status: number): string {
  if (status === 404) return "NOT_FOUND";
  if (status >= 500) return "SERVICE_UNAVAILABLE";
  return "BAD_RESPONSE";
}

// Preserve a plain-text upstream error when one exists. Collapsing it into
// SERVICE_UNAVAILABLE hides the only clue the caller has about what failed.
export async function unwrap<T>(res: Response, fallbackMessage: string): Promise<T> {
  const text = await res.text();
  const body = parseBody(text) as { success?: boolean; data?: T; error?: VividApiError } | null;
  if (res.ok && body && body.success === true) return body.data as T;
  const err = body?.error;
  const message = err?.message ?? (text.trim() || fallbackMessage);
  throw apiError(err?.code ?? fallbackCode(res.status), message, res.status, err?.details);
}

// True when a failure means "nothing configured yet" rather than a real outage,
// so screens can show a plain empty state instead of an error.
export function isUnconfigured(error: unknown): boolean {
  const code = (error as VividApiError | null)?.code;
  return code === "NOT_CONFIGURED" || code === "SERVICE_UNAVAILABLE";
}

// The error code a failed call carried, or null when the throw did not come
// from a route handler at all (a network drop, a bug in our own code).
export function errorCode(error: unknown): string | null {
  return (error as VividApiError | null)?.code ?? null;
}
