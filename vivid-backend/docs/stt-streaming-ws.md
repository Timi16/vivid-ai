# Streaming STT websocket — contract for the 8002 server

The one place a websocket to the pod genuinely buys latency: partial
transcripts while the user is still speaking, and transcription that starts
before end-of-speech. (The LLM already streams via SSE — vLLM has no ws API,
and wrapping it would add a hop. TTS gains little: keep-alive HTTP per clause
is within a few ms of a ws frame.)

The web client ALREADY streams raw 16 kHz mono int16 PCM chunks to the
backend in real time, and the backend buffers them. When 8002 grows this
endpoint, the backend forwards those same chunks as they arrive instead of
buffering — no client change needed.

## Endpoint: `ws /stream` on 8002

Backend → server:

```
{"type": "start", "lang": "<code>|auto"}     first frame
<binary frames>                               raw 16 kHz mono int16 PCM
{"type": "end"}                               end of speech
```

Server → backend:

```
{"type": "partial", "text": "...", "language": "..."}   optional, as decoding advances
{"type": "final",  "text": "...", "language": "...", "auto": bool}
{"type": "error",  "msg": "..."}
```

Rules (same as the rest of the fleet):
- Stateless: one utterance per start/end cycle; no session memory.
- `auto` uses the existing detect_lang + transcript-vocabulary split; if the
  language head needs the full clip, partials may be English-decoded and the
  final corrects the language — the backend only persists the final.
- Cap buffered audio (30 s) exactly like the old /ws did.

## Backend side (when the endpoint exists)

`services/models_gateway/stt.py` grows `stream_transcribe()` used by the ws
handler: forward chunks as they arrive, surface `partial` events to the client
as `{"type": "transcript", "final": false}`, treat `final` as today's
transcript. HTTP `/transcribe` stays as the fallback path.
