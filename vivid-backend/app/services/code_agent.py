"""The coding agent loop.

Different from services/agent.py in every way that matters. That one makes ONE
planner call, allows three tools, scrapes JSON out of prose and answers a chat
message. This one runs a long native-tool-calling loop against the user's real
repository, where the model decides its own next step for dozens of steps.

The loop lives here; the tools run in the editor. `run()` is transport-free —
it emits events and awaits tool results through two callables, so the
websocket handler, a test, and any future transport all drive the same loop.

Context: Devstral serves 100k, but tool results are file contents and they
accumulate fast. Rather than dropping messages (which orphans a tool result
from the assistant turn that asked for it, and vLLM rejects that), oversized
and then oldest results are blanked in place. The conversation's shape stays
valid however long it runs.
"""
import asyncio
import json
import logging
from typing import Awaitable, Callable

from app.core.config import settings
from app.services import code_tools
from app.services.models_gateway import code_llm
from app.services.models_gateway.code_llm import CodeLLMUnavailable

log = logging.getLogger("vivid.code_agent")

#: Rough chars-per-token for budgeting. Deliberately low (real code tokenizes
#: worse than prose) so the estimate errs toward trimming early.
_CHARS_PER_TOKEN = 3.2

_TRIMMED = "[earlier tool result trimmed to fit the context window]"

#: Seconds before restarting a broken stream, multiplied by the attempt.
_RETRY_BACKOFF = 1.5


