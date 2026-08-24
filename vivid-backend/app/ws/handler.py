"""The one websocket per browser session (spec 3.4 / section 6).

client -> server:
  {type: "message", chat_id, text, attachment_ids[], language}
  {type: "audio_start", chat_id, language, voice?, mime?, dictate?}
    dictate: true streams rolling partial transcripts back while recording
  binary frames (or {type: "audio_chunk", data: <base64>}) — mic audio
  {type: "audio_end", chat_id}
  {type: "cancel", chat_id}

server -> client:
  token | tool_status | transcript | audio_chunk | done | error

Auth: connect with /ws?token=<access token>.
"""
import asyncio
import base64
import json
import logging

import jwt as pyjwt
from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from app.core.security import decode_token
from app.services import chat_pipeline
from app.services.chat_pipeline import Connection

router = APIRouter()
log = logging.getLogger("vivid.ws")

MAX_AUDIO_BYTES = 25 * 1024 * 1024
MIN_AUDIO_BYTES = 3200


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    user_id = None
    token = ws.query_params.get("token")
    if token:
        try:
            user_id = decode_token(token, "access")
        except pyjwt.InvalidTokenError:
            user_id = None

    await ws.accept()
    if user_id is None:
        await ws.send_json({"type": "error", "code": "unauthorized",
                            "message": "connect with /ws?token=<access token>"})
        await ws.close(code=4401)
        return

    conn = Connection(ws)
    state = ws.app.state
    gen_task: asyncio.Task | None = None
    gen_cancel: asyncio.Event | None = None
    gen_chat: str | None = None
    audio_chat = audio_lang = audio_voice = None
    audio_mime = "audio/webm"
    buf = bytearray()
    live_task: asyncio.Task | None = None

    def busy() -> bool:
        return gen_task is not None and not gen_task.done()

    def stop_live_transcribe() -> None:
        nonlocal live_task
        if live_task is not None:
            live_task.cancel()
            live_task = None

    async def supersede() -> bool:
        """A new request replaces an in-flight turn — the stale answer must
        never land after the fresh question. Give a finishing task a brief
        moment to end naturally, then signal the cooperative cancel flag AND
        cancel the task: task.cancel() alone proved unreliable (httpx can
        swallow the CancelledError mid-request and the turn runs to
        completion), so the pipeline also checks the flag at every phase
        boundary and per token. asyncio.wait (not wait_for) so the task's
        CancelledError — a BaseException — cannot kill this handler.
        Returns False only if the old turn refuses to die."""
        if not busy():
            log.info("supersede: no turn in flight")
            return True
        await asyncio.wait({gen_task}, timeout=0.6)
        if gen_task.done():
            log.info("supersede: turn finished naturally")
            return True
        log.info("supersede: cancelling in-flight turn")
        if gen_cancel is not None:
            gen_cancel.set()
        gen_task.cancel()
        await asyncio.wait({gen_task}, timeout=15.0)
        log.info("supersede: old turn done=%s cancelled=%s",
                 gen_task.done(), gen_task.cancelled())
        if gen_task.done() and gen_task.cancelled():
            # A hard-cancelled turn never got to send its own done event —
            # close it out so the client knows that turn is over.
            await conn.send({"type": "done", "chat_id": gen_chat,
                             "message_id": None, "cancelled": True,
                             "superseded": True, "usage": None})
        return gen_task.done()

    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break

            if msg.get("bytes") is not None:
                if audio_chat is None:
                    continue
                buf.extend(msg["bytes"])
                if len(buf) > MAX_AUDIO_BYTES:
                    stop_live_transcribe()
                    buf = bytearray()
                    audio_chat = None
                    await conn.send({"type": "error", "code": "audio_too_large",
                                     "message": "audio exceeds 25 MB"})
                continue

            if msg.get("text") is None:
                continue
            try:
                data = json.loads(msg["text"])
            except json.JSONDecodeError:
                await conn.send({"type": "error", "code": "bad_json",
                                 "message": "frames must be JSON or binary audio"})
                continue

            mtype = data.get("type")
            chat_id = data.get("chat_id")

            if mtype == "message":
                if not await supersede():
                    await conn.send({"type": "error", "chat_id": chat_id,
                                     "code": "busy",
                                     "message": "the previous reply could not be stopped"})
                    continue
                gen_cancel = asyncio.Event()
                gen_chat = chat_id
                gen_task = asyncio.create_task(chat_pipeline.run_text_turn(
                    conn, state, user_id, chat_id,
                    data.get("text") or "",
                    attachment_ids=data.get("attachment_ids") or [],
                    language=data.get("language"),
                    cancel_event=gen_cancel))

            elif mtype == "edit":
                # Edit-and-regenerate: truncate from the edited message, then
                # answer the new text. Supersede first — same as a new message.
                if not await supersede():
                    await conn.send({"type": "error", "chat_id": chat_id,
                                     "code": "busy",
                                     "message": "the previous reply could not be stopped"})
                    continue
                gen_cancel = asyncio.Event()
                gen_chat = chat_id
                gen_task = asyncio.create_task(chat_pipeline.run_edit_turn(
                    conn, state, user_id, chat_id,
                    data.get("message_id") or "",
                    data.get("text") or "",
                    cancel_event=gen_cancel))

            elif mtype == "audio_start":
                stop_live_transcribe()
                audio_chat = chat_id
                audio_lang = data.get("language")
                audio_voice = data.get("voice")
                audio_mime = data.get("mime") or "audio/webm"
                buf = bytearray()
                if data.get("dictate"):
                    # `buf` is read through the lambda so the task always sees
                    # the audio captured so far, chunk by chunk.
                    live_task = asyncio.create_task(
                        chat_pipeline.run_live_transcribe(
                            conn, state, user_id, chat_id,
                            lambda: bytes(buf),
                            language=audio_lang, mime=audio_mime))

            elif mtype == "audio_chunk":
                # JSON fallback for clients that can't send binary frames
                if audio_chat is None:
                    continue
                try:
                    buf.extend(base64.b64decode(data.get("data") or ""))
                except Exception:
                    await conn.send({"type": "error", "code": "bad_audio",
                                     "message": "audio_chunk data must be base64"})

            elif mtype == "audio_end":
                stop_live_transcribe()
                # transcribe_only: speech-to-text as an editable draft — no
                # turn runs, so it never competes with a generation.
                if data.get("transcribe_only"):
                    if audio_chat is None or len(buf) < MIN_AUDIO_BYTES:
                        await conn.send({"type": "error", "chat_id": audio_chat,
                                         "code": "no_audio",
                                         "message": "no audio received"})
                        continue
                    asyncio.create_task(chat_pipeline.run_transcribe_only(
                        conn, state, user_id, audio_chat, bytes(buf),
                        language=audio_lang, mime=audio_mime))
                    buf = bytearray()
                    audio_chat = None
                    continue
                if not await supersede():
                    await conn.send({"type": "error", "chat_id": audio_chat,
                                     "code": "busy",
                                     "message": "the previous reply could not be stopped"})
                    continue
                if audio_chat is None:
                    await conn.send({"type": "error", "code": "bad_request",
                                     "message": "send audio_start first"})
                    continue
                if len(buf) < MIN_AUDIO_BYTES:
                    await conn.send({"type": "error", "chat_id": audio_chat,
                                     "code": "no_audio",
                                     "message": "no audio received"})
                    continue
                gen_cancel = asyncio.Event()
                gen_chat = audio_chat
                gen_task = asyncio.create_task(chat_pipeline.run_voice_turn(
                    conn, state, user_id, audio_chat, bytes(buf),
                    language=audio_lang, voice=audio_voice, mime=audio_mime,
                    cancel_event=gen_cancel))
                buf = bytearray()
                audio_chat = None

            elif mtype == "cancel":
                if busy():
                    if gen_cancel is not None:
                        gen_cancel.set()
                    gen_task.cancel()

            else:
                await conn.send({"type": "error", "code": "unknown_type",
                                 "message": f"unknown message type '{mtype}'"})
    except WebSocketDisconnect:
        pass
    finally:
        # The generation task is deliberately NOT cancelled: it finishes and
        # saves, so the user sees the reply on reload (spec 3.4). Live
        # transcription serves only the open mic, so it dies with the socket.
        stop_live_transcribe()
        conn.alive = False
