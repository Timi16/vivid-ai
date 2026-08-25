/**
 * Browsing: the surface this SDK exists for.
 *
 * Two layers, because the two real use cases want different things:
 *
 *   layer 1  you drive — goto / snapshot / click / type, so you write your own
 *            agent loop and keep every decision
 *   layer 2  Vivid drives — give it a goal and a starting URL, get back an
 *            answer plus the trail of actions that produced it
 *
 * Both run on the same server-side session, so a task can continue inside a
 * session you authenticated yourself. That combination is the point: log in
 * with layer 1, then hand the authenticated session to layer 2.
 */
import { StaleRef, TaskFailed, VividError } from "../errors.js";
import { BROWSE_TIMEOUT, Transport } from "../transport.js";
import { Secret, isSecret, reveal } from "../secret.js";
import {
  ActResult,
  BrowserSessionInfo,
  Element,
  NavResult,
  Snapshot,
  TaskResult,
  TaskStep,
  parseAct,
  parseNav,
  parseSessionInfo,
  parseStep,
  parseTaskResult,
} from "../types.js";

/** The server caps this too; refusing locally just fails faster and cheaper. */
export const MAX_STEPS_LIMIT = 30;

export interface SessionOptions {
  /** From a previous session's `storageState()`. Requires allowedDomains. */
  storageState?: Record<string, unknown>;
  allowedDomains?: string[];
  /** Seconds of idle time before the session is reaped. */
  idleTtl?: number;
}

export interface RunOptions {
  goal: string;
  url?: string;
  maxSteps?: number;
  session?: BrowserSession | string;
  allowedDomains?: string[];
}

function sessionBody(options: SessionOptions): Record<string, unknown> {
  // An authenticated session carries live cookies. Letting it navigate
  // anywhere means any page it lands on can steer the controller into
  // exfiltrating them, so allowedDomains is required whenever storage state is
  // supplied. The server enforces this too — this check exists to fail at the
  // call site, where the fix is obvious.
  if (options.storageState && !options.allowedDomains?.length) {
    throw new Error(
      "allowedDomains is required for an authenticated session: a session " +
        "holding live cookies must not be able to navigate off-domain. Pass " +
        'the hosts this session should reach, e.g. allowedDomains: ["example.com"].',
    );
  }
  const body: Record<string, unknown> = {};
  if (options.storageState) body.storage_state = options.storageState;
  if (options.allowedDomains?.length) body.allowed_domains = options.allowedDomains;
  if (options.idleTtl !== undefined) body.idle_ttl = Math.trunc(options.idleTtl);
  return body;
}

/**
 * Build an /act body, refusing refs that a newer snapshot invalidated.
 *
 * Refs are positional and regenerate on every snapshot, so a ref held across
 * one is not merely stale — it points at whatever now occupies that index,
 * which is how an agent ends up clicking the wrong thing and reporting
 * success. Catching it here turns a silent misfire into a clear error.
 */
function actBody(
  currentSnapshot: string | undefined,
  target: Element | number,
  action: string,
  value: string | Secret = "",
): Record<string, unknown> {
  let ref: number;
  let snapshotId: string;

  if (typeof target === "number") {
    // A bare number is accepted for parity with the HTTP API, but it carries
    // no snapshot identity, so the server does the checking.
    ref = target;
    snapshotId = currentSnapshot ?? "";
  } else {
    if (target.snapshotId) {
      if (currentSnapshot === undefined) {
        // Navigating or acting clears the current snapshot, because both
        // change the page. Any ref still held is therefore stale — and this is
        // the case that matters most, since the page under it has moved.
        throw new StaleRef(
          `element [${target.ref}] ${JSON.stringify(target.label)} is stale: the page ` +
            "changed since that snapshot was taken. Call snapshot() again and find " +
            "the element on the new page.",
        );
      }
      if (target.snapshotId !== currentSnapshot) {
        throw new StaleRef(
          `element [${target.ref}] ${JSON.stringify(target.label)} came from an earlier ` +
            "snapshot; refs are positional and change on every snapshot. Take a " +
            "fresh snapshot() and find it again.",
        );
      }
    }
    ref = target.ref;
    snapshotId = target.snapshotId;
  }

  const body: Record<string, unknown> = { ref, action };
  if (snapshotId) body.snapshot_id = snapshotId;
  if (value !== "" || action === "type" || action === "submit") {
    body.value = reveal(value);
    if (isSecret(value)) {
      // Tells the service to mark the field so its value never re-enters a
      // snapshot, a controller prompt, or a log line.
      body.secret = true;
    }
  }
  return body;
}

