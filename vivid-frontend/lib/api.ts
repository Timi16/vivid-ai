"use client";

// Fetch wrapper for our own API routes. Every client call goes through here so
// there is one place to add auth headers, and one place a component's request
// can be traced from.
//
// Paths are always root-relative ("/api/health"). A component never holds the
// upstream base URL: that lives on the server, in the route handler.
//
// There is no auth yet. When it arrives, the access token is attached here
// rather than at each call site, and this is where a cold token becomes a
// retryable error instead of a 401.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  return fetch(path, { ...init, headers });
}
