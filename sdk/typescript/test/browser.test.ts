/** Browsing behaviour — the surface the SDK exists for. */
import { beforeEach, describe, expect, it } from "vitest";

import { CapacityExceeded, ElementNotFound, StaleRef, Vivid, formatStep, secret } from "../src/index.js";
import { createMock, type Recorded } from "./mock.js";

function makeClient(options: { failTimes?: number; failStatus?: number } = {}) {
  const mock = createMock(options);
  const vivid = new Vivid({
    apiKey: "vk_test",
    baseUrl: "https://api.test",
    fetch: mock.fetch,
  });
  return { vivid, calls: mock.calls };
}

let vivid: Vivid;
let calls: Recorded[];

beforeEach(() => {
  ({ vivid, calls } = makeClient());
});

describe("sessions", () => {
  it("authenticates and returns session info", async () => {
    const session = await vivid.browser.session();
    expect(session.id).toBe("bs_1");
    expect(session.closed).toBe(false);
    expect(calls[0].headers.authorization).toBe("Bearer vk_test");
    expect(calls[0].headers["user-agent"]).toMatch(/^vivid-ai-js\//);
  });

  it("closes idempotently", async () => {
    const session = await vivid.browser.session();
    await session.close();
    await session.close();
    expect(session.closed).toBe(true);
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it("explains itself when used after close", async () => {
    const session = await vivid.browser.session();
    await session.close();
    await expect(session.goto("https://example.com")).rejects.toThrow(/closed/);
  });

  it("lists sessions for the key", async () => {
    expect((await vivid.browser.sessions())[0].id).toBe("bs_1");
  });
});

describe("authenticated sessions", () => {
  it("requires allowedDomains, because a session with cookies must not roam", async () => {
    await expect(vivid.browser.session({ storageState: { cookies: [] } })).rejects.toThrow(
      /allowedDomains is required/,
    );
  });

  it("accepts storage state when domains are scoped", async () => {
    const session = await vivid.browser.session({
      storageState: { cookies: [{ name: "sid" }] },
      allowedDomains: ["example.com"],
    });
    expect(session.info.authenticated).toBe(true);
    expect(session.info.allowedDomains).toEqual(["example.com"]);
    expect(calls[0].body.storage_state).toEqual({ cookies: [{ name: "sid" }] });
  });

  it("round-trips storage state", async () => {
    const session = await vivid.browser.session({ allowedDomains: ["example.com"] });
    expect(await session.storageState()).toEqual({ cookies: [{ name: "sid" }] });
  });
});

describe("snapshots", () => {
  it("parses elements and their kinds", async () => {
    const session = await vivid.browser.session();
    const snap = await session.snapshot();
    expect(snap.title).toBe("Example");
    expect(snap.size).toBe(5);
    expect(snap.elements[3].kind).toBe("input/password");
  });

  it("prefers an exact label over an earlier substring match", async () => {
    // "Search products" comes first in the element list, so a naive substring
    // scan returns the wrong one.
    const session = await vivid.browser.session();
    const snap = await session.snapshot();
    expect(snap.find("Search").label).toBe("Search");
    expect(snap.find("Search products").label).toBe("Search products");
  });

  it("matches case-insensitively and filters by kind", async () => {
    const session = await vivid.browser.session();
    const snap = await session.snapshot();
    expect(snap.find("sign IN").label).toBe("Sign in");
    expect(snap.find("Password", { kind: "input/password" }).ref).toBe(3);
  });

  it("lists what was available when it cannot find the element", async () => {
    const session = await vivid.browser.session();
    const snap = await session.snapshot();
    expect(() => snap.find("Checkout")).toThrow(ElementNotFound);
    expect(() => snap.find("Checkout")).toThrow(/Sign in/);
  });
});

describe("stale refs", () => {
  it("rejects a ref from an earlier snapshot", async () => {
    // Refs are positional and regenerate on every snapshot. Acting on an old
    // one silently hits whatever now sits at that index, which is how an agent
    // clicks the wrong thing and reports success.
    const session = await vivid.browser.session();
    const first = await session.snapshot();
    const button = first.find("Sign in");
    await session.snapshot();
    await expect(session.click(button)).rejects.toThrow(StaleRef);
  });

  it("rejects a ref held across a navigation", async () => {
    const session = await vivid.browser.session();
    const snap = await session.snapshot();
    const el = snap.find("Sign in");
    await session.goto("https://example.com/other");
    await expect(session.click(el)).rejects.toThrow(/stale/i);
  });

  it("accepts a ref from the current snapshot", async () => {
    const session = await vivid.browser.session();
    const snap = await session.snapshot();
    await session.click(snap.find("Sign in"));
    const body = calls[calls.length - 1].body;
    expect(body.ref).toBe(4);
    expect(body.snapshot_id).toBe("snap_1");
  });

  it("accepts a bare number for parity with the HTTP API", async () => {
    const session = await vivid.browser.session();
    await session.snapshot();
    await session.click(2);
    expect(calls[calls.length - 1].body.ref).toBe(2);
  });
});

describe("credentials", () => {
  it("sends the real value but flags it secret", async () => {
    const session = await vivid.browser.session({ allowedDomains: ["example.com"] });
    const snap = await session.snapshot();
    await session.type(snap.find("Password"), secret("hunter2"));
    const body = calls[calls.length - 1].body;
    expect(body.value).toBe("hunter2"); // the browser needs the real one
    expect(body.secret).toBe(true); // ...and the service must mark the field
  });

  it("does not flag a plain string", async () => {
    const session = await vivid.browser.session();
    const snap = await session.snapshot();
    await session.type(snap.find("Email"), "bot@example.com");
    expect(calls[calls.length - 1].body.secret).toBeUndefined();
  });

  it("sends the value on submit", async () => {
    const session = await vivid.browser.session();
    const snap = await session.snapshot();
    await session.submit(snap.find("Search"), "annual report");
    expect(calls[calls.length - 1].body).toMatchObject({
      action: "submit",
      value: "annual report",
    });
  });
});

describe("managed tasks", () => {
  it("streams steps then exposes the result", async () => {
    const task = vivid.browser.run({ goal: "find pricing", url: "https://example.com" });
    const steps = [];
    for await (const step of task) steps.push(step);
    expect(steps.map((s) => s.action)).toEqual(["goto", "click"]);
    expect(steps[1].label).toBe("Pricing");
    expect((await task.result()).answer).toBe("Enterprise is $99/seat.");
  });

  it("drains the stream when result() is called first", async () => {
    const task = vivid.browser.run({ goal: "find pricing", url: "https://example.com" });
    expect((await task.result()).answer).toBe("Enterprise is $99/seat.");
    expect(task.steps).toHaveLength(2);
  });

  it("formats steps readably", () => {
    expect(formatStep({ index: 1, action: "click", url: "https://x", label: "Go", ok: true })).toBe(
      '1. click "Go" -> https://x',
    );
  });

  it("can reuse an authenticated session", async () => {
    const session = await vivid.browser.session({
      storageState: { cookies: [] },
      allowedDomains: ["example.com"],
    });
    await vivid.browser.run({ goal: "find the invoice", session }).result();
    const taskCall = calls.find((c) => c.path === "/v1/browser/tasks");
    expect(taskCall?.body.session_id).toBe("bs_1");
  });

  it("validates arguments before hitting the network", () => {
    expect(() => vivid.browser.run({ goal: "  ", url: "https://e.com" })).toThrow(/goal is required/);
    expect(() => vivid.browser.run({ goal: "x" })).toThrow(/url is required/);
    expect(() => vivid.browser.run({ goal: "x", url: "https://e.com", maxSteps: 99 })).toThrow(
      /maxSteps/,
    );
  });
});

describe("retries", () => {
  it("rides out capacity errors on safe calls", async () => {
    const { vivid: client, calls: recorded } = makeClient({ failTimes: 1, failStatus: 503 });
    expect((await client.browser.sessions())[0].id).toBe("bs_1");
    expect(recorded).toHaveLength(2);
  });

  it("never retries an action", async () => {
    // Repeating a click is a second real click. The error surfaces instead.
    const { vivid: client, calls: recorded } = makeClient({ failTimes: 1, failStatus: 503 });
    await expect(client.browser.session()).rejects.toThrow(CapacityExceeded);
    expect(recorded).toHaveLength(1);
  });

  it("carries the request id through", async () => {
    const { vivid: client } = makeClient({ failTimes: 1, failStatus: 503 });
    await expect(client.browser.session()).rejects.toMatchObject({ requestId: "req_retry" });
  });
});