/**
 * One live browser context.
 *
 * Contexts cost ~200MB each and count against your key's quota, so leaking one
 * is expensive in a way an HTTP client normally is not. Always `close()` —
 * `using` handles it automatically where your runtime supports it.
 */
export class BrowserSession {
  readonly #transport: Transport;
  readonly #info: BrowserSessionInfo;
  #closed = false;
  /** The snapshot refs currently point into. See actBody. */
  #currentSnapshot: string | undefined;

  constructor(transport: Transport, info: BrowserSessionInfo) {
    this.#transport = transport;
    this.#info = info;
  }

  get id(): string {
    return this.#info.id;
  }

  get info(): BrowserSessionInfo {
    return this.#info;
  }

  get closed(): boolean {
    return this.#closed;
  }

  #path(suffix = ""): string {
    return `/browser/sessions/${this.#info.id}${suffix}`;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new VividError(
        `session ${this.#info.id} is closed; open a new one with client.browser.session()`,
      );
    }
  }

  /**
   * Navigate. Refused if the URL is outside `allowedDomains`, or if the SSRF
   * guard rejects it as private/loopback/metadata.
   */
  async goto(url: string): Promise<NavResult> {
    this.#assertOpen();
    const data = await this.#transport.request("POST", this.#path("/goto"), {
      body: { url },
      timeout: BROWSE_TIMEOUT,
    });
    this.#currentSnapshot = undefined; // navigating invalidates every ref
    return parseNav(data ?? {});
  }

  /**
   * The page as the agent sees it: title, headings, text, and numbered
   * interactive elements. Taking one invalidates refs from the last.
   */
  async snapshot(): Promise<Snapshot> {
    this.#assertOpen();
    const data = await this.#transport.request("POST", this.#path("/snapshot"), {
      body: {},
      timeout: BROWSE_TIMEOUT,
    });
    const snap = Snapshot.parse(data ?? {});
    this.#currentSnapshot = snap.snapshotId;
    return snap;
  }

  /**
   * Readable text under `selector`. Cheaper than a snapshot when you only want
   * to read, and not capped to the snapshot's 2000 characters.
   */
  async text(selector = "body"): Promise<string> {
    this.#assertOpen();
    const data = await this.#transport.request("POST", this.#path("/text"), {
      body: { selector },
      timeout: BROWSE_TIMEOUT,
    });
    return data?.text ?? "";
  }

  async #act(target: Element | number, action: string, value: string | Secret = ""): Promise<ActResult> {
    this.#assertOpen();
    const body = actBody(this.#currentSnapshot, target, action, value);
    const data = await this.#transport.request("POST", this.#path("/act"), {
      body,
      timeout: BROWSE_TIMEOUT,
    });
    // Acting changes the page — it may navigate, and even typing alters which
    // elements exist (validation messages, enabled buttons).
    this.#currentSnapshot = undefined;
    return parseAct(data ?? {});
  }

  async click(target: Element | number): Promise<ActResult> {
    return this.#act(target, "click");
  }

  /**
   * Fill a field. Wrap credentials in `secret(...)` — the value then never
   * enters a snapshot, a controller prompt, or a log line.
   */
  async type(target: Element | number, value: string | Secret): Promise<ActResult> {
    return this.#act(target, "type", value);
  }

  /** Fill a field and press Enter — the search-box case. */
  async submit(target: Element | number, value: string | Secret = ""): Promise<ActResult> {
    return this.#act(target, "submit", value);
  }

  /**
   * Cookies and local storage, to persist and replay into a later session.
   * Treat the result as a bearer credential: it is one.
   */
  async storageState(): Promise<Record<string, unknown>> {
    this.#assertOpen();
    const data = await this.#transport.request("GET", this.#path("/storage_state"));
    return data?.storage_state ?? {};
  }

  /**
   * Idempotent: closing twice is not an error, and neither is closing one the
   * server already reaped.
   */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try {
      await this.#transport.request("DELETE", this.#path());
    } catch (error) {
      if (!(error instanceof VividError)) throw error;
      // A session that is already gone is the state we wanted.
    }
  }

  /** Explicit resource management, where the runtime supports `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

/**
 * A managed browsing run: iterate for steps, then read the result.
 *
 * ```ts
 * const task = client.browser.run({ goal: "...", url: "..." });
 * for await (const step of task) console.log(formatStep(step));
 * const { answer } = await task.result();
 * ```
 *
 * Calling `result()` without iterating drains the stream first, so the simple
 * case stays one line.
 */
