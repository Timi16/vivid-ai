"""The request flows from spec section 7 — the orchestration that used to live
on the 8002 pod service. RunPod now only serves dumb model endpoints (audio in
→ text, prompt in → token stream, text in → audio, text in → translation);
everything below — history, prompts, the tool loop, translation routing,
streaming glue, storage — is backend logic.

Text turn: save user message -> history -> [tool loop] -> assemble prompt ->
stream LLM tokens -> translate for yo/ig -> save assistant message -> jobs.

Voice turn: STT (fixed language or auto-detect) -> transcript event -> the
text turn with voice_reply=True. For TTS_STREAM_LANGS (Piper is ~0.2s/call)
the reply is spoken clause-by-clause as it is generated, so first audio does
not wait for the full answer; WazobiaVoice languages get one clip at the end.

Generation runs in its own task: a client disconnect stops the sends (the
Connection goes dead) but the turn still completes and is saved (spec 3.4).
"""
import asyncio
import base64
import io
import logging
import re
import time
import uuid
import wave
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.config import settings
from app.db.models import Attachment, Chat, Client, Message
from app.db.session import async_session
from app.services import agent, prompt, rate_limit, storage
from app.services.models_gateway import llm, stt, translate as translate_svc, tts

log = logging.getLogger("vivid.pipeline")

# Split at clause boundaries, not just full stops: waiting for "." meant ~30
# tokens before the first audio chunk. A comma is a natural breath and starts
# playback seconds earlier. (Ported from the pod pipeline.)
_SENT_SPLIT = re.compile(r"(?<=[.!?:;])\s+|(?<=,)\s+(?=\w)")
MIN_CHUNK_CHARS = 25  # don't synthesise "Yes," as its own clip


class Connection:
    """Send wrapper that goes quiet instead of raising once the socket dies."""

    def __init__(self, ws):
        self.ws = ws
        self.alive = True

    async def send(self, payload: dict) -> None:
        if not self.alive:
            return
        try:
            await self.ws.send_json(payload)
        except Exception:
            self.alive = False


async def _error(conn: Connection, chat_id: str | None, code: str, message: str):
    await conn.send({"type": "error", "chat_id": chat_id,
                     "code": code, "message": message})


def _pcm16k_to_wav(pcm: bytes, rate: int = 16000) -> bytes:
    """The UI streams raw 16 kHz mono int16 PCM over the ws while the user is
    still speaking; wrap it in a WAV header for the STT server and storage."""
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return out.getvalue()


def _merge_wavs(chunks: list[bytes]) -> bytes:
    if len(chunks) == 1:
        return chunks[0]
    out = io.BytesIO()
    with wave.open(io.BytesIO(chunks[0])) as first:
        params = first.getparams()
    with wave.open(out, "wb") as w:
        w.setparams(params)
        for c in chunks:
            with wave.open(io.BytesIO(c)) as r:
                w.writeframes(r.readframes(r.getnframes()))
    return out.getvalue()


def _superseded(cancel_event) -> bool:
    return cancel_event is not None and cancel_event.is_set()


async def run_text_turn(conn: Connection, state, user_id: str, chat_id: str,
                        text: str, attachment_ids: list[str] | None = None,
                        language: str | None = None, voice_reply: bool = False,
                        voice: str | None = None,
                        cancel_event=None) -> None:
    started = time.monotonic()
    text = (text or "").strip()
    if not chat_id:
        return await _error(conn, None, "bad_request", "chat_id is required")
    if not text:
        return await _error(conn, chat_id, "bad_request", "message text is empty")

    redis = state.redis
    if not await rate_limit.check_request(redis, user_id):
        return await _error(conn, chat_id, "rate_limited",
                            "too many requests, slow down a little")
    if not await rate_limit.acquire_generation(redis, user_id):
        return await _error(conn, chat_id, "busy",
                            "a reply is already being generated")
    try:
        await _run_text_turn(conn, state, user_id, chat_id, text,
                             attachment_ids or [], language, voice_reply,
                             voice, started, cancel_event)
    finally:
        await rate_limit.release_generation(redis, user_id)


