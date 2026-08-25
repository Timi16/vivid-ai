/**
 * Wire models.
 *
 * Interfaces for plain data, classes only where behaviour earns one (Snapshot
 * needs `find`). Every parser ignores unknown keys, so a field added
 * server-side never breaks an installed SDK.
 */
import { ElementNotFound } from "./errors.js";

type Raw = Record<string, any>;

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function date(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

// ---------------------------------------------------------------- browsing
/**
 * One interactive element from a snapshot.
 *
 * `ref` is positional and only valid for the snapshot that produced it — which
 * is why it carries `snapshotId`, so a stale ref is rejected rather than
 * silently acting on whatever now sits at that index.
 */
export interface Element {
  readonly ref: number;
  readonly tag: string;
  readonly type: string;
  readonly label: string;
  readonly snapshotId: string;
  /** `input/password`, `a`, `button` — how the snapshot text renders it. */
  readonly kind: string;
}

function parseElement(raw: Raw, index: number, snapshotId: string): Element {
  const tag = str(raw.tag);
  const type = str(raw.type);
  return {
    ref: typeof raw.ref === "number" ? raw.ref : index,
    tag,
    type,
    label: str(raw.label),
    snapshotId,
    kind: type ? `${tag}/${type}` : tag,
  };
}

export interface SnapshotData {
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly headings: string[];
  readonly elements: Element[];
  readonly snapshotId: string;
  /**
   * The preformatted view the LLM controller receives. Handy to log, and to
   * feed a model of your own if you are writing your own loop.
   */
  readonly rendered: string;
}

/** A page as the agent sees it: text and numbered elements, not pixels. */
export class Snapshot implements SnapshotData {
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly headings: string[];
  readonly elements: Element[];
  readonly snapshotId: string;
  readonly rendered: string;

  constructor(data: SnapshotData) {
    this.url = data.url;
    this.title = data.title;
    this.text = data.text;
    this.headings = data.headings;
    this.elements = data.elements;
    this.snapshotId = data.snapshotId;
    this.rendered = data.rendered;
  }

  static parse(raw: Raw): Snapshot {
    const snapshotId = str(raw.snapshot_id);
    const elements: Raw[] = Array.isArray(raw.elements) ? raw.elements : [];
    return new Snapshot({
      url: str(raw.url),
      title: str(raw.title),
      text: str(raw.text),
      headings: Array.isArray(raw.headings) ? raw.headings.map((h) => str(h)) : [],
      elements: elements.map((el, i) => parseElement(el, i, snapshotId)),
      snapshotId,
      rendered: str(raw.snapshot),
    });
  }

  get size(): number {
    return this.elements.length;
  }

  /**
   * The element whose label best matches `text`.
   *
   * Matching is case-insensitive and ranked: exact, then prefix, then
   * substring, and among equals the earliest in document order. Ranking rather
   * than "first substring hit" is what stops a link labelled "Search products"
   * winning over a button labelled "Search".
   *
   * `kind` filters by tag or tag/type ("button", "input/password") when a page
   * labels a link and a button identically.
   *
   * Throws `ElementNotFound` rather than returning undefined: a missing
   * element is a broken flow, and returning undefined just moves the
   * TypeError one line down.
   */
  find(text: string, options: { kind?: string } = {}): Element {
    const needle = text.trim().toLowerCase();
    let best: { rank: number; element: Element } | undefined;

    for (const element of this.elements) {
      if (options.kind && element.kind !== options.kind && element.tag !== options.kind) {
        continue;
      }
      const label = element.label.trim().toLowerCase();
      let rank: number;
      if (label === needle) rank = 0;
      else if (label.startsWith(needle)) rank = 1;
      else if (label.includes(needle)) rank = 2;
      else continue;

      if (!best || rank < best.rank || (rank === best.rank && element.ref < best.element.ref)) {
        best = { rank, element };
      }
    }

    if (!best) {
      const available = this.elements
        .slice(0, 12)
        .map((e) => JSON.stringify(e.label))
        .join(", ");
      throw new ElementNotFound(
        `no element matching ${JSON.stringify(text)}` +
          (options.kind ? ` of kind ${JSON.stringify(options.kind)}` : "") +
          (available ? `; page has: ${available}` : "; the page reported no interactive elements"),
      );
    }
    return best.element;
  }

  findAll(text: string, options: { kind?: string } = {}): Element[] {
    const needle = text.trim().toLowerCase();
    return this.elements.filter(
      (e) =>
        e.label.trim().toLowerCase().includes(needle) &&
        (!options.kind || e.kind === options.kind || e.tag === options.kind),
    );
  }
}

export interface BrowserSessionInfo {
  readonly id: string;
  readonly allowedDomains: string[];
  readonly authenticated: boolean;
  readonly createdAt?: Date;
  readonly expiresAt?: Date;
}

export function parseSessionInfo(raw: Raw): BrowserSessionInfo {
  return {
    id: str(raw.id),
    allowedDomains: Array.isArray(raw.allowed_domains) ? raw.allowed_domains.map((d: unknown) => str(d)) : [],
    authenticated: Boolean(raw.authenticated),
    createdAt: date(raw.created_at),
    expiresAt: date(raw.expires_at),
  };
}

export interface NavResult {
  readonly url: string;
  readonly title: string;
}

export function parseNav(raw: Raw): NavResult {
  return { url: str(raw.url), title: str(raw.title) };
}

export interface ActResult {
  readonly did: string;
  readonly url: string;
}

export function parseAct(raw: Raw): ActResult {
  return { did: str(raw.did), url: str(raw.url) };
}

/**
 * One decision the managed controller made, and what came of it. Structured
 * rather than the cosmetic status strings the chat UI receives, because the
 * trail is the debuggable part of an agent loop.
 */
export interface TaskStep {
  readonly index: number;
  /** goto | click | type | submit | done | error */
  readonly action: string;
  readonly url: string;
  readonly label: string;
  readonly ref?: number;
  readonly ok: boolean;
  readonly error?: string;
  /** Only on the terminal step. */
  readonly answer?: string;
}

export function parseStep(raw: Raw, index: number): TaskStep {
  return {
    index: typeof raw.index === "number" ? raw.index : index,
    action: str(raw.action),
    url: str(raw.url),
    label: str(raw.label),
    ref: typeof raw.ref === "number" ? raw.ref : undefined,
    ok: raw.ok === undefined ? true : Boolean(raw.ok),
    error: typeof raw.error === "string" ? raw.error : undefined,
    answer: typeof raw.answer === "string" ? raw.answer : undefined,
  };
}

export function formatStep(step: TaskStep): string {
  let head = `${step.index}. ${step.action}`;
  if (step.label) head += ` ${JSON.stringify(step.label)}`;
  if (step.url) head += ` -> ${step.url}`;
  return step.ok ? head : `${head} [failed: ${step.error}]`;
}

export interface TaskResult {
  readonly answer: string;
  readonly steps: TaskStep[];
  readonly url: string;
  readonly sessionId: string;
  /**
   * True when the controller ran out of steps before answering — the answer is
   * then a best effort from the last page rather than a finished one.
   */
  readonly truncated: boolean;
}

export function parseTaskResult(raw: Raw): TaskResult {
  const steps: Raw[] = Array.isArray(raw.steps) ? raw.steps : [];
  return {
    answer: str(raw.answer),
    steps: steps.map((s, i) => parseStep(s, i)),
    url: str(raw.url),
    sessionId: str(raw.session_id),
    truncated: Boolean(raw.truncated),
  };
}

// -------------------------------------------------------------------- chat
export interface Attachment {
  readonly id: string;
  readonly kind: string;
  readonly mime: string;
  readonly sizeBytes: number;
  readonly filename?: string;
  /** Presigned and short-lived — roughly an hour. Fetch it, do not store it. */
  readonly url?: string;
  readonly createdAt?: Date;
}

export function parseAttachment(raw: Raw): Attachment {
  return {
    id: str(raw.id),
    kind: str(raw.kind, "file"),
    mime: str(raw.mime, "application/octet-stream"),
    sizeBytes: Number(raw.size_bytes ?? 0),
    filename: typeof raw.filename === "string" ? raw.filename : undefined,
    url: typeof raw.url === "string" ? raw.url : undefined,
    createdAt: date(raw.created_at),
  };
}

export interface Artifact extends Attachment {
  readonly chatId: string;
  readonly chatTitle?: string;
  readonly messageId?: string;
}

export function parseArtifact(raw: Raw): Artifact {
  return {
    ...parseAttachment(raw),
    chatId: str(raw.chat_id),
    chatTitle: typeof raw.chat_title === "string" ? raw.chat_title : undefined,
    messageId: typeof raw.message_id === "string" ? raw.message_id : undefined,
  };
}

export interface Chat {
  readonly id: string;
  readonly language: string;
  readonly title?: string;
  readonly pinned: boolean;
  readonly clientId: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export function parseChat(raw: Raw): Chat {
  return {
    id: str(raw.id),
    language: str(raw.language, "en"),
    title: typeof raw.title === "string" ? raw.title : undefined,
    pinned: Boolean(raw.pinned),
    clientId: str(raw.client_id),
    createdAt: date(raw.created_at),
    updatedAt: date(raw.updated_at),
  };
}

export interface Usage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
}

export interface Message {
  readonly id: string;
  readonly chatId: string;
  readonly role: string;
  readonly content: string;
  readonly usedTools: boolean;
  readonly attachments: Attachment[];
  readonly usage?: Usage;
  readonly createdAt?: Date;
}

export function parseMessage(raw: Raw): Message {
  const attachments: Raw[] = Array.isArray(raw.attachments) ? raw.attachments : [];
  const usage = raw.usage as Raw | undefined;
  return {
    id: str(raw.id),
    chatId: str(raw.chat_id),
    role: str(raw.role, "assistant"),
    content: str(raw.content),
    usedTools: Boolean(raw.used_tools),
    attachments: attachments.map(parseAttachment),
    usage: usage
      ? { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens }
      : undefined,
    createdAt: date(raw.created_at),
  };
}

export interface SearchResult {
  readonly chatId: string;
  readonly messageId: string;
  readonly role: string;
  readonly snippet: string;
  readonly score: number;
  /** vector | text */
  readonly source: string;
  readonly language: string;
  readonly title?: string;
}

export function parseSearchResult(raw: Raw): SearchResult {
  return {
    chatId: str(raw.chat_id),
    messageId: str(raw.message_id),
    role: str(raw.role),
    snippet: str(raw.snippet),
    score: Number(raw.score ?? 0),
    source: str(raw.source, "text"),
    language: str(raw.language, "en"),
    title: typeof raw.title === "string" ? raw.title : undefined,
  };
}
