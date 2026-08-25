/**
 * Typed errors, mapped from the API's error envelope.
 *
 * Every failure the browsing surface can produce gets its own class, because
 * the retry decision differs for each: a stale ref means take a fresh
 * snapshot, a capacity error means back off, a blocked URL means the request
 * was wrong and retrying is pointless. One error class with a string message
 * would push that decision onto every caller.
 */

export interface ErrorOptions {
  requestId?: string;
  status?: number;
  body?: Record<string, unknown>;
}

export class VividError extends Error {
  /** Wire code this class is registered for. */
  static code: string | undefined;

  readonly requestId?: string;
  readonly status?: number;
  readonly body: Record<string, unknown>;

  constructor(message: string, options: ErrorOptions = {}) {
    super(options.requestId ? `${message} (request_id=${options.requestId})` : message);
    // Restores the prototype chain so `instanceof` works when this package is
    // consumed as compiled ES5 — a classic subclassed-Error footgun.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this.requestId = options.requestId;
    this.status = options.status;
    this.body = options.body ?? {};
  }
}

// --- connection / protocol --------------------------------------------------
/** The request never reached Vivid: DNS, refused, TLS, timeout, abort. */
export class ConnectionError extends VividError {}

/** A non-2xx with no more specific class. */
export class APIError extends VividError {}

// --- auth -------------------------------------------------------------------
export class Unauthorized extends VividError {
  static override code = "unauthorized";
}
export class Forbidden extends VividError {
  static override code = "forbidden";
}
export class NotFound extends VividError {
  static override code = "not_found";
}

// --- limits -----------------------------------------------------------------
export class RateLimited extends VividError {
  static override code = "rate_limited";
  readonly retryAfter?: number;
  constructor(message: string, options: ErrorOptions & { retryAfter?: number } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
}

/** This API key already holds its maximum concurrent browser sessions. */
export class QuotaExceeded extends VividError {
  static override code = "quota_exceeded";
}

/**
 * The browser tier itself is full. Unlike QuotaExceeded this is not your
 * fault and is worth retrying with backoff.
 */
export class CapacityExceeded extends VividError {
  static override code = "capacity_exceeded";
}

export class Busy extends VividError {
  static override code = "busy";
}

// --- browsing ---------------------------------------------------------------
export class BrowserError extends VividError {}

/** Reaped after its idle TTL, or explicitly closed. */
export class SessionExpired extends BrowserError {
  static override code = "session_expired";
}

/**
 * The element ref came from a snapshot that is no longer current. Refs are
 * positional and regenerate on every snapshot, so take a fresh one.
 */
export class StaleRef extends BrowserError {
  static override code = "stale_ref";
}

/** Refused by the SSRF guard: private, loopback, link-local or metadata. */
export class BlockedUrl extends BrowserError {
  static override code = "blocked_url";
}

/**
 * Navigation outside the session's allowedDomains. Authenticated sessions
 * carry live cookies, so egress is restricted by design.
 */
export class DomainNotAllowed extends BrowserError {
  static override code = "domain_not_allowed";
}

export class NavTimeout extends BrowserError {
  static override code = "nav_timeout";
}

/** No element on the snapshot matched. Thrown locally by Snapshot.find. */
export class ElementNotFound extends BrowserError {
  static override code = "element_not_found";
}

// --- models -----------------------------------------------------------------
export class ModelUnavailable extends VividError {
  static override code = "llm_error";
}

/** A managed browsing task ended without producing an answer. */
export class TaskFailed extends VividError {
  static override code = "task_failed";
}

type ErrorClass = typeof VividError & (new (message: string, options?: ErrorOptions) => VividError);

const CLASSES: ErrorClass[] = [
  Unauthorized, Forbidden, NotFound, RateLimited, QuotaExceeded,
  CapacityExceeded, Busy, SessionExpired, StaleRef, BlockedUrl,
  DomainNotAllowed, NavTimeout, ElementNotFound, ModelUnavailable, TaskFailed,
] as ErrorClass[];

const BY_CODE = new Map<string, ErrorClass>(
  CLASSES.filter((c) => c.code).map((c) => [c.code as string, c]),
);

/** Fallback when the body carries no code — HTTP status is all we have. */
const BY_STATUS = new Map<number, ErrorClass>([
  [401, Unauthorized as ErrorClass],
  [403, Forbidden as ErrorClass],
  [404, NotFound as ErrorClass],
  [409, Busy as ErrorClass],
  [429, RateLimited as ErrorClass],
  [503, ModelUnavailable as ErrorClass],
]);

/**
 * Build the right error from a response body.
 *
 * The envelope is `{error: {code, message, request_id}}`. FastAPI's older
 * `{detail: "..."}` shape is still accepted, because parts of the API predate
 * the envelope and an SDK that only understood the new shape would report
 * every one of those as an unhelpful blank message.
 */
export function fromResponse(
  status: number,
  body: Record<string, unknown> | null,
  retryAfter?: number,
): VividError {
  const source = body ?? {};
  const envelope = source.error as Record<string, unknown> | undefined;

  let code: string | undefined;
  let message: string;
  let requestId: string | undefined;

  if (envelope && typeof envelope === "object") {
    code = typeof envelope.code === "string" ? envelope.code : undefined;
    message = typeof envelope.message === "string" ? envelope.message : `request failed (${status})`;
    requestId = typeof envelope.request_id === "string" ? envelope.request_id : undefined;
  } else {
    message = typeof source.detail === "string" ? source.detail : `request failed (${status})`;
  }

  const Cls = (code ? BY_CODE.get(code) : undefined) ?? BY_STATUS.get(status) ?? (APIError as ErrorClass);
  if (Cls === (RateLimited as ErrorClass)) {
    return new RateLimited(message, { requestId, status, body: source, retryAfter });
  }
  return new Cls(message, { requestId, status, body: source });
}
