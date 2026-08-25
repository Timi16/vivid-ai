/**
 * Chats, attachments, artifacts and health.
 *
 * Streaming a chat turn runs over the websocket, which still authenticates by
 * decoding a user JWT from a query parameter — an API key cannot open it. So
 * `chats` covers chat state only, and `send()` arrives with that change.
 */
import { Transport } from "../transport.js";
import {
  Artifact,
  Attachment,
  Chat,
  Message,
  parseArtifact,
  parseAttachment,
  parseChat,
  parseMessage,
} from "../types.js";

/** The backend rejects anything larger; checking here saves the upload. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class Chats {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  async create(options: { language?: string; title?: string } = {}): Promise<Chat> {
    const body: Record<string, unknown> = { language: options.language ?? "en" };
    if (options.title) body.title = options.title;
    return parseChat((await this.#transport.request("POST", "/chats", { body })) ?? {});
  }

  async list(options: { limit?: number; offset?: number } = {}): Promise<Chat[]> {
    const data = await this.#transport.request("GET", "/chats", {
      params: { limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
    return (data ?? []).map(parseChat);
  }

  async get(chatId: string): Promise<Chat> {
    return parseChat((await this.#transport.request("GET", `/chats/${chatId}`)) ?? {});
  }

  async update(chatId: string, patch: { title?: string; pinned?: boolean }): Promise<Chat> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.pinned !== undefined) body.pinned = patch.pinned;
    if (Object.keys(body).length === 0) {
      throw new Error("pass title or pinned to update a chat");
    }
    return parseChat((await this.#transport.request("PATCH", `/chats/${chatId}`, { body })) ?? {});
  }

  async delete(chatId: string): Promise<void> {
    await this.#transport.request("DELETE", `/chats/${chatId}`);
  }

  async messages(
    chatId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<Message[]> {
    const data = await this.#transport.request("GET", `/chats/${chatId}/messages`, {
      params: { limit: options.limit ?? 100, offset: options.offset ?? 0 },
    });
    return (data ?? []).map(parseMessage);
  }
}

export type FileInput = Blob | ArrayBuffer | Uint8Array | string;

export class Attachments {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /**
   * Upload a file. Accepts a Blob/File, an ArrayBuffer, a Uint8Array, or a
   * string of text.
   *
   * PDFs and text files have their text extracted server-side on upload, so it
   * is available to the very next message in the chat.
   */
  async upload(
    file: FileInput,
    options: { filename?: string; mime?: string; chatId?: string } = {},
  ): Promise<Attachment> {
    let blob: Blob;
    let filename = options.filename;

    if (typeof file === "string") {
      blob = new Blob([file], { type: options.mime ?? "text/plain" });
      filename ??= "upload.txt";
    } else if (file instanceof Blob) {
      blob = options.mime ? new Blob([file], { type: options.mime }) : file;
      filename ??= (file as File).name ?? "upload";
    } else {
      const view = file instanceof Uint8Array ? file : new Uint8Array(file);
      // Copy out of the backing buffer rather than handing the view straight
      // to Blob: a Uint8Array can be a window into a larger (possibly shared)
      // buffer, and passing it whole would upload the neighbours too.
      const bytes = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
      blob = new Blob([bytes as ArrayBuffer], {
        type: options.mime ?? "application/octet-stream",
      });
      if (!filename) throw new Error("filename is required when uploading raw bytes");
    }

    if (blob.size === 0) throw new Error("refusing to upload an empty file");
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new Error(`${filename} is ${blob.size} bytes; the API limit is ${MAX_UPLOAD_BYTES} (10 MB)`);
    }

    const form = new FormData();
    form.append("file", blob, filename);
    if (options.chatId) form.append("chat_id", options.chatId);
    return parseAttachment((await this.#transport.request("POST", "/attachments", { formData: form })) ?? {});
  }

  /**
   * Re-fetch an attachment, which re-signs its URL.
   *
   * URLs are presigned for about an hour, so hold the id and call this when
   * you need a link rather than storing the link itself.
   */
  async get(attachmentId: string): Promise<Attachment> {
    return parseAttachment((await this.#transport.request("GET", `/attachments/${attachmentId}`)) ?? {});
  }
}

/** Files Vivid generated — anything a tool produced and attached to a reply. */
export class Artifacts {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  async list(options: { limit?: number } = {}): Promise<Artifact[]> {
    const data = await this.#transport.request("GET", "/artifacts", {
      params: { limit: options.limit ?? 60 },
    });
    return (data ?? []).map(parseArtifact);
  }
}

export class Health {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /** Backend liveness and the tools currently enabled. */
  async check(): Promise<Record<string, unknown>> {
    return (await this.#transport.request("GET", "/health")) ?? {};
  }

  /**
   * Per-service health for the model tier. Worth polling before a batch of
   * work: a cold pod reports here instead of failing mid-run.
   */
  async models(): Promise<Record<string, unknown>> {
    return (await this.#transport.request("GET", "/health/models")) ?? {};
  }
}
