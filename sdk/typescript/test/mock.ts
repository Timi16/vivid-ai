/**
 * A fake Vivid API as a `fetch` double.
 *
 * Real HTTP against a real backend belongs in the compose smoke test. These
 * tests exist to pin down SDK behaviour — ranking, staleness, redaction, retry
 * policy, error mapping — which is exactly the part a live server would make
 * slow and flaky to check.
 */

export interface Recorded {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: any;
}

export interface MockOptions {
  /** Make the next N calls fail, so retry policy can be observed. */
  failTimes?: number;
  failStatus?: number;
}

export const SNAPSHOT_BODY = {
  url: "https://example.com/",
  title: "Example",
  headings: ["Welcome"],
  text: "some page text",
  snapshot: "PAGE: Example ...",
  elements: [
    { tag: "a", type: "", label: "Search products" },
    { tag: "button", type: "", label: "Search" },
    { tag: "input", type: "email", label: "Email" },
    { tag: "input", type: "password", label: "Password" },
    { tag: "button", type: "", label: "Sign in" },
  ],
};

const TASK_SSE = [
  "event: step",
  'data: {"action": "goto", "url": "https://example.com/"}',
  "",
  "event: step",
  'data: {"action": "click", "label": "Pricing", "url": "https://example.com/pricing"}',
  "",
  "event: result",
  'data: {"answer": "Enterprise is $99/seat.", "url": "https://example.com/pricing",',
  'data:  "session_id": "bs_1", "steps": []}',
  "",
  "data: [DONE]",
  "",
].join("\n");

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createMock(options: MockOptions = {}) {
  const calls: Recorded[] = [];
  // A real server issues a new id per snapshot, since refs are renumbered each
  // time. The mock must too, or staleness can never be observed.
  let snapshots = 0;
  let remainingFailures = options.failTimes ?? 0;

  const fetchImpl = async (input: any, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    );

    let body: any = undefined;
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    } else if (init.body instanceof FormData) {
      body = Object.fromEntries(
        [...init.body.entries()].map(([k, v]) => [k, v instanceof Blob ? `<blob:${v.size}>` : v]),
      );
    }

    const path = url.pathname;
    calls.push({ method, path, headers, body });

    if (remainingFailures > 0) {
      remainingFailures -= 1;
      return json(options.failStatus ?? 503, {
        error: {
          code: "capacity_exceeded",
          message: "browser tier is full",
          request_id: "req_retry",
        },
      });
    }

    if (path === "/v1/browser/sessions" && method === "POST") {
      return json(201, {
        id: "bs_1",
        allowed_domains: body?.allowed_domains ?? [],
        authenticated: Boolean(body?.storage_state),
        created_at: "2026-08-25T10:00:00Z",
        expires_at: "2026-08-25T10:10:00Z",
      });
    }
    if (path === "/v1/browser/sessions" && method === "GET") {
      return json(200, [{ id: "bs_1" }]);
    }
    if (path.endsWith("/goto")) {
      return json(200, { url: body?.url, title: "Example" });
    }
    if (path.endsWith("/snapshot")) {
      snapshots += 1;
      return json(200, { ...SNAPSHOT_BODY, snapshot_id: `snap_${snapshots}` });
    }
    if (path.endsWith("/text")) {
      return json(200, { text: "readable body text", url: "https://example.com/" });
    }
    if (path.endsWith("/act")) {
      return json(200, { did: `${body?.action} on element ${body?.ref}`, url: "https://example.com/next" });
    }
    if (path.endsWith("/storage_state")) {
      return json(200, { storage_state: { cookies: [{ name: "sid" }] } });
    }
    if (path.startsWith("/v1/browser/sessions/") && method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (path === "/v1/browser/tasks") {
      return new Response(TASK_SSE, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }

    if (path === "/v1/chats" && method === "POST") {
      return json(201, {
        id: "chat_1",
        title: null,
        language: body?.language,
        client_id: "partner",
        pinned: false,
        created_at: "2026-08-25T10:00:00Z",
        updated_at: "2026-08-25T10:00:00Z",
      });
    }
    if (path === "/v1/chats" && method === "GET") {
      return json(200, [{ id: "chat_1", title: "Hi", language: "en" }]);
    }
    if (path.endsWith("/messages")) {
      return json(200, [
        {
          id: "m1",
          chat_id: "chat_1",
          role: "assistant",
          content: "hello",
          used_tools: true,
          attachments: [],
        },
      ]);
    }
    if (path === "/v1/attachments" && method === "POST") {
      return json(201, {
        id: "att_1",
        kind: "file",
        mime: "text/plain",
        size_bytes: 5,
        filename: "note.txt",
        url: "https://minio/signed",
      });
    }
    if (path === "/v1/artifacts") {
      return json(200, [
        {
          id: "a1",
          kind: "file",
          mime: "application/pdf",
          size_bytes: 10,
          url: "https://minio/a1",
          chat_id: "chat_1",
          chat_title: "Hi",
        },
      ]);
    }
    if (path === "/v1/search") {
      return json(200, {
        query: url.searchParams.get("q"),
        results: [
          { chat_id: "chat_1", message_id: "m1", role: "user", snippet: "hi", score: 0.9, source: "text" },
        ],
      });
    }
    if (path === "/v1/health") return json(200, { status: "ok" });
    if (path === "/v1/health/models") return json(200, { llm: { ok: true } });

    return json(404, { error: { code: "not_found", message: `no route ${path}` } });
  };

  return { fetch: fetchImpl as unknown as typeof globalThis.fetch, calls };
}