export class BrowsingTask implements AsyncIterable<TaskStep> {
  readonly #transport: Transport;
  readonly #payload: Record<string, unknown>;
  #steps: TaskStep[] = [];
  #result: TaskResult | undefined;
  #done = false;

  constructor(transport: Transport, payload: Record<string, unknown>) {
    this.#transport = transport;
    this.#payload = payload;
  }

  /** Steps seen so far. Complete only once the task has finished. */
  get steps(): TaskStep[] {
    return [...this.#steps];
  }

  async *[Symbol.asyncIterator](): AsyncIterator<TaskStep> {
    if (this.#done) {
      yield* this.#steps;
      return;
    }
    const stream = this.#transport.streamSSE("POST", "/browser/tasks", {
      body: { ...this.#payload, stream: true },
    });
    for await (const [event, data] of stream) {
      if (event === "step") {
        const step = parseStep(data, this.#steps.length);
        this.#steps.push(step);
        yield step;
      } else if (event === "result") {
        this.#result = parseTaskResult(data);
      } else if (event === "error") {
        this.#done = true;
        throw new TaskFailed(data?.message ?? "the browsing task failed");
      }
    }
    this.#done = true;
  }

  /** Wait for the task to finish and return its answer plus trail. */
  async result(): Promise<TaskResult> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of this) {
      // draining
    }
    if (!this.#result) {
      throw new TaskFailed("the task ended without producing a result");
    }
    return this.#result;
  }
}

/** `client.browser` — sessions and managed tasks. */
export class Browser {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /**
   * Open a browser session.
   *
   * Pass `storageState` from a previous session's `storageState()` to resume
   * an authenticated one — no credential ever reaches Vivid that way.
   * `allowedDomains` is required whenever you do, and restricts every
   * navigation in the session, including ones a managed task chooses.
   */
  async session(options: SessionOptions = {}): Promise<BrowserSession> {
    const data = await this.#transport.request("POST", "/browser/sessions", {
      body: sessionBody(options),
      timeout: BROWSE_TIMEOUT,
    });
    return new BrowserSession(this.#transport, parseSessionInfo(data ?? {}));
  }

  /** Every open session belonging to this API key. */
  async sessions(): Promise<BrowserSessionInfo[]> {
    const data = await this.#transport.request("GET", "/browser/sessions");
    return (data ?? []).map(parseSessionInfo);
  }

  /** Close a session by id — for cleaning up one you did not keep. */
  async close(sessionId: string): Promise<void> {
    await this.#transport.request("DELETE", `/browser/sessions/${sessionId}`);
  }

  /**
   * Let Vivid drive: snapshot, decide, act, repeat, until it can answer.
   *
   * Pass `session` to run inside one you already authenticated. Without it a
   * throwaway session is created and closed for you.
   */
  run(options: RunOptions): BrowsingTask {
    const goal = options.goal?.trim();
    if (!goal) throw new Error("goal is required");
    if (!options.session && !options.url) {
      throw new Error("url is required when no session is given");
    }
    const maxSteps = options.maxSteps ?? 8;
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_STEPS_LIMIT) {
      throw new Error(`maxSteps must be an integer 1..${MAX_STEPS_LIMIT}`);
    }

    const payload: Record<string, unknown> = { goal, max_steps: maxSteps };
    if (options.url) payload.url = options.url;
    if (options.session) {
      payload.session_id =
        typeof options.session === "string" ? options.session : options.session.id;
    }
    if (options.allowedDomains?.length) payload.allowed_domains = options.allowedDomains;
    return new BrowsingTask(this.#transport, payload);
  }
}
