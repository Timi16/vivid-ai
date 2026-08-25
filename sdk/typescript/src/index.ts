/**
 * Vivid AI SDK — agentic browsing, chats, files and search.
 *
 * ```ts
 * import { Vivid, secret, formatStep } from "@vivid-ai/sdk";
 *
 * const vivid = new Vivid({ apiKey: "vk_..." });
 *
 * // Vivid drives
 * const task = vivid.browser.run({
 *   goal: "find the pricing tiers",
 *   url: "https://example.com",
 * });
 * for await (const step of task) console.log(formatStep(step));
 * console.log((await task.result()).answer);
 * ```
 */
export { Vivid } from "./client.js";
export type { VividOptions } from "./client.js";

export { Browser, BrowserSession, BrowsingTask, MAX_STEPS_LIMIT } from "./resources/browser.js";
export type { RunOptions, SessionOptions } from "./resources/browser.js";
export { Artifacts, Attachments, Chats, Health, MAX_UPLOAD_BYTES } from "./resources/core.js";
export type { FileInput } from "./resources/core.js";

export { Secret, isSecret, REDACTED, reveal, secret } from "./secret.js";

export { Snapshot, formatStep } from "./types.js";
export type {
  ActResult,
  Artifact,
  Attachment,
  BrowserSessionInfo,
  Chat,
  Element,
  Message,
  NavResult,
  SearchResult,
  SnapshotData,
  TaskResult,
  TaskStep,
  Usage,
} from "./types.js";

export {
  APIError,
  BlockedUrl,
  BrowserError,
  Busy,
  CapacityExceeded,
  ConnectionError,
  DomainNotAllowed,
  ElementNotFound,
  Forbidden,
  ModelUnavailable,
  NavTimeout,
  NotFound,
  QuotaExceeded,
  RateLimited,
  SessionExpired,
  StaleRef,
  TaskFailed,
  Unauthorized,
  VividError,
} from "./errors.js";

export { VERSION } from "./transport.js";