async def _run_text_turn(conn, state, user_id, chat_id, text, attachment_ids,
                         language, voice_reply, voice, started,
                         cancel_event=None):
    # --- save the user message and load history ---
    async with async_session() as db:
        chat = await db.get(Chat, chat_id)
        if chat is None or chat.user_id != user_id:
            return await _error(conn, chat_id, "chat_not_found", "unknown chat")
        client_row = await db.get(Client, chat.client_id)
        language = language or chat.language or "en"
        if language == "auto":
            # auto is an STT concern; a typed message in an auto chat is
            # answered in English (the voice path passes the detected language).
            language = "en"

        atts: list[Attachment] = []
        if attachment_ids:
            atts = list((await db.execute(
                select(Attachment).where(Attachment.id.in_(attachment_ids),
                                         Attachment.user_id == user_id)
            )).scalars())

        user_msg = Message(chat_id=chat_id, role="user", content=text)
        db.add(user_msg)
        await db.flush()
        for a in atts:
            a.message_id = user_msg.id
            a.chat_id = chat_id
        chat.updated_at = datetime.now(timezone.utc)
        needs_title = chat.title is None
        await db.commit()
        user_msg_id = user_msg.id

        history = list((await db.execute(
            select(Message)
            .where(Message.chat_id == chat_id, Message.id != user_msg_id,
                   Message.role.in_(("user", "assistant")))
            .order_by(Message.created_at.desc())
            .limit(80)
        )).scalars())

    system_prompt = prompt.system_prompt_for(client_row, language, voice_reply)

    # --- one image per message rides along to the (vision-capable) LLM ---
    image_urls: list[str] = []
    for a in atts:
        if a.kind == "image" and not image_urls:
            try:
                data = await storage.download(a.storage_key)
                image_urls.append(
                    f"data:{a.mime};base64,{base64.b64encode(data).decode()}")
            except Exception as e:
                log.warning("could not load image attachment %s: %s", a.id, e)

    # --- tool loop (backend-side; the LLM endpoint knows nothing about tools) ---
    used_tools = False
    if (settings.TOOLS_ENABLED and language not in set(settings.NO_TOOLS_LANGS)
            and agent.wants_tools(text) and not image_urls):
        async def _status(label: str):
            await conn.send({"type": "tool_status", "chat_id": chat_id,
                             "text": label})
        extra, used_tools = await agent.gather_context(text, history, _status)
        system_prompt += extra

    if _superseded(cancel_event):
        return await conn.send({"type": "done", "chat_id": chat_id,
                                "message_id": None, "cancelled": True,
                                "usage": None})

    file_ctx = prompt.attachment_context(atts)
    messages = prompt.build_messages(system_prompt, history, text, file_ctx,
                                     images=image_urls)
    max_tokens = (prompt.voice_max_tokens(language) if voice_reply
                  else settings.MAX_REPLY_TOKENS)

    # --- clause-streamed TTS (Piper languages only; WazobiaVoice is ~6s/clip
    # regardless of length, and yo/ig must translate the whole text first) ---
    stream_tts = (voice_reply and language in set(settings.TTS_STREAM_LANGS)
                  and language not in translate_svc.TRANSLATE_LANGS)
    audio_parts: list[bytes] = []
    speak_q: asyncio.Queue | None = None
    speaker_task = None
    if stream_tts:
        speak_q = asyncio.Queue()

        async def _speaker():
            # Drains chunks in order, concurrently with generation — awaiting
            # TTS inline would stall the token loop.
            while True:
                s = await speak_q.get()
                if s is None:
                    return
                try:
                    wav = await tts.synthesize(s, language, voice)
                    audio_parts.append(wav)
                    await conn.send({"type": "audio_chunk", "chat_id": chat_id,
                                     "mime": "audio/wav",
                                     "data": base64.b64encode(wav).decode()})
                except Exception as e:
                    log.warning("streamed tts chunk failed: %s", e)

        speaker_task = asyncio.create_task(_speaker())

    async def _drain_speaker():
        if speaker_task is None:
            return
        try:
            await speak_q.put(None)
            await asyncio.wait_for(speaker_task, timeout=120)
        except Exception as e:
            log.warning("speaker drain failed: %s", e)
            speaker_task.cancel()

    # --- stream the reply ---
    parts: list[str] = []
    pending = ""
    usage = None
    cancelled = False

    async def _consume(msgs):
        nonlocal pending, usage, cancelled
        async for ev in llm.stream_chat(msgs, max_tokens):
            if _superseded(cancel_event):
                cancelled = True
                break
            if ev["type"] == "token":
                parts.append(ev["text"])
                await conn.send({"type": "token", "chat_id": chat_id,
                                 "text": ev["text"]})
                if stream_tts:
                    pending += ev["text"]
                    # Find the earliest boundary that yields a chunk worth
                    # speaking; an early comma must not block a later split.
                    while True:
                        m = _SENT_SPLIT.search(pending)
                        while m and len(pending[:m.end()].strip()) < MIN_CHUNK_CHARS:
                            m = _SENT_SPLIT.search(pending, m.end())
                        if not m:
                            break
                        chunk, pending = (pending[:m.end()].strip(),
                                          pending[m.end():])
                        if chunk:
                            await speak_q.put(chunk)
            elif ev["type"] == "usage":
                usage = ev["usage"]
        if stream_tts and pending.strip() and not cancelled:
            await speak_q.put(pending.strip())
            pending = ""

    try:
        await _consume(messages)
    except asyncio.CancelledError:
        cancelled = True  # client sent cancel; keep what was generated
    except llm.LLMUnavailable as e:
        if image_urls and not parts:
            # Vision may not be enabled on the served model (spec open
            # question #1) — degrade to a text-only answer, don't fail the turn.
            log.warning("vision request failed (%s); retrying text-only", e)
            await conn.send({"type": "tool_status", "chat_id": chat_id,
                             "text": "Image understanding isn't available yet — answering from the text."})
            try:
                await _consume(prompt.build_messages(system_prompt, history,
                                                     text, file_ctx))
            except asyncio.CancelledError:
                cancelled = True
            except llm.LLMUnavailable as e2:
                await _drain_speaker()
                log.warning("llm failed for chat %s: %s", chat_id, e2)
                return await _error(conn, chat_id, "llm_error", str(e2))
        else:
            await _drain_speaker()
            log.warning("llm failed for chat %s: %s", chat_id, e)
            return await _error(conn, chat_id, "llm_error", str(e))

    await _drain_speaker()
    if _superseded(cancel_event):
        cancelled = True

    reply_src = prompt.trim_incomplete("".join(parts))
    if not reply_src:
        if cancelled:
            return await conn.send({"type": "done", "chat_id": chat_id,
                                    "message_id": None, "cancelled": True,
                                    "usage": usage})
        return await _error(conn, chat_id, "empty_reply",
                            "the model returned no text")

    # --- translate for yo/ig (history keeps the English source) ---
    # ORDER INVARIANT: translate FIRST, speech-normalize LAST (inside the TTS
    # adapter / TTS server). Numbers must reach MADLAD as digits — it copies
    # them verbatim; spelled-out numbers would come back as token soup. On
    # translate failure the adapter returns the English text unchanged, and
    # speak_language() then routes to the en_ng voice — the turn never errors.
    translated = False
    reply = reply_src
    if language in translate_svc.TRANSLATE_LANGS and not cancelled:
        await conn.send({"type": "tool_status", "chat_id": chat_id,
                         "text": "Translating…"})
        reply = await translate_svc.translate(reply_src, language)
        translated = reply != reply_src

    # --- save the assistant message ---
    latency_ms = int((time.monotonic() - started) * 1000)
    async with async_session() as db:
        assistant_msg = Message(
            chat_id=chat_id, role="assistant", content=reply,
            model=settings.LLM_MODEL, used_tools=used_tools,
            tokens_in=(usage or {}).get("prompt_tokens"),
            tokens_out=(usage or {}).get("completion_tokens"),
            latency_ms=latency_ms)
        db.add(assistant_msg)
        chat = await db.get(Chat, chat_id)
        if chat:
            chat.updated_at = datetime.now(timezone.utc)
        await db.commit()
        assistant_msg_id = assistant_msg.id

    log.info("turn user=%s chat=%s lang=%s tools=%s latency_ms=%s tokens_in=%s tokens_out=%s",
             user_id, chat_id, language, used_tools, latency_ms,
             (usage or {}).get("prompt_tokens"), (usage or {}).get("completion_tokens"))

    # --- voice reply audio ---
    reply_wav = None
    if voice_reply and not cancelled:
        if stream_tts:
            if audio_parts:
                try:
                    reply_wav = _merge_wavs(audio_parts)
                except Exception as e:
                    log.warning("could not merge streamed audio: %s", e)
        else:
            try:
                reply_wav = await tts.synthesize(
                    reply, tts.speak_language(language, translated), voice)
                await conn.send({"type": "audio_chunk", "chat_id": chat_id,
                                 "mime": "audio/wav",
                                 "data": base64.b64encode(reply_wav).decode()})
            except Exception as e:
                log.warning("tts failed for chat %s: %s", chat_id, e)
                await _error(conn, chat_id, "tts_failed", str(e))
        if reply_wav:
            try:
                key = f"{user_id}/{chat_id}/{uuid.uuid4()}.wav"
                await storage.upload(key, reply_wav, "audio/wav")
                async with async_session() as db:
                    db.add(Attachment(message_id=assistant_msg_id,
                                      chat_id=chat_id, user_id=user_id,
                                      kind="audio", filename="reply.wav",
                                      storage_key=key, mime="audio/wav",
                                      size_bytes=len(reply_wav)))
                    await db.commit()
            except Exception as e:
                log.warning("could not store reply audio: %s", e)

    await conn.send({"type": "done", "chat_id": chat_id,
                     "message_id": assistant_msg_id, "cancelled": cancelled,
                     "translated": translated, "used_tools": used_tools,
                     "text": reply,
                     "source_text": reply_src if translated else None,
                     "usage": usage})

    # --- background jobs ---
    arq = getattr(state, "arq", None)
    if arq is not None:
        try:
            await arq.enqueue_job("embed_message", user_msg_id)
            await arq.enqueue_job("embed_message", assistant_msg_id)
            if needs_title:
                await arq.enqueue_job("generate_chat_title", chat_id)
        except Exception as e:
            log.warning("could not enqueue background jobs: %s", e)


