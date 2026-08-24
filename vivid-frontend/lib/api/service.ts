"use client";

import { apiFetch } from "@/lib/api";
import { unwrap } from "@/lib/api/envelope";

export type QueryParams = Record<string, string | number | boolean | undefined>;

function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

// Strict servers reject a JSON content-type with an empty body.
function bodyInit(method: string, body: unknown): RequestInit {
  if (body === undefined) return { method };
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export interface ServiceClient {
  get<T>(path: string, params?: QueryParams): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string, body?: unknown): Promise<T>;
}

// A service is defined by two facts: where its route handlers live, and what to
// say when a failure carries no message of its own. Do not write another
// wrapper around fetch.
export function createServiceClient(basePath: string, fallbackMessage: string): ServiceClient {
  const url = (path: string, params?: QueryParams) => `${basePath}${path}${buildQuery(params)}`;

  const call = <T>(path: string, init: RequestInit): Promise<T> =>
    apiFetch(path, init).then((res) => unwrap<T>(res, fallbackMessage));

  return {
    get: <T>(path: string, params?: QueryParams) => call<T>(url(path, params), {}),
    post: <T>(path: string, body?: unknown) => call<T>(url(path), bodyInit("POST", body)),
    put: <T>(path: string, body?: unknown) => call<T>(url(path), bodyInit("PUT", body)),
    del: <T>(path: string, body?: unknown) => call<T>(url(path), bodyInit("DELETE", body)),
  };
}
