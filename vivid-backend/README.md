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

## Partner API (`/v1/browser`)

Authenticated by API key (`Authorization: Bearer vk_...`), which resolves
beside the user-token path in `api/deps.py`. Mint one with:

```bash
python -m app.scripts.create_api_key "Acme browsing" --max-sessions 5
```

```
POST   /browser/sessions            open (optionally authenticated + scoped)
GET    /browser/sessions            this key's live sessions
DELETE /browser/sessions/:id        close (idempotent)
POST   /browser/sessions/:id/goto   navigate
POST   /browser/sessions/:id/snapshot
POST   /browser/sessions/:id/text
POST   /browser/sessions/:id/act    click | type | submit
GET    /browser/sessions/:id/storage_state
POST   /browser/tasks               managed loop; SSE with {"stream": true}
```

Rules worth knowing before changing this code:

- **Session ids are server-issued and owned.** vivid-tools keys sessions by an
  arbitrary caller-supplied string, which with partners sharing the service
  would let anyone drive anyone else's browser. `services/browser_sessions.py`
  issues ids, stores the owner, and **fails closed** if Redis is down.
- **Authenticated sessions must declare `allowed_domains`.** They carry live
  cookies, and the controller picks navigation from page text an attacker can
  write. Enforced in the backend and again in vivid-tools.
- **Quota before capacity.** A key's concurrent sessions are checked before the
  browser pool is asked, and the pool now refuses rather than evicting its
  oldest session — an evicted authenticated session is a lost login.
- **The controller loop lives in `services/browsing.py`**, shared by the chat
  `browse` tool and the tasks endpoint, so the two cannot drift.

## Errors

Every REST error carries a stable code, plus a request id echoed in the
`X-Request-Id` header:

```json
{"error": {"code": "quota_exceeded", "message": "...", "request_id": "req_..."},
 "detail": "..."}
```

`detail` is a deprecated mirror kept so the current frontend, which reads it
directly, keeps showing real messages. Drop it once the frontend uses the SDK.

## Tests

```bash
pip install -r requirements-dev.txt && pip install -e ../sdk/python
pytest
```

No Postgres needed: the registry runs on a fake Redis and vivid-tools is
stubbed. `tests/test_sdk_contract.py` drives the published SDK against these
routes over an ASGI transport, so the two cannot drift apart silently. The
full-stack path stays `make smoke`.

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
- `web_search`/`news` run `services/search.py`: the question is rewritten into
  `SEARCH_QUERY_VARIANTS` keyword queries (voice transcripts make bad queries),
  searched in parallel, merged, reranked (`RERANKER_URL`, else Tavily's order)
  and the top page is read when its snippet is thin. Measure a change with
  `make search-eval f=transcripts.txt` (one transcript or `tool web_search(…)`
  log line per file line).
- Every table carries `client_id` (default `vivid_web`) — the B2B hook. Do not
  build the B2B flow yet.