async def run_voice_turn(conn: Connection, state, user_id: str, chat_id: str,
                         audio_bytes: bytes, language: str | None = None,
                         voice: str | None = None,
                         mime: str = "audio/webm",
                         cancel_event=None) -> None:
    async with async_session() as db:
        chat = await db.get(Chat, chat_id)
        if chat is None or chat.user_id != user_id:
            return await _error(conn, chat_id, "chat_not_found", "unknown chat")
        requested = language or chat.language or "en"

    if mime.startswith("audio/pcm"):
        audio_bytes = _pcm16k_to_wav(audio_bytes)
        mime = "audio/wav"

    try:
        transcript, detected = await stt.transcribe(audio_bytes, requested, mime)
    except stt.STTUnavailable as e:
        return await _error(conn, chat_id, "stt_failed", str(e))
    if not transcript:
        return await _error(conn, chat_id, "stt_empty",
                            "no speech recognised in the audio")

    await conn.send({"type": "transcript", "chat_id": chat_id,
                     "text": transcript, "language": detected,
                     "auto": requested == "auto", "final": True})

    # Store the user's audio; it gets linked to the user message in the text turn.
    attachment_ids: list[str] = []
    try:
        ext = "webm" if "webm" in mime else "wav"
        key = f"{user_id}/{chat_id}/{uuid.uuid4()}.{ext}"
        await storage.upload(key, audio_bytes, mime)
        async with async_session() as db:
            att = Attachment(chat_id=chat_id, user_id=user_id, kind="audio",
                             filename=f"voice-input.{ext}", storage_key=key,
                             mime=mime, size_bytes=len(audio_bytes))
            db.add(att)
            await db.commit()
            attachment_ids = [att.id]
    except Exception as e:
        log.warning("could not store input audio for chat %s: %s", chat_id, e)

    # In auto mode the voice persona follows the detected language, not a
    # client-picked voice meant for another language.
    await run_text_turn(conn, state, user_id, chat_id, transcript,
                        attachment_ids=attachment_ids, language=detected,
                        voice_reply=True,
                        voice=voice if requested != "auto" else None,
                        cancel_event=cancel_event)
