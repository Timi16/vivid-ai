# Vivid backend

The single backend between the web client and the model services on RunPod
(spec: `vivid-backend-spec.md`). Nothing talks to RunPod except this service.

## Run

```bash
cp .env.example .env            # repo root — fill in the RunPod URLs
docker compose up --build       # from the repo root
```

API at http://localhost:8000 (docs at `/docs`), MinIO console at
http://localhost:9001 (minioadmin/minioadmin).

## Layout

```
app/
  core/        config (env), JWT + password hashing
  db/          SQLAlchemy models (users, clients, chats, messages,
               attachments, message_embeddings) + engine/init
  api/routes/  /v1 REST: auth, chats, attachments, search, health
  ws/          /ws — the one websocket per browser session
  services/
    chat_pipeline.py   text + voice turn orchestration
    prompt.py          system prompts, history token budget, yo/ig base-lang map
    rate_limit.py      per-user rpm + one concurrent generation (Redis)
    storage.py         S3-compatible object storage (MinIO in dev)
    models_gateway/    one thin adapter per RunPod service:
                       llm (vLLM OpenAI-compatible, streaming), stt, tts,
                       translate, embeddings, health
  workers/     arq jobs: embed_message, generate_chat_title
```

## REST (all under /v1)

```
POST /auth/signup /auth/login /auth/refresh
GET  /chats                POST /chats
GET  /chats/:id/messages   DELETE /chats/:id
POST /attachments          GET  /attachments/:id
GET  /search?q=
GET  /health               GET  /health/models
```

## Websocket

Connect: `ws://…/ws?token=<access token>`

client → server: `message`, `audio_start` + binary frames (or base64
`audio_chunk`) + `audio_end`, `cancel`
server → client: `token`, `tool_status`, `transcript`, `audio_chunk`, `done`,
`error`

Generation survives a client disconnect: the reply is still saved, so it is
there on reload.

## Notes

- yo/ig follow the RunPod design: the LLM answers in English, the ASR server's
  `/translate` does the language work, history stores the English turns.
- TTS routes through the ASR server's `/speak` (keeps its `clean_for_tts`
  number-spelling) unless `TTS_BASE_URL` is set.
- `EMBEDDINGS_URL` unset → search uses Postgres full-text only; set it once the
  embeddings service exists (adapter: `services/models_gateway/embeddings.py`).
- Every table carries `client_id` (default `vivid_web`) — the B2B hook. Do not
  build the B2B flow yet.
