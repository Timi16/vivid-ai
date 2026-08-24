import "server-only";

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

// The base URL of the FastAPI service in vivid-backend. Server-only on purpose:
// it is deliberately not a NEXT_PUBLIC_ variable, so the browser never learns
// where the backend lives and a future API key has somewhere safe to go.
const BASE_URL = process.env.VIVID_API_BASE_URL ?? "http://localhost:8000";

// How long to wait on the backend before giving up.
const TIMEOUT_MS = 15_000;

export interface UpstreamError {
  code: string;
  message: string;
  details?: unknown;
}

// The envelope every route handler answers with. lib/api/envelope.ts is the
// only thing that reads it.
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { success: false, error: { code, message, details } satisfies UpstreamError },
    { status }
  );
}

/**
 * Call the backend and validate what comes back.
 *
 * Validation runs here, at the proxy boundary, because it is the last point
 * where a bad payload can be turned into a useful error instead of a render
 * crash. A component only ever sees a value that matched the schema.
 */
export async function proxy<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {}
): Promise<NextResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    // A refused connection means the backend is not running. That reads as
    // "not available yet" rather than a fault the user can retry away.
    console.error(`Upstream request to ${path} failed:`, error);
    return fail("SERVICE_UNAVAILABLE", "The backend is not reachable right now.", 502);
  }

  const text = await res.text();

  if (!res.ok) {
    // FastAPI puts its message under `detail`. Keep it when it is there.
    let message = text.trim() || "The backend returned an error.";
    try {
      const body = JSON.parse(text) as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // Not JSON. The plain text above is the best message available.
    }
    return fail(res.status === 404 ? "NOT_FOUND" : "UPSTREAM_ERROR", message, res.status);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return fail("BAD_RESPONSE", "The backend returned a response we could not read.", 502);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    // Log the reason, but do not hand the schema internals to the browser.
    console.error(`Upstream payload from ${path} failed validation:`, parsed.error.issues);
    return fail("BAD_RESPONSE", "The backend returned an unexpected response.", 502);
  }

  return ok(parsed.data);
}
