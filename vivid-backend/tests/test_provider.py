"""The provider switch: MODEL_PROVIDER moves model calls between our pods and
OpenRouter without anything above models_gateway noticing.

The upstreams are stubbed at the transport, so what is checked is the layer
this switch exists for — where the request goes, what the model is called
there, that the key rides along, and that the contract with the clients (WAV
audio, ISO language codes, the `vivid-*` aliases) survives the flip — not
vLLM's or OpenRouter's behaviour.
"""
import io
import json
import wave
from types import SimpleNamespace

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.services import prompt
from app.services.models_gateway import (catalog, code_llm, health, http, llm,
                                         provider, proxy, stt, tts)


@pytest.fixture(autouse=True)
def pods(monkeypatch):
    """A deployment with every pod configured and the switch at its default."""
    monkeypatch.setattr(settings, "MODEL_PROVIDER", "runpod")
    for override in ("LLM_PROVIDER", "CODE_LLM_PROVIDER", "ASR_PROVIDER", "TTS_PROVIDER"):
        monkeypatch.setattr(settings, override, "")
    monkeypatch.setattr(settings, "LLM_BASE_URL", "https://chat.test/v1")
    monkeypatch.setattr(settings, "LLM_MODEL", "vendor/chat-27b")
    monkeypatch.setattr(settings, "LLM_CONTEXT_TOKENS", 8192)
    monkeypatch.setattr(settings, "CODE_LLM_BASE_URL", "https://coder.test/v1")
    monkeypatch.setattr(settings, "CODE_LLM_MODEL", "vendor/devstral")
    monkeypatch.setattr(settings, "CODE_LLM_CONTEXT_TOKENS", 100_000)
    monkeypatch.setattr(settings, "ASR_BASE_URL", "https://asr.test")
    monkeypatch.setattr(settings, "TTS_BASE_URL", "")
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")
    monkeypatch.setattr(settings, "OPENROUTER_BASE_URL", "https://openrouter.test/api/v1")
    monkeypatch.setattr(settings, "OPENROUTER_CHAT_MODEL", "google/gemma-3-27b-it")
    monkeypatch.setattr(settings, "OPENROUTER_CODE_MODEL", "mistralai/devstral-2512")
    monkeypatch.setattr(settings, "OPENROUTER_CHAT_CONTEXT_TOKENS", 131_072)
    monkeypatch.setattr(settings, "OPENROUTER_CODE_CONTEXT_TOKENS", 262_144)
    monkeypatch.setattr(settings, "OPENROUTER_STT_MODEL", "openai/whisper-large-v3")
    monkeypatch.setattr(settings, "OPENROUTER_STT_LANGUAGES", ["en", "yo"])
    monkeypatch.setattr(settings, "OPENROUTER_TTS_MODEL", "hexgrad/kokoro-82m")
    monkeypatch.setattr(settings, "OPENROUTER_TTS_VOICE", "af_heart")
    monkeypatch.setattr(settings, "OPENROUTER_TTS_SAMPLE_RATE", 24_000)
    monkeypatch.setattr(settings, "OPENROUTER_APP_NAME", "Vivid AI")
    monkeypatch.setattr(settings, "OPENROUTER_SITE_URL", "")
    monkeypatch.setattr(settings, "OPENROUTER_PROVIDER_SORT", "latency")
    monkeypatch.setattr(settings, "TTS_CLEAN_IN_BACKEND", False)


@pytest.fixture
def on_openrouter(monkeypatch):
    """The switch flipped the way an operator would flip it: two env vars."""
    monkeypatch.setattr(settings, "MODEL_PROVIDER", "openrouter")
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "sk-or-test")


