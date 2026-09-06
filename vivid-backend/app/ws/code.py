"""The coding-agent websocket: /ws/code.

One connection is one editor session over one workspace. The loop runs here;
the tools run in the editor, so the protocol is a request/response inside a
stream — the server emits a tool_call and waits for the matching tool_result
while continuing to read the socket (so cancel still lands mid-tool).

client -> server:
  {type: "start",  task, workspace?, context?}
  {type: "tool_result", id, ok, content}
  {type: "cancel"}

server -> client:
  {type: "ready", model, max_steps}
  {type: "step", n, max}
  {type: "token", text}
  {type: "tool_call", id, name, arguments, needs_approval}
  {type: "tool_result", id, name, ok, preview}      echo, for the transcript
  {type: "usage", usage}
  {type: "done", reason, summary, steps}
  {type: "error", code, message}

Auth: connect with /ws/code?token=<access token>, same credential as /ws.
"""
import asyncio
import json
import logging

import jwt as pyjwt
from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from app.core.config import settings
from app.core.security import decode_token
from app.services.code_agent import CodeSession
from app.services.models_gateway import code_llm

router = APIRouter()
log = logging.getLogger("vivid.ws.code")

#: How long the editor has to answer one tool call. Generous because
#: run_command waits on a human approving it, then on a test suite.
TOOL_TIMEOUT = 600


@router.websocket("/ws/code")
async def code_endpoint(ws: WebSocket):
    token = ws.query_params.get("token")
    user_id = None
    if token:
        try:
            user_id = decode_token(token, "access")
        except pyjwt.InvalidTokenError:
            user_id = None

    await ws.accept()
    if user_id is None:
        await ws.send_json({"type": "error", "code": "unauthorized",
                            "message": "connect with /ws/code?token=<access token>"})
        await ws.close(code=4401)
        return
    if not code_llm.configured():
        await ws.send_json({"type": "error", "code": "not_configured",
                            "message": code_llm.missing()})
        await ws.close(code=1011)
        return

    await ws.send_json({"type": "ready", "model": code_llm.model_name(),
                        "max_steps": settings.CODE_MAX_STEPS})

    session: CodeSession | None = None
    pending: dict[str, asyncio.Future] = {}
    run_task: asyncio.Task | None = None
    cancel = asyncio.Event()
    send_lock = asyncio.Lock()

    async def emit(event: dict) -> None:
        # One writer at a time: the loop emits tokens while a tool result is
        # being echoed, and interleaved frames corrupt the stream.
        async with send_lock:
            try:
                await ws.send_json(event)
            except (WebSocketDisconnect, RuntimeError):
                cancel.set()

    async def call_tool(call: dict) -> dict:
        """Emitted by the loop; resolved by a tool_result frame."""
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        pending[call["id"]] = fut
        try:
            return await asyncio.wait_for(fut, timeout=TOOL_TIMEOUT)
        except asyncio.TimeoutError:
            return {"ok": False,
                    "content": f"the editor did not respond within {TOOL_TIMEOUT}s"}
        finally:
            pending.pop(call["id"], None)

    async def run(task: str) -> None:
        try:
            result = await session.run(task, emit, call_tool, cancel.is_set)
            await emit({"type": "done", **result})
        except asyncio.CancelledError:
            await emit({"type": "done", "reason": "cancelled", "summary": "",
                        "steps": 0})
            raise
        except Exception as e:                       # never kill the socket
            log.exception("coding agent turn failed")
            await emit({"type": "error", "code": "internal", "message": str(e)})
            await emit({"type": "done", "reason": "error", "summary": "",
                        "steps": 0})

    def busy() -> bool:
        return run_task is not None and not run_task.done()

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await emit({"type": "error", "code": "bad_frame",
                            "message": "expected JSON"})
                continue

            kind = msg.get("type")

            if kind == "tool_result":
                fut = pending.get(str(msg.get("id")))
                if fut is not None and not fut.done():
                    fut.set_result({"ok": bool(msg.get("ok", True)),
                                    "content": msg.get("content", "")})
                # An unmatched result is a late reply to a cancelled call.
                # Dropping it is correct; the loop stopped waiting.

            elif kind == "cancel":
                cancel.set()
                for fut in pending.values():
                    if not fut.done():
                        fut.set_result({"ok": False, "content": "cancelled by the user"})
                if busy():
                    run_task.cancel()

            elif kind == "start":
                task = (msg.get("task") or "").strip()
                if not task:
                    await emit({"type": "error", "code": "empty_task",
                                "message": "task is required"})
                    continue
                if busy():
                    await emit({"type": "error", "code": "busy",
                                "message": "a turn is already running; cancel it first"})
                    continue
                cancel.clear()
                if session is None:
                    # Built once per connection: a follow-up turn keeps every
                    # file the model already read, which is most of what makes
                    # the second question cheap.
                    session = CodeSession(workspace=msg.get("workspace") or "",
                                          context=msg.get("context") or "")
                run_task = asyncio.create_task(run(task))

            else:
                await emit({"type": "error", "code": "unknown_type",
                            "message": f"unknown frame type {kind!r}"})

    except WebSocketDisconnect:
        pass
    finally:
        cancel.set()
        if busy():
            run_task.cancel()
        for fut in pending.values():
            if not fut.done():
                fut.set_result({"ok": False, "content": "the editor disconnected"})
