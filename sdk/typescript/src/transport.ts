/**
 * HTTP plumbing: auth, retries, error mapping, SSE.
 *
 * Built on global `fetch`, so the package has no runtime dependencies and runs
 * unchanged in Node 18+, Deno, Bun and workers.
 */
import { ConnectionError, VividError, fromResponse } from "./errors.js";

export const DEFAULT_BASE_URL = "http://localhost:8000";
export const DEFAULT_TIMEOUT = 60_000;
/** Browsing calls wait on a real page load, so they get a longer budget. */
export const BROWSE_TIMEOUT = 120_000;
export const DEFAULT_MAX_RETRIES = 2;

/**
 * Retried when the request is safe to repeat. 409 is absent deliberately: it
 * means "already generating", and hammering it just burns the rate limit.
 */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export const VERSION = "0.1.0";

export interface RequestOptions {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  formData?: FormData;
  timeout?: number;
  /** Overrides the method-derived default. Actions must never be retried. */
  retry?: boolean;
}

export interface TransportOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Full jitter. Synchronised retries from a fleet of agents are exactly the
 * load the browser tier can least afford.
 */
function backoff(attempt: number, retryAfter?: number): number {
  if (retryAfter !== undefined) return Math.min(retryAfter * 1000, 30_000);
  return Math.random() * Math.min(500 * 2 ** attempt, 8_000);
}

function retryAfterOf(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : undefined;
}

/** GET is safe by definition. POST is not: repeating a click is a second click. */
function shouldRetry(method: string, override?: boolean): boolean {
  if (override !== undefined) return override;
  return method === "GET" || method === "HEAD";
}

async function parseBody(response: Response): Promise<any> {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class Transport {
  readonly baseUrl: string;
  readonly maxRetries: number;
  readonly #apiKey: string;
  readonly #timeout: number;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: TransportOptions) {
    if (!options.apiKey) {
      throw new Error(
        "no API key: pass new Vivid({ apiKey }) or set the VIVID_API_KEY environment variable",
      );
    }
    this.#apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    // Bound so a caller-supplied fetch (test double, proxy agent) still works.
    this.#fetch = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

  #headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      authorization: `Bearer ${this.#apiKey}`,
      "user-agent": `vivid-ai-js/${VERSION}`,
      accept: "application/json",
      ...extra,
    };
  }

  #url(path: string, params?: RequestOptions["params"]): string {
    const url = new URL(`${this.baseUrl}/v1${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async request<T = any>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const attempts = shouldRetry(method, options.retry) ? this.maxRetries : 0;
    const url = this.#url(path, options.params);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeout ?? this.#timeout);
      let response: Response;
      try {
        const init: RequestInit = { method, signal: controller.signal };
        if (options.formData) {
          // No content-type header: fetch must set the multipart boundary.
          init.body = options.formData;
          init.headers = this.#headers();
        } else if (options.body !== undefined) {
          init.body = JSON.stringify(options.body);
          init.headers = this.#headers({ "content-type": "application/json" });
        } else {
          init.headers = this.#headers();
        }
        response = await this.#fetch(url, init);
      } catch (error) {
        const reason = (error as Error)?.name === "AbortError" ? "request timed out" : "could not reach Vivid";
        lastError = new ConnectionError(`${reason}: ${(error as Error)?.message ?? error}`);
        if (attempt < attempts) {
          await sleep(backoff(attempt));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }

      if (RETRY_STATUSES.has(response.status) && attempt < attempts) {
        await sleep(backoff(attempt, retryAfterOf(response)));
        continue;
      }
      if (!response.ok) {
        throw fromResponse(response.status, await parseBody(response), retryAfterOf(response));
      }
      return (await parseBody(response)) as T;
    }
    throw lastError ?? new ConnectionError("request failed");
  }

  /**
   * Server-sent events as an async iterable of [event, data] pairs.
   *
   * Only what the API emits is supported — `event:` and `data:`, one JSON
   * object per event. Multi-line data is concatenated per the spec, because a
   * long answer field will wrap.
   */
  async *streamSSE(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): AsyncGenerator<[string, any]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout ?? BROWSE_TIMEOUT);
    try {
      const response = await this.#fetch(this.#url(path, options.params), {
        method,
        signal: controller.signal,
        headers: this.#headers({ "content-type": "application/json", accept: "text/event-stream" }),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });

      if (!response.ok) {
        throw fromResponse(response.status, await parseBody(response), retryAfterOf(response));
      }
      if (!response.body) {
        throw new ConnectionError("the server returned no stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let event = "message";
      let payload: string[] = [];

      const flush = (): [string, any] | undefined => {
        if (payload.length === 0) return undefined;
        const raw = payload.join("\n");
        payload = [];
        const name = event;
        event = "message";
        if (raw === "[DONE]") return undefined;
        try {
          return [name, JSON.parse(raw)];
        } catch {
          return undefined;
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Keep the trailing fragment: a chunk boundary can fall mid-line.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.replace(/\r$/, "");
          if (trimmed === "") {
            const parsed = flush();
            if (parsed) yield parsed;
          } else if (trimmed.startsWith(":")) {
            continue; // comment / keep-alive
          } else if (trimmed.startsWith("event:")) {
            event = trimmed.slice(6).trim();
          } else if (trimmed.startsWith("data:")) {
            payload.push(trimmed.slice(5).replace(/^ /, ""));
          }
        }
      }
      const parsed = flush();
      if (parsed) yield parsed;
    } finally {
      clearTimeout(timer);
    }
  }
}

export { VividError };