class CodeSession:
    """One agent conversation over one workspace. Held by the websocket for as
    long as the editor keeps the connection, so follow-up turns keep every
    file the model has already read."""

    def __init__(self, workspace: str = "", context: str = ""):
        self.messages: list[dict] = [
            {"role": "system",
             "content": code_tools.SYSTEM_PROMPT + self._preamble(workspace, context)}
        ]
        self.steps_used = 0

    @staticmethod
    def _preamble(workspace: str, context: str) -> str:
        out = ""
        if workspace:
            out += f"\n\nThe workspace root is named `{workspace}`."
        if context:
            # Open editors, selection, active file — whatever the extension
            # chose to send. Framed as a hint, not as fact the model may cite:
            # the file may have changed since, and only a read proves content.
            out += ("\n\nEditor context at the time of the request (a hint for "
                    f"where to start, not a substitute for reading files):\n{context}")
        return out

    # ------------------------------------------------------------------ loop
    async def run(self,
                  task: str,
                  emit: Callable[[dict], Awaitable[None]],
                  call_tool: Callable[[dict], Awaitable[dict]],
                  cancelled: Callable[[], bool] = lambda: False) -> dict:
        """Run one user turn to completion.

        emit(event)        -> pushes an event at the editor (token, tool_call,
                              step, error). Never awaited for a reply.
        call_tool(call)    -> executes one tool in the editor and resolves to
                              {"ok": bool, "content": str}.
        cancelled()        -> checked at every step and between tool calls.

        Returns {"reason": ..., "summary": ..., "steps": int}.
        """
        self.messages.append({"role": "user", "content": task})
        max_steps = settings.CODE_MAX_STEPS

        for step in range(1, max_steps + 1):
            if cancelled():
                return self._end("cancelled", "", step - 1)

            self._fit_context()
            await emit({"type": "step", "n": step, "max": max_steps})

            try:
                text, calls = await self._turn(emit, cancelled)
            except CodeLLMUnavailable as e:
                log.warning("coding model unavailable: %s", e)
                await emit({"type": "error", "code": "model_unavailable",
                            "message": str(e)})
                return self._end("error", str(e), step)

            if cancelled():
                return self._end("cancelled", "", step)

            if not calls:
                # A turn with no tool call is the model talking to the user —
                # a question, or an answer that needed no tools. The turn ends
                # and the socket waits for the next message.
                self.messages.append({"role": "assistant", "content": text})
                return self._end("answered", text, step)

            self.messages.append({
                "role": "assistant",
                "content": text or None,
                "tool_calls": [
                    {"id": c["id"], "type": "function",
                     "function": {"name": c["name"],
                                  "arguments": json.dumps(c["arguments"])}}
                    for c in calls
                ],
            })

            finished = None
            for call in calls:
                if cancelled():
                    return self._end("cancelled", "", step)

                if call["name"] == "finish":
                    finished = str(call["arguments"].get("summary") or "").strip()
                    self.messages.append({
                        "role": "tool", "tool_call_id": call["id"],
                        "name": "finish", "content": "acknowledged"})
                    continue

                result = await self._execute(call, emit, call_tool)
                self.messages.append({
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "name": call["name"],
                    "content": result,
                })

            if finished is not None:
                return self._end("finished", finished, step)

        # Out of steps. Not an error — a long task that needs another turn.
        await emit({"type": "error", "code": "step_limit",
                    "message": f"Stopped after {max_steps} steps. "
                               "Send another message to continue."})
        return self._end("step_limit", "", max_steps)

    async def _turn(self, emit, cancelled) -> tuple[str, list[dict]]:
        """One model call, retried as a whole if the stream breaks.

        The RunPod proxy drops long-lived streams often enough that without
        this a twelve-step session dies at step twelve and loses everything.
        Restarting is safe precisely here: self.messages is not touched until
        the turn COMPLETES, so a half-streamed turn left no trace in the
        conversation. The only casualty is prose the user already saw, so the
        editor gets a `retry` event telling it to discard the current line.
        """
        attempts = settings.CODE_STREAM_RETRIES
        for attempt in range(1, attempts + 1):
            text_parts: list[str] = []
            calls: list[dict] = []
            try:
                async for ev in code_llm.stream_chat(self.messages,
                                                     code_tools.SCHEMAS):
                    if cancelled():
                        break
                    if ev["type"] == "token":
                        text_parts.append(ev["text"])
                        await emit({"type": "token", "text": ev["text"]})
                    elif ev["type"] == "tool_calls":
                        calls = ev["calls"]
                    elif ev["type"] == "done":
                        if ev.get("usage"):
                            await emit({"type": "usage", "usage": ev["usage"]})
                return "".join(text_parts).strip(), calls

            except CodeLLMUnavailable as e:
                if attempt == attempts or cancelled():
                    raise
                log.warning("stream broke (attempt %d/%d), restarting turn: %s",
                            attempt, attempts, e)
                await emit({"type": "retry", "attempt": attempt,
                            "of": attempts, "reason": str(e),
                            "discard_text": bool(text_parts)})
                await asyncio.sleep(_RETRY_BACKOFF * attempt)

        raise CodeLLMUnavailable("stream retries exhausted")  # unreachable

    async def _execute(self, call: dict, emit, call_tool) -> str:
        """Hand one call to the editor and turn whatever comes back into a
        string the model can read. Every failure path returns an "error: …"
        observation rather than raising: the model recovers from a described
        failure, but a dropped result leaves it waiting forever."""
        name = call["name"]

        if call.get("error"):
            return f"error: {call['error']}. Call the tool again with valid JSON."

        if name not in code_tools.NAMES:
            return (f"error: no tool named {name!r}. Available tools: "
                    f"{', '.join(sorted(code_tools.NAMES))}.")

        await emit({"type": "tool_call", "id": call["id"], "name": name,
                    "arguments": call["arguments"],
                    "needs_approval": name in code_tools.APPROVAL})

        try:
            result = await call_tool(call)
        except Exception as e:                       # transport died, editor closed
            log.warning("tool %s failed in the editor: %s", name, e)
            return f"error: the editor could not run {name}: {e}"

        content = str(result.get("content", ""))
        ok = bool(result.get("ok", True))
        await emit({"type": "tool_result", "id": call["id"], "name": name,
                    "ok": ok, "preview": content[:400]})

        if not ok:
            return f"error: {content}" if content else f"error: {name} failed"

        limit = settings.CODE_MAX_TOOL_RESULT_CHARS
        if len(content) > limit:
            content = (content[:limit] +
                       f"\n[truncated — {len(content) - limit} more characters. "
                       "Read a line range, or narrow the search.]")
        return content or "(no output)"

    def _end(self, reason: str, summary: str, steps: int) -> dict:
        self.steps_used += steps
        return {"reason": reason, "summary": summary, "steps": steps}

    # --------------------------------------------------------------- context
    def _fit_context(self) -> None:
        """Blank the oldest tool results until the conversation fits.

        Messages are never removed. Dropping a `tool` message orphans it from
        the assistant turn holding its tool_call_id, and vLLM rejects the
        conversation outright — so old results are emptied in place instead,
        which is both valid and honest about what was lost.
        """
        budget = int(settings.CODE_CONTEXT_TOKENS * _CHARS_PER_TOKEN)
        total = sum(self._size(m) for m in self.messages)
        if total <= budget:
            return

        for msg in self.messages:
            if total <= budget:
                break
            if msg.get("role") != "tool":
                continue
            content = msg.get("content") or ""
            if len(content) <= len(_TRIMMED):
                continue
            total -= len(content) - len(_TRIMMED)
            msg["content"] = _TRIMMED

        if total > budget:
            log.warning("context still over budget after trimming: ~%d tokens",
                        int(total / _CHARS_PER_TOKEN))

    @staticmethod
    def _size(msg: dict) -> int:
        n = len(msg.get("content") or "")
        for tc in msg.get("tool_calls") or []:
            n += len(tc.get("function", {}).get("arguments") or "") + 40
        return n
