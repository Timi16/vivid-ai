import { Browser } from "./resources/browser.js";
import { Artifacts, Attachments, Chats, Health } from "./resources/core.js";
import { DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT, Transport } from "./transport.js";
import { SearchResult, parseSearchResult } from "./types.js";

export interface VividOptions {
  /** Falls back to the VIVID_API_KEY environment variable. */
  apiKey?: string;
  /** Falls back to VIVID_BASE_URL, then http://localhost:8000. */
  baseUrl?: string;
  /** Milliseconds. Browsing calls use their own, longer budget. */
  timeout?: number;
  maxRetries?: number;
  /** Supply your own fetch — a proxy agent, or a test double. */
  fetch?: typeof globalThis.fetch;
}

function fromEnv(name: string): string | undefined {
  // Guarded: this package runs in browsers and workers, where `process` is
  // absent and touching it throws.
  const env = (globalThis as any).process?.env;
  return typeof env?.[name] === "string" ? env[name] : undefined;
}

/**
 * The Vivid client.
 *
 * ```ts
 * import { Vivid } from "@vivid-ai/sdk";
 *
 * const vivid = new Vivid({ apiKey: "vk_..." });
 * const session = await vivid.browser.session();
 * try {
 *   await session.goto("https://example.com");
 *   console.log((await session.snapshot()).title);
 * } finally {
 *   await session.close();
 * }
 * ```
 */
export class Vivid {
  readonly browser: Browser;
  readonly chats: Chats;
  readonly attachments: Attachments;
  readonly artifacts: Artifacts;
  readonly health: Health;

  readonly #transport: Transport;

  constructor(options: VividOptions = {}) {
    this.#transport = new Transport({
      apiKey: options.apiKey ?? fromEnv("VIVID_API_KEY") ?? "",
      baseUrl: options.baseUrl ?? fromEnv("VIVID_BASE_URL"),
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      fetch: options.fetch,
    });
    this.browser = new Browser(this.#transport);
    this.chats = new Chats(this.#transport);
    this.attachments = new Attachments(this.#transport);
    this.artifacts = new Artifacts(this.#transport);
    this.health = new Health(this.#transport);
  }

  get baseUrl(): string {
    return this.#transport.baseUrl;
  }

  /** Search across this account's chats. */
  async search(query: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
    const data = await this.#transport.request("GET", "/search", {
      params: { q: query, limit: options.limit ?? 20 },
    });
    return (data?.results ?? []).map(parseSearchResult);
  }
}
