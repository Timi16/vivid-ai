// Webview side. Renders the event stream and sends prompts/approvals back.
(function () {
  const vscode = acquireVsCodeApi();
  const log = document.getElementById("log");
  const input = document.getElementById("input");
  const send = document.getElementById("send");
  const cancel = document.getElementById("cancel");

  let replyEl = null;   // the assistant paragraph currently being streamed into
  let busy = false;

  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  function append(el) {
    const stick = atBottom();
    log.appendChild(el);
    if (stick) log.scrollTop = log.scrollHeight;
  }
  function node(cls, text, tag) {
    const d = document.createElement(tag || "div");
    d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  }

  function setBusy(on) {
    busy = on;
    send.disabled = on;
    send.textContent = on ? "Working…" : "Send";
  }

  function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    append(node("msg user", text));
    input.value = "";
    replyEl = null;
    setBusy(true);
    vscode.postMessage({ type: "prompt", text });
  }

  send.addEventListener("click", submit);
  cancel.addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
  input.addEventListener("keydown", (e) => {
    // Enter sends; Shift+Enter is a newline, matching the terminal UI.
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });

  window.addEventListener("message", (e) => {
    const m = e.data;
    switch (m.type) {
      case "ready":
        append(node("note", `Vivid Code v${m.version} · ${m.root}`));
        break;

      case "token":
        if (!replyEl) { replyEl = node("msg reply", ""); append(replyEl); }
        replyEl.textContent += m.text;
        if (atBottom()) log.scrollTop = log.scrollHeight;
        break;

      case "reply_end":
        replyEl = null;
        break;

      case "tool_call": {
        replyEl = null;
        const d = node("tool");
        d.appendChild(document.createTextNode("▶ "));
        d.appendChild(node("name", m.name, "span"));
        const args = Object.entries(m.args || {})
          .map(([k, v]) => {
            const s = typeof v === "string" ? v : JSON.stringify(v);
            return `${k}=${s.length > 60 ? s.slice(0, 60).replace(/\n/g, "⏎") + "…" : s}`;
          })
          .join("  ");
        d.appendChild(node("args", " " + args, "span"));
        append(d);
        break;
      }

      case "tool_result": {
        const lines = (m.text || "").split("\n").slice(0, 4).join("\n");
        if (lines.trim()) append(node("result", lines));
        break;
      }

      case "diff": {
        const b = node("diff",
          `⇄ ${m.path}  ${m.delta >= 0 ? "+" : ""}${m.delta} lines — open diff`);
        b.addEventListener("click", () =>
          vscode.postMessage({ type: "openDiff", path: m.path, seq: m.seq }));
        append(b);
        break;
      }

      case "approval_request": {
        replyEl = null;
        const box = node("approval");
        box.appendChild(node("div", "Vivid wants to run a command:"));
        const pre = document.createElement("pre");
        pre.textContent = m.question;
        box.appendChild(pre);
        const row = node("row");
        const allow = document.createElement("button");
        allow.textContent = "Allow";
        const deny = document.createElement("button");
        deny.textContent = "Deny"; deny.className = "ghost";
        const answer = (ok) => {
          vscode.postMessage({ type: "approval", id: m.id, ok });
          box.replaceChildren(node("div", ok ? "✓ allowed" : "✕ denied"));
        };
        allow.addEventListener("click", () => answer(true));
        deny.addEventListener("click", () => answer(false));
        row.appendChild(allow); row.appendChild(deny);
        box.appendChild(row);
        append(box);
        allow.focus();
        break;
      }

      case "usage":
        // Only worth surfacing as it approaches the compaction threshold.
        if (m.budget && m.prompt > m.budget * 0.8) {
          append(node("note warn",
            `context ${m.prompt}/${m.budget} — older tool output will be compacted`));
        }
        break;

      case "info":
      case "seed":
        if (m.type === "seed") { input.value = m.text + input.value; input.focus(); }
        else append(node("note", m.message));
        break;

      case "warn":
        append(node("note warn", m.message));
        break;

      case "error":
        replyEl = null;
        append(node("note error", m.message));
        setBusy(false);
        break;

      case "turn_end":
        replyEl = null;
        setBusy(false);
        break;

      case "exit":
        append(node("note error", m.message));
        setBusy(false);
        break;
    }
  });
})();