@pytest.fixture
def upstream(monkeypatch):
    """Replace the shared HTTP client with one whose transport records every
    request and answers with whatever the test queued."""
    seen: list[dict] = []
    replies: list[httpx.Response] = []

    def handler(request: httpx.Request) -> httpx.Response:
        content_type = request.headers.get("content-type", "")
        seen.append({"url": str(request.url),
                     "headers": dict(request.headers),
                     "json": (json.loads(request.content)
                              if content_type.startswith("application/json") else None),
                     "body": request.content})
        return replies.pop(0) if replies else httpx.Response(
            200, json={"choices": [{"message": {"content": "ok"}}]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(http, "client", lambda: client)

    class Upstream:
        requests = seen

        @staticmethod
        def reply(response: httpx.Response) -> None:
            replies.append(response)

        @staticmethod
        def sse(*events) -> httpx.Response:
            body = "".join(
                f"data: {e if isinstance(e, str) else json.dumps(e)}\n\n"
                for e in events)
            return httpx.Response(200, content=body.encode(),
                                  headers={"content-type": "text/event-stream"})

    return Upstream


# ------------------------------------------------------------------ resolution
def test_default_is_our_own_pods():
    chat = provider.endpoint(provider.CHAT)
    code = provider.endpoint(provider.CODE)
    assert (chat.provider, chat.base_url, chat.model) == (
        "runpod", "https://chat.test/v1", "vendor/chat-27b")
    assert (code.provider, code.base_url, code.model) == (
        "runpod", "https://coder.test/v1", "vendor/devstral")
    assert chat.headers == {} and code.headers == {}
    assert chat.configured and code.configured
    assert provider.endpoint(provider.ASR).url("/transcribe") == "https://asr.test/transcribe"
    # TTS rides on the ASR server until it has its own address.
    assert provider.endpoint(provider.TTS).base_url == "https://asr.test"


def test_one_pod_deployment_serves_the_coder_off_the_chat_pod(monkeypatch):
    monkeypatch.setattr(settings, "CODE_LLM_BASE_URL", "")
    monkeypatch.setattr(settings, "CODE_LLM_MODEL", "")
    code = provider.endpoint(provider.CODE)
    assert code.base_url == "https://chat.test/v1"
    assert code.model == "vendor/chat-27b"


def test_the_flip_moves_every_role_to_openrouter(on_openrouter):
    roles = {role: provider.endpoint(role) for role in provider.ROLES}
    assert {ep.provider for ep in roles.values()} == {"openrouter"}
    assert roles[provider.CHAT].url() == "https://openrouter.test/api/v1/chat/completions"
    assert roles[provider.CHAT].model == "google/gemma-3-27b-it"
    assert roles[provider.CODE].model == "mistralai/devstral-2512"
    assert roles[provider.ASR].model == "openai/whisper-large-v3"
    assert roles[provider.TTS].model == "hexgrad/kokoro-82m"
    assert roles[provider.CHAT].headers["Authorization"] == "Bearer sk-or-test"
    assert roles[provider.CHAT].headers["X-Title"] == "Vivid AI"
    assert "HTTP-Referer" not in roles[provider.CHAT].headers


def test_openrouter_code_model_falls_back_to_the_chat_model(on_openrouter, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_CODE_MODEL", "")
    assert provider.endpoint(provider.CODE).model == "google/gemma-3-27b-it"


def test_one_role_can_fail_over_on_its_own(monkeypatch):
    """The chat pod is fine, the coding pod died: only the coder moves."""
    monkeypatch.setattr(settings, "CODE_LLM_PROVIDER", "openrouter")
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "sk-or-test")
    assert provider.endpoint(provider.CHAT).provider == "runpod"
    assert provider.endpoint(provider.CODE).provider == "openrouter"
    assert provider.endpoint(provider.ASR).provider == "runpod"


def test_voice_can_stay_home_while_the_llms_move(on_openrouter, monkeypatch):
    """Only the LLM GPU died: the Nigerian voices are still worth keeping."""
    monkeypatch.setattr(settings, "ASR_PROVIDER", "runpod")
    monkeypatch.setattr(settings, "TTS_PROVIDER", "runpod")
    assert provider.endpoint(provider.CHAT).provider == "openrouter"
    assert provider.endpoint(provider.ASR).url("/transcribe") == "https://asr.test/transcribe"
    assert provider.endpoint(provider.TTS).provider == "runpod"


def test_openrouter_without_a_key_names_the_missing_variable(monkeypatch):
    monkeypatch.setattr(settings, "MODEL_PROVIDER", "openrouter")
    for role in provider.ROLES:
        ep = provider.endpoint(role)
        assert not ep.configured
        assert ep.missing == "OPENROUTER_API_KEY is not set"
    # ...and nothing above pretends otherwise.
    assert catalog.catalog() == []
    assert not code_llm.configured()
    assert code_llm.missing() == "OPENROUTER_API_KEY is not set"


def test_unconfigured_pods_name_their_variables(monkeypatch):
    monkeypatch.setattr(settings, "ASR_BASE_URL", "")
    assert provider.endpoint(provider.ASR).missing == "ASR_BASE_URL is not configured"
    assert "TTS_BASE_URL" in provider.endpoint(provider.TTS).missing


async def test_an_unconfigured_provider_fails_the_turn_with_the_reason(monkeypatch):
    monkeypatch.setattr(settings, "MODEL_PROVIDER", "openrouter")
    with pytest.raises(llm.LLMUnavailable, match="OPENROUTER_API_KEY"):
        async for _ in llm.stream_chat([{"role": "user", "content": "hi"}], 10):
            pass
    with pytest.raises(stt.STTUnavailable, match="OPENROUTER_API_KEY"):
        await stt.transcribe(b"", "en")
    with pytest.raises(tts.TTSUnavailable, match="OPENROUTER_API_KEY"):
        await tts.synthesize("hello", "en")


def test_health_describes_the_switch_without_the_key(on_openrouter):
    described = provider.describe(provider.CHAT)
    assert described == {"provider": "openrouter", "model": "google/gemma-3-27b-it",
                         "configured": True}
    assert "sk-or-test" not in json.dumps(described)


def test_pods_report_no_model_name():
    # Pods serve one thing each; there is no model name to report.
    assert provider.describe(provider.ASR) == {"provider": "runpod", "configured": True}


async def test_health_reports_the_openrouter_balance_and_audio_readiness(on_openrouter, upstream):
    """LLM calls go through on an empty balance; audio does not. The report
    says which, so a flip is checked before the first voice turn fails."""
    monkeypatch_min = settings.OPENROUTER_AUDIO_MIN_BALANCE
    upstream.reply(httpx.Response(200, json={"data": {"total_credits": 5, "total_usage": 1.25}}))
    upstream.reply(httpx.Response(200, json={"data": {"expires_at": "2026-10-06T19:34:03Z",
                                                     "is_free_tier": False}}))
    account = await health.openrouter_account()
    assert account == {"ok": True, "status": 200, "roles": list(provider.ROLES),
                       "balance_usd": 3.75, "audio_ready": True,
                       "audio_min_balance_usd": monkeypatch_min,
                       "key_expires_at": "2026-10-06T19:34:03Z", "free_tier": False}
    assert [r["url"] for r in upstream.requests[-2:]] == [
        "https://openrouter.test/api/v1/credits", "https://openrouter.test/api/v1/auth/key"]
    assert upstream.requests[-1]["headers"]["authorization"] == "Bearer sk-or-test"

    upstream.reply(httpx.Response(200, json={"data": {"total_credits": 0, "total_usage": 0.0003}}))
    upstream.reply(httpx.Response(200, json={"data": {}}))
    account = await health.openrouter_account()
    assert account["ok"] is True and account["audio_ready"] is False
    assert account["balance_usd"] == -0.0003


async def test_health_says_nothing_about_openrouter_when_nothing_is_routed_there(upstream):
    assert await health.openrouter_account() is None
    assert "openrouter" not in await health.check_all()


async def test_health_marks_a_rejected_key(on_openrouter, upstream):
    upstream.reply(httpx.Response(401, json={"error": {"message": "bad key"}}))
    upstream.reply(httpx.Response(401, json={"error": {"message": "bad key"}}))
    account = await health.openrouter_account()
    assert account["ok"] is False and account["status"] == 401


async def test_check_all_carries_the_account_entry(on_openrouter, upstream):
    report = await health.check_all()
    assert report["llm"]["provider"] == "openrouter"
    assert report["openrouter"]["roles"] == list(provider.ROLES)
    assert "sk-or-test" not in json.dumps(report)


# ------------------------------------------------------------------- settings
def test_a_misspelt_provider_refuses_to_boot():
    with pytest.raises(ValidationError, match="runpod, openrouter"):
        Settings(_env_file=None, MODEL_PROVIDER="azure")
    with pytest.raises(ValidationError, match="TTS_PROVIDER"):
        Settings(_env_file=None, TTS_PROVIDER="elevenlabs")


def test_provider_names_are_normalised():
    assert Settings(_env_file=None, MODEL_PROVIDER=" OpenRouter ").MODEL_PROVIDER == "openrouter"
    assert Settings(_env_file=None, CODE_LLM_PROVIDER="").CODE_LLM_PROVIDER == ""


# ------------------------------------------------------------ context windows
def test_context_windows_follow_the_live_upstream(on_openrouter):
    """The backend budgets history against the window; the number must be
    the live model's, not the pod's."""
    assert llm.context_tokens() == 131_072
    assert code_llm.context_tokens() == 262_144
    assert catalog.resolve("vivid-chat").context_tokens == 131_072
    assert catalog.resolve("vivid-code").context_tokens == 262_144


def test_context_windows_on_the_pods_are_the_pods():
    assert llm.context_tokens() == 8192
    assert catalog.resolve("vivid-code").context_tokens == 100_000


def test_history_is_kept_when_the_window_allows_it(on_openrouter, monkeypatch):
    """History lives on the backend. What changes with the provider is how
    much of it the window has room for: a prompt that squeezes history out
    of a pod's 8k window leaves it intact in OpenRouter's 128k."""
    monkeypatch.setattr(settings, "MAX_REPLY_TOKENS", 4096)
    monkeypatch.setattr(settings, "HISTORY_TOKEN_BUDGET", 5500)
    system = "x" * 4 * 3900  # ~3900 tokens: with the reply, nearly all of 8k
    history = [  # newest first, as the pipeline hands it over
        SimpleNamespace(role="assistant", content="earlier answer " * 40),
        SimpleNamespace(role="user", content="earlier question " * 40)]

    kept = prompt.build_messages(system, history, "and now?")
    assert [m["role"] for m in kept[1:-1]] == ["user", "assistant"]

    monkeypatch.setattr(settings, "MODEL_PROVIDER", "runpod")
    kept = prompt.build_messages(system, history, "and now?")
    assert [m["role"] for m in kept[1:-1]] == []


def test_the_coder_loop_budget_never_exceeds_the_live_window(on_openrouter, monkeypatch):
    monkeypatch.setattr(settings, "CODE_CONTEXT_TOKENS", 90_000)
    assert code_llm.loop_budget_tokens() == 90_000  # a bigger window is not a bigger budget
    monkeypatch.setattr(settings, "OPENROUTER_CODE_CONTEXT_TOKENS", 32_000)
    assert code_llm.loop_budget_tokens() == 28_800  # a smaller one wins, with margin


# ------------------------------------------------------------------ catalogue
def test_the_public_aliases_survive_the_flip(on_openrouter):
    """A client asks for `vivid-code` before and after; only the upstream
    behind it changes."""
    assert [m.id for m in catalog.catalog()] == ["vivid-code", "vivid-chat"]
    coder = catalog.resolve("vivid-code")
    assert coder.upstream_model == "mistralai/devstral-2512"
    assert coder.base_url == "https://openrouter.test/api/v1"
    assert catalog.resolve(None).id == "vivid-code"


# --------------------------------------------------------------------- chat
async def test_chat_stream_carries_the_key_and_the_openrouter_model(on_openrouter, upstream):
    # Framed the way OpenRouter frames it, keep-alive comment line included:
    # that line has no `data:` prefix and must be skipped, not parsed.
    upstream.reply(httpx.Response(200, content=(
        b'data: {"choices":[{"delta":{"content":"Bawo "}}]}\n\n'
        b': OPENROUTER PROCESSING\n\n'
        b'data: {"choices":[{"delta":{"content":"ni"},"finish_reason":"stop"}]}\n\n'
        b'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n'
        b'data: [DONE]\n\n')))
    events = [ev async for ev in llm.stream_chat(
        [{"role": "user", "content": "hi"}], max_tokens=32)]

    assert "".join(e["text"] for e in events if e["type"] == "token") == "Bawo ni"
    assert events[-1] == {"type": "usage", "finish_reason": "stop",
                          "usage": {"prompt_tokens": 5, "completion_tokens": 2}}

    sent = upstream.requests[-1]
    assert sent["url"] == "https://openrouter.test/api/v1/chat/completions"
    assert sent["headers"]["authorization"] == "Bearer sk-or-test"
    assert sent["headers"]["x-title"] == "Vivid AI"
    assert sent["json"]["model"] == "google/gemma-3-27b-it"
    assert sent["json"]["stream_options"] == {"include_usage": True}
    # Routing preference: which host answers decides time to first token.
    assert sent["json"]["provider"] == {"sort": "latency"}


async def test_routing_preference_is_optional(on_openrouter, upstream, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_PROVIDER_SORT", "")
    upstream.reply(upstream.sse({"choices": [{"delta": {"content": "hi"}}]}, "[DONE]"))
    async for _ in llm.stream_chat([{"role": "user", "content": "hi"}], 8):
        pass
    assert "provider" not in upstream.requests[-1]["json"]


async def test_the_pods_get_no_key(upstream):
    upstream.reply(upstream.sse({"choices": [{"delta": {"content": "hi"}}]}, "[DONE]"))
    async for _ in llm.stream_chat([{"role": "user", "content": "hi"}], 8):
        pass
    sent = upstream.requests[-1]
    assert sent["url"] == "https://chat.test/v1/chat/completions"
    assert "authorization" not in sent["headers"]
    assert sent["json"]["model"] == "vendor/chat-27b"
    assert "provider" not in sent["json"]  # vLLM would reject the field


async def test_a_mid_stream_openrouter_error_fails_the_turn_loudly(on_openrouter, upstream):
    """OpenRouter reports a provider falling over as a 200 with an error
    chunk. Without this the user would see an empty reply and no reason."""
    upstream.reply(upstream.sse(
        {"error": {"message": "Provider returned error", "code": 502}}, "[DONE]"))
    with pytest.raises(llm.LLMUnavailable, match="Provider returned error"):
        async for _ in llm.stream_chat([{"role": "user", "content": "hi"}], 8):
            pass


async def test_complete_uses_the_same_switch(on_openrouter, upstream):
    upstream.reply(httpx.Response(200, json={
        "choices": [{"message": {"content": "  A title  "}}]}))
    assert await llm.complete([{"role": "user", "content": "title?"}]) == "A title"
    sent = upstream.requests[-1]
    assert sent["headers"]["authorization"] == "Bearer sk-or-test"
    assert sent["json"]["model"] == "google/gemma-3-27b-it"


# -------------------------------------------------------------------- coder
async def test_coder_reassembles_unnumbered_tool_calls(on_openrouter, upstream):
    """vLLM numbers tool-call fragments; some providers behind OpenRouter send
    each call whole and unnumbered. Two of those must stay two calls."""
    upstream.reply(upstream.sse(
        {"choices": [{"delta": {"tool_calls": [
            {"id": "call_a", "function": {"name": "read_file",
                                          "arguments": '{"path": "a.py"}'}}]}}]},
        {"choices": [{"delta": {"tool_calls": [
            {"id": "call_b", "function": {"name": "read_file",
                                          "arguments": '{"path": "b.py"}'}}]},
                      "finish_reason": "tool_calls"}]},
        "[DONE]"))
    events = [ev async for ev in code_llm.stream_chat(
        [{"role": "user", "content": "read both"}], tools=[])]
    calls = next(e["calls"] for e in events if e["type"] == "tool_calls")
    assert [(c["id"], c["arguments"]["path"]) for c in calls] == [
        ("call_a", "a.py"), ("call_b", "b.py")]
    sent = upstream.requests[-1]
    assert sent["json"]["model"] == "mistralai/devstral-2512"
    assert sent["headers"]["authorization"] == "Bearer sk-or-test"


async def test_coder_still_reassembles_numbered_fragments(upstream):
    upstream.reply(upstream.sse(
        {"choices": [{"delta": {"tool_calls": [
            {"index": 0, "id": "c0", "function": {"name": "edit", "arguments": '{"pa'}}]}}]},
        {"choices": [{"delta": {"tool_calls": [
            {"index": 0, "function": {"arguments": 'th": "x"}'}}]}}]},
        "[DONE]"))
    events = [ev async for ev in code_llm.stream_chat([], tools=[])]
    calls = next(e["calls"] for e in events if e["type"] == "tool_calls")
    assert calls == [{"id": "c0", "name": "edit", "arguments": {"path": "x"},
                      "error": None}]


async def test_probe_hints_are_provider_aware(on_openrouter, upstream):
    """The vLLM restart hint is wrong advice on OpenRouter: there the fix is
    a different model."""
    upstream.reply(httpx.Response(200, json={
        "choices": [{"message": {"content": "I am ready."}}]}))
    report = await code_llm.probe_tool_support()
    assert report["provider"] == "openrouter"
    assert report["tool_calling"] is False
    assert "OPENROUTER_CODE_MODEL" in report["hint"]
    assert "vLLM" not in report["hint"]


# ---------------------------------------------------------------- /v1 proxy
async def test_the_v1_proxy_forwards_the_key(on_openrouter, upstream):
    """Vivid Code asks for `vivid-code`; the request that leaves carries
    OpenRouter's model id and the key, and the client sees neither."""
    upstream.reply(httpx.Response(200, json={
        "model": "mistralai/devstral-2512",
        "choices": [{"message": {"content": "ok"}}],
        "usage": {"total_tokens": 3}}))
    model = catalog.resolve("vivid-code")
    payload = proxy.build_payload(
        {"messages": [{"role": "user", "content": "hi"}]}, model, stream=False)
    result = await proxy.complete(model, payload)
    assert result["usage"] == {"total_tokens": 3}
    sent = upstream.requests[-1]
    assert sent["url"] == "https://openrouter.test/api/v1/chat/completions"
    assert sent["headers"]["authorization"] == "Bearer sk-or-test"
    assert sent["json"]["model"] == "mistralai/devstral-2512"
    assert sent["json"]["provider"] == {"sort": "latency"}


def test_a_client_cannot_steer_openrouter_routing_through_the_proxy(on_openrouter):
    """Routing is ours; a client naming its own `provider` is dropped."""
    model = catalog.resolve("vivid-code")
    payload = proxy.build_payload(
        {"messages": [], "provider": {"order": ["evil-host"]}}, model, stream=False)
    assert payload["provider"] == {"sort": "latency"}


async def test_the_v1_proxy_streams_with_the_key(on_openrouter, upstream):
    upstream.reply(upstream.sse(
        {"choices": [{"delta": {"content": "hi"}}]},
        {"choices": [], "usage": {"total_tokens": 4}},
        "[DONE]"))
    model = catalog.resolve("vivid-chat")
    streamed = proxy.StreamedCompletion(model, {"stream": True})
    chunks = [c async for c in streamed]
    assert chunks[0].startswith(b"data: ")
    assert streamed.usage == {"total_tokens": 4}
    assert upstream.requests[-1]["headers"]["authorization"] == "Bearer sk-or-test"


# ------------------------------------------------------------------ speech in
async def test_transcription_goes_to_openrouter_with_a_language_hint(on_openrouter, upstream):
    upstream.reply(httpx.Response(200, json={
        "text": "  Bawo ni  ", "language": "yoruba", "duration": 1.2}))
    text, detected = await stt.transcribe(b"RIFF....", "yo", "audio/wav")
    assert (text, detected) == ("Bawo ni", "yo")

    sent = upstream.requests[-1]
    assert sent["url"] == "https://openrouter.test/api/v1/audio/transcriptions"
    assert sent["headers"]["authorization"] == "Bearer sk-or-test"
    assert sent["headers"]["content-type"].startswith("multipart/form-data")
    body = sent["body"]
    assert b'name="model"\r\n\r\nopenai/whisper-large-v3' in body
    assert b'name="language"\r\n\r\nyo' in body
    assert b'name="response_format"\r\n\r\nverbose_json' in body
    assert b'filename="audio.wav"' in body and b"RIFF...." in body


async def test_transcription_leaves_unknown_languages_to_auto_detect(on_openrouter, upstream):
    """Whisper has no Igbo: sending "ig" is a 400. Omit the hint, keep the
    requested code when the transcriber reports nothing usable."""
    upstream.reply(httpx.Response(200, json={"text": "Kedu", "language": "igbo"}))
    assert await stt.transcribe(b"...", "ig", "audio/webm") == ("Kedu", "ig")
    assert b'name="language"' not in upstream.requests[-1]["body"]
    assert b'filename="audio.webm"' in upstream.requests[-1]["body"]

    upstream.reply(httpx.Response(200, json={"text": "Hello", "language": "english"}))
    assert await stt.transcribe(b"...", "auto") == ("Hello", "en")
    upstream.reply(httpx.Response(200, json={"text": "Hello"}))
    assert await stt.transcribe(b"...", "auto") == ("Hello", "en")
    upstream.reply(httpx.Response(200, json={"text": "Hm", "language": "klingon-ish"}))
    assert await stt.transcribe(b"...", "pcm") == ("Hm", "pcm")


async def test_transcription_errors_carry_openrouters_message(on_openrouter, upstream):
    upstream.reply(httpx.Response(402, json={"error": {"message": "Insufficient credits"}}))
    with pytest.raises(stt.STTUnavailable, match="Insufficient credits"):
        await stt.transcribe(b"...", "en")


async def test_the_pod_transcriber_is_untouched(upstream):
    upstream.reply(httpx.Response(200, json={"text": "How far", "language": "pcm"}))
    assert await stt.transcribe(b"...", "auto", "audio/webm") == ("How far", "pcm")
    sent = upstream.requests[-1]
    assert sent["url"] == "https://asr.test/transcribe"
    assert "authorization" not in sent["headers"]
    assert b'name="lang"\r\n\r\nauto' in sent["body"]


# ----------------------------------------------------------------- speech out
async def test_speech_comes_back_as_wav_whatever_openrouter_sends(on_openrouter, upstream):
    """The clients call playWavBase64 on every chunk; OpenRouter returns raw
    PCM. The header goes on here so the frontend never learns the difference."""
    pcm = bytes(range(256)) * 4  # 512 int16 frames
    upstream.reply(httpx.Response(200, content=pcm,
                                  headers={"content-type": "audio/pcm"}))
    out = await tts.synthesize("Hello there", "en", voice="amy")

    with wave.open(io.BytesIO(out)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, 24_000)
        assert w.readframes(w.getnframes()) == pcm

    sent = upstream.requests[-1]
    assert sent["url"] == "https://openrouter.test/api/v1/audio/speech"
    assert sent["headers"]["authorization"] == "Bearer sk-or-test"
    assert sent["json"] == {"model": "hexgrad/kokoro-82m", "input": "Hello there",
                            "voice": "af_heart", "response_format": "pcm"}


async def test_speech_errors_are_not_played_as_audio(on_openrouter, upstream):
    upstream.reply(httpx.Response(200, json={"error": {"message": "voice not found"}}))
    with pytest.raises(tts.TTSUnavailable, match="voice not found"):
        await tts.synthesize("Hello", "en")
    upstream.reply(httpx.Response(429, json={"error": {"message": "rate limited"}}))
    with pytest.raises(tts.TTSUnavailable, match="rate limited"):
        await tts.synthesize("Hello", "en")


async def test_the_pod_speaker_is_untouched(upstream):
    upstream.reply(httpx.Response(200, content=b"RIFFwav",
                                  headers={"content-type": "audio/wav"}))
    assert await tts.synthesize("Hello", "en_ng", voice="grace") == b"RIFFwav"
    sent = upstream.requests[-1]
    assert sent["url"] == "https://asr.test/speak"
    assert "authorization" not in sent["headers"]
    assert b"voice=grace" in sent["body"] and b"lang=en_ng" in sent["body"]
