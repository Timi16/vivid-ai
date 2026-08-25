/** Secrets, error mapping, and the non-browsing resources. */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  APIError,
  BrowserError,
  NotFound,
  RateLimited,
  StaleRef,
  Unauthorized,
  Vivid,
  VividError,
  isSecret,
  reveal,
  secret,
} from "../src/index.js";
import { fromResponse } from "../src/errors.js";
import { createMock, type Recorded } from "./mock.js";

let vivid: Vivid;
let calls: Recorded[];

beforeEach(() => {
  const mock = createMock();
  calls = mock.calls;
  vivid = new Vivid({ apiKey: "vk_test", baseUrl: "https://api.test", fetch: mock.fetch });
});

describe("Secret", () => {
  it("never prints itself", () => {
    const pw = secret("hunter2");
    expect(String(pw)).not.toContain("hunter2");
    expect(`${pw}`).not.toContain("hunter2");
    expect(pw.toString()).toBe("***");
  });

  it("survives JSON.stringify — the most likely accidental leak", () => {
    expect(JSON.stringify({ password: secret("hunter2") })).not.toContain("hunter2");
  });

  it("survives console logging", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    console.log(`typing ${secret("hunter2")} into the form`);
    expect(spy.mock.calls.flat().join(" ")).not.toContain("hunter2");
    spy.mockRestore();
  });

  it("leaks only on explicit reveal", () => {
    expect(secret("hunter2").reveal()).toBe("hunter2");
    expect(reveal(secret("hunter2"))).toBe("hunter2");
    expect(reveal("plain")).toBe("plain");
  });

  it("is detectable and does not nest", () => {
    expect(isSecret(secret("x"))).toBe(true);
    expect(isSecret("x")).toBe(false);
    expect(secret(secret("x")).reveal()).toBe("x");
  });

  it("reports length without exposing content", () => {
    expect(secret("hunter2").length).toBe(7);
  });
});

describe("error mapping", () => {
  it("maps the envelope to a typed error", () => {
    const err = fromResponse(429, {
      error: { code: "capacity_exceeded", message: "full", request_id: "req_9" },
    });
    expect(err.name).toBe("CapacityExceeded");
    expect(err.requestId).toBe("req_9");
    expect(err.message).toContain("req_9");
  });

  it("still understands the legacy detail shape", () => {
    // Parts of the API predate the envelope; an SDK that only understood the
    // new shape would report those as a blank message.
    const err = fromResponse(404, { detail: "Chat not found" });
    expect(err).toBeInstanceOf(NotFound);
    expect(err.message).toBe("Chat not found");
  });

  it("falls back to the status when no code is present", () => {
    expect(fromResponse(401, {})).toBeInstanceOf(Unauthorized);
  });

  it("degrades an unknown code rather than breaking", () => {
    // A code added server-side must not break an installed SDK.
    const err = fromResponse(400, { error: { code: "some_future_code", message: "nope" } });
    expect(err).toBeInstanceOf(APIError);
    expect(err).toBeInstanceOf(VividError);
  });

  it("carries retry-after on rate limits", () => {
    const err = fromResponse(429, { error: { code: "rate_limited", message: "slow" } }, 2.5);
    expect(err).toBeInstanceOf(RateLimited);
    expect((err as RateLimited).retryAfter).toBe(2.5);
  });

  it("keeps browsing errors a distinct family", () => {
    const err = new StaleRef("stale");
    expect(err).toBeInstanceOf(BrowserError);
    expect(err).toBeInstanceOf(VividError);
    expect(err).toBeInstanceOf(Error);
  });

  it("surfaces wire errors to the caller", async () => {
    await expect(vivid.chats.get("missing")).rejects.toThrow(NotFound);
  });
});

describe("client construction", () => {
  it("requires an API key and says what to do", () => {
    expect(() => new Vivid({ apiKey: "" })).toThrow(/VIVID_API_KEY/);
  });

  it("reads configuration from the environment", () => {
    process.env.VIVID_API_KEY = "vk_env";
    process.env.VIVID_BASE_URL = "https://env.test";
    try {
      expect(new Vivid().baseUrl).toBe("https://env.test");
    } finally {
      delete process.env.VIVID_API_KEY;
      delete process.env.VIVID_BASE_URL;
    }
  });

  it("strips a trailing slash from the base url", () => {
    const mock = createMock();
    const client = new Vivid({ apiKey: "k", baseUrl: "https://api.test/", fetch: mock.fetch });
    expect(client.baseUrl).toBe("https://api.test");
  });
});

describe("resources", () => {
  it("creates and lists chats", async () => {
    const chat = await vivid.chats.create({ language: "en" });
    expect(chat.id).toBe("chat_1");
    expect(chat.clientId).toBe("partner");
    expect(chat.createdAt?.getUTCFullYear()).toBe(2026);
    expect((await vivid.chats.list())[0].title).toBe("Hi");
    expect((await vivid.chats.messages("chat_1"))[0].usedTools).toBe(true);
  });

  it("requires a field to update a chat", async () => {
    await expect(vivid.chats.update("chat_1", {})).rejects.toThrow(/title or pinned/);
  });

  it("uploads from bytes and from text", async () => {
    const fromBytes = await vivid.attachments.upload(new Uint8Array([1, 2, 3]), {
      filename: "note.bin",
    });
    expect(fromBytes.id).toBe("att_1");
    expect(await vivid.attachments.upload("hello", { filename: "note.txt" })).toBeTruthy();
  });

  it("rejects an oversize upload before it leaves the machine", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    await expect(vivid.attachments.upload(big, { filename: "big.bin" })).rejects.toThrow(/10 MB/);
    expect(calls).toHaveLength(0);
  });

  it("rejects an empty upload and bytes without a filename", async () => {
    await expect(vivid.attachments.upload(new Uint8Array(0), { filename: "e" })).rejects.toThrow(
      /empty/,
    );
    await expect(vivid.attachments.upload(new Uint8Array([1]))).rejects.toThrow(/filename/);
  });

  it("lists artifacts, searches and checks health", async () => {
    expect((await vivid.artifacts.list())[0].mime).toBe("application/pdf");
    const results = await vivid.search("hi");
    expect(results[0].source).toBe("text");
    expect(results[0].score).toBe(0.9);
    expect((await vivid.health.check()).status).toBe("ok");
    expect((await vivid.health.models()).llm).toEqual({ ok: true });
  });
});
