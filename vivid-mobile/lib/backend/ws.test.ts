import { chatErrorMessage } from "./ws";

// The thread showed "LLM returned 404:" to a user, straight off the wire. The
// server writes those for its own log, so the app has to choose its own words.
describe("chatErrorMessage", () => {
  it("never shows the server's internals, whatever they say", () => {
    const message = chatErrorMessage({
      type: "error",
      code: "llm_error",
      message: 'LLM returned 404: {"detail":"model not found"}',
    });
    expect(message).toBe("Vivid is unavailable right now. Try again in a moment.");
  });

  it("keeps the server's wording where the server explains it better", () => {
    // step_limit is not in the table: it says what to do next, and nothing
    // written here would say it better.
    const text = "Stopped after 12 steps. Send another message to continue.";
    expect(chatErrorMessage({ type: "error", code: "step_limit", message: text })).toBe(text);
  });

  it("falls back to a sentence rather than a bare code", () => {
    expect(chatErrorMessage({ type: "error", code: "something_new" })).toBe(
      "Something went wrong. Try again."
    );
    expect(chatErrorMessage({ type: "error" })).toBe("Something went wrong. Try again.");
  });
});
