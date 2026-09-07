from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

#: Where chat completions may be sent. "runpod" is our own vLLM pods;
#: "openrouter" is the hosted fallback for the hours a GPU is down.
LLM_PROVIDERS = ("runpod", "openrouter")


class Settings(BaseSettings):
    APP_NAME: str = "Vivid AI"
    APP_VERSION: str = "0.1.0"
    ENV: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Infra
    DATABASE_URL: str = "postgresql+asyncpg://vivid:vivid@localhost:5432/vivid"
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    JWT_SECRET: str = "change-me-in-prod"
    # Identity is Decane's job: Google and emailed codes, no passwords. The
    # email+password endpoints remain only so automated tests can mint a
    # session without a real inbox. Never enable this in production.
    ALLOW_PASSWORD_AUTH: bool = False
    # Decane Connect (handles "Continue with Google" — no Google Cloud
    # registration needed). App/project id from the Decane dashboard; empty
    # disables the social login endpoint.
    DECANE_APP_ID: str = ""
    # Optional ES256 public key (SPKI PEM) from the dashboard for offline
    # verification; empty = fetch Decane's JWKS instead.
    DECANE_VERIFICATION_KEY: str = ""
    DECANE_API_BASE: str = "https://backend.decane.app"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Object storage (S3-compatible; MinIO in dev)
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    # Endpoint baked into presigned URLs the browser fetches. Inside docker the
    # backend reaches MinIO as http://minio:9000, which the browser cannot
    # resolve — so URLs are signed against this address instead when set.
    S3_PUBLIC_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "vivid"
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024
    # Which storage backend serves attachments: "s3" (MinIO, or real S3) or
    # "cloudinary". Cloudinary puts a CDN in front, which is the reason to
    # move: MinIO answers every image from the one VPS with nothing cached in
    # front of it. Switching does NOT move existing objects.
    STORAGE_DRIVER: str = "s3"
    # Was hardcoded. Real S3 and DO Spaces need their actual region; MinIO and
    # R2 ignore it, so the old constant worked by luck rather than design.
    S3_REGION: str = "us-east-1"

    # --- Cloudinary (STORAGE_DRIVER=cloudinary) --------------------------
    # Secrets, so they belong in app.env and never in git.
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    # Keeps Vivid's objects out of anything else the account holds.
    CLOUDINARY_FOLDER: str = "vivid"
    # Where the browser fetches from. Empty means res.cloudinary.com direct;
    # set it to a CDN host pointed at res.cloudinary.com as origin, and only
    # this line changes if the CDN does. Include the cloud name, exclude the
    # resource type — the driver appends /image/upload/... itself:
    #   direct:  https://res.cloudinary.com/<cloud-name>
    #   Fastly:  https://cdn.example.com/<cloud-name>
    CLOUDINARY_MEDIA_BASE_URL: str = ""
    CLOUDINARY_TIMEOUT: int = 60

    # --- Model provider switch ------------------------------------------
    # The one knob to flip when the GPUs are down. "runpod" (default) sends
    # every model call to our own pods below; "openrouter" sends the chat
    # assistant, the coding agent, speech-to-text and text-to-speech to
    # OpenRouter instead. Everything above services/models_gateway/provider.py
    # — the chat pipeline, history and token budgets, the /v1 proxy and its
    # `vivid-*` aliases, the frontend — is the same either way, so failing
    # over is an env change and a restart, not a client release.
    # Not moved: translation (MADLAD, on the ASR pod; yo/ig replies fall back
    # to English when it is down, as they already do), embeddings, reranker.
    MODEL_PROVIDER: str = "runpod"
    # Per-service overrides for a partial outage: one pod can fail over while
    # the rest stay home. Empty = follow MODEL_PROVIDER.
    LLM_PROVIDER: str = ""       # the chat assistant
    CODE_LLM_PROVIDER: str = ""  # the coding agent
    ASR_PROVIDER: str = ""       # speech-to-text
    TTS_PROVIDER: str = ""       # text-to-speech
    OPENROUTER_API_KEY: str = ""  # required whenever a provider above says openrouter
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    # OpenRouter's ids for the same LLMs the pods serve, so a bare flip keeps
    # the product's behaviour. Empty code model falls back to the chat one,
    # mirroring CODE_LLM_BASE_URL -> LLM_BASE_URL below.
    OPENROUTER_CHAT_MODEL: str = "google/gemma-3-27b-it"
    OPENROUTER_CODE_MODEL: str = "mistralai/devstral-2512"
    # The windows those models serve there. The backend clamps history to the
    # live window and advertises it on /v1/models, so these must be real.
    OPENROUTER_CHAT_CONTEXT_TOKENS: int = 131_072
    OPENROUTER_CODE_CONTEXT_TOKENS: int = 262_144
    # How OpenRouter picks among the hosts serving a model. Its default
    # (price-weighted) landed the chat model on a host with 1-4s to first
    # token; "latency" measured 0.7-1.3s on the same afternoon. A voice
    # assistant wants the fast one. Empty = OpenRouter's default routing.
    OPENROUTER_PROVIDER_SORT: str = "latency"  # "latency" | "throughput" | "price" | ""
    # Voice on OpenRouter: /audio/transcriptions and /audio/speech. Neither
    # has a Nigerian voice; this is degraded service, not parity. Pick from
    # /models?output_modalities=transcription and =speech.
    OPENROUTER_STT_MODEL: str = "openai/whisper-large-v3"
    # Language codes forwarded to the transcriber as a hint. Anything else
    # (Igbo and Pidgin, which Whisper does not know) is left to auto-detect —
    # sending an unknown code is a 400, not a shrug.
    OPENROUTER_STT_LANGUAGES: list[str] = ["en", "yo", "ha", "fr"]
    OPENROUTER_TTS_MODEL: str = "hexgrad/kokoro-82m"
    OPENROUTER_TTS_VOICE: str = "af_heart"
    # OpenRouter returns raw 16-bit mono PCM; the clients play WAV, so the
    # backend adds the header and needs the rate. 24 kHz is what kokoro, the
    # OpenAI voices and MAI-Voice produce; change it with the model.
    OPENROUTER_TTS_SAMPLE_RATE: int = 24_000
    # OpenRouter refuses audio (transcription) requests unless the account
    # holds at least this much credit, whatever the request would cost. It is
    # their rule, not ours; /health/models reports `audio_ready` against it so
    # an empty balance shows up before the first voice turn fails.
    OPENROUTER_AUDIO_MIN_BALANCE: float = 0.50
    # --- Image and video generation --------------------------------------
    # The pods serve no image or video model, so these go to OpenRouter
    # whatever MODEL_PROVIDER says, and the generate_image / generate_video
    # tools exist only while OPENROUTER_API_KEY is set. Nothing there makes
    # pictures for free: flux.2 klein is about $0.003 an image at 1K; video
    # is priced per clip and the cost is only known when the clip is done.
    # Pick from /models?output_modalities=image and =video.
    OPENROUTER_IMAGE_MODEL: str = "black-forest-labs/flux.2-klein-4b"
    OPENROUTER_IMAGE_RESOLUTION: str = "1K"  # 512 | 1K | 2K | 4K
    OPENROUTER_IMAGE_TIMEOUT: int = 120
    OPENROUTER_VIDEO_MODEL: str = "google/veo-3.1-fast"
    # Clip length ceiling; the model can ask for less. Longer clips cost more
    # and render longer, and a chat turn is waiting.
    OPENROUTER_VIDEO_MAX_SECONDS: int = 5
    # A clip renders asynchronously for minutes. The turn polls this often and
    # gives up after this long, so a stuck job cannot hold a user's only
    # generation slot forever.
    OPENROUTER_VIDEO_POLL_SECONDS: int = 5
    OPENROUTER_VIDEO_TIMEOUT: int = 300
    # Attribution headers OpenRouter shows on its rankings. Optional.
    OPENROUTER_SITE_URL: str = ""
    OPENROUTER_APP_NAME: str = "Vivid AI"

    # Model services on RunPod. Nothing else in the codebase may know these.
    LLM_BASE_URL: str = ""    # OpenAI-compatible root incl. /v1, e.g. https://<pod>-8000.proxy.runpod.net/v1
    LLM_MODEL: str = "RedHatAI/gemma-3-27b-it-quantized.w4a16"
    ASR_BASE_URL: str = ""        # STT server: /transcribe /health
    TTS_BASE_URL: str = ""        # TTS server: /speak /health (falls back to ASR_BASE_URL)
    TRANSLATE_BASE_URL: str = ""  # MADLAD server: /translate (falls back to ASR_BASE_URL)
    EMBEDDINGS_URL: str = ""  # optional; empty disables vector search (full-text still works)
    EMBEDDING_DIM: int = 768

    # --- Coding model (Devstral on RunPod) -------------------------------
    # Serves the /ws/code agent, which is a different animal from the chat
    # assistant: native tool calling, long loops, 100k context. Kept on its own
    # endpoint so the two never contend for the same GPU. Empty falls back to
    # LLM_BASE_URL, which will work but will be slow and share capacity.
    # vLLM MUST be started with --enable-auto-tool-choice --tool-call-parser
    # mistral; /v1/health/code reports it when it was not.
    CODE_LLM_BASE_URL: str = ""
    CODE_LLM_MODEL: str = "cyankiwi/Devstral-Small-2-24B-Instruct-2512-AWQ-4bit"
    CODE_LLM_TEMPERATURE: float = 0.15  # agentic edits want determinism, not variety
    CODE_LLM_TOP_P: float = 0.95
    CODE_LLM_TIMEOUT: int = 180
    CODE_MAX_REPLY_TOKENS: int = 4096
    # Served max_model_len is 100k; the loop budgets below it so a long tool
    # result cannot push a request over the served limit mid-session.
    CODE_CONTEXT_TOKENS: int = 90000
    # The served window itself, as advertised to clients through /v1/models.
    # Distinct from CODE_CONTEXT_TOKENS above: that is the loop's self-imposed
    # budget, this is what the pod will actually accept, and a client sizing
    # its own context needs the real number.
    CODE_LLM_CONTEXT_TOKENS: int = 100_000
    # Tool calls per user turn. Real refactors run 20-40; the cap is a runaway
    # guard, and hitting it ends the turn cleanly rather than erroring.
    CODE_MAX_STEPS: int = 50
    # Whole-turn restarts when the stream breaks mid-flight. The RunPod proxy
    # drops long streams; without this a twelve-step session dies at step
    # twelve. Safe because a half-streamed turn leaves the conversation
    # untouched (see code_agent._turn).
    CODE_STREAM_RETRIES: int = 3
    # One tool result's ceiling. A 4000-line file read whole would otherwise
    # evict everything the model has learned so far.
    CODE_MAX_TOOL_RESULT_CHARS: int = 60000

    # Tool loop (runs in the backend, never on the pod)
    TOOLS_ENABLED: bool = True
    TAVILY_API_KEY: str = ""  # empty disables web_search/news; other tools still work
    # Web search quality (services/search.py). Tavily credits per web_search
    # call = SEARCH_QUERY_VARIANTS x (2 if advanced else 1); news always runs
    # basic. Dial these down first if the Tavily budget bites.
    TAVILY_SEARCH_DEPTH: str = "advanced"  # "basic" (1 credit) | "advanced" (2, better extraction)
    SEARCH_QUERY_VARIANTS: int = 3  # rewritten queries searched in parallel; 1 = single rewrite
    SEARCH_TOP_K: int = 3  # snippets handed to the model after reranking
    # Cross-encoder reranker (BGE-reranker-v2-m3 behind TEI: {url}/rerank).
    # Empty keeps Tavily's ordering. Shared with RAG once that exists.
    RERANKER_URL: str = ""
    # Code-execution sandbox (its own locked-down container — model-generated
    # code must NEVER run in this process; empty disables the run_code tool)
    SANDBOX_URL: str = ""
    SANDBOX_RUN_TIMEOUT: int = 12  # seconds per program
    # vivid-tools browser service (Playwright); empty disables browse_page
    VIVID_TOOLS_URL: str = ""
    VIVID_TOOLS_TOKEN: str = ""
    # --- partner browsing API (/v1/browser) ---
    # Concurrent browser sessions one API key may hold. The tier's own ceiling
    # is BROWSER_max_sessions in vivid-tools; this stops a single partner
    # taking all of it. Overridable per key on the api_keys row.
    BROWSER_SESSIONS_PER_KEY: int = 3
    # Seconds a session may sit idle before it is reaped. Longer than
    # vivid-tools' own default because an authenticated session is expensive
    # to rebuild — losing one means redoing a login.
    BROWSER_SESSION_TTL: int = 900
    BROWSER_SESSION_TTL_MAX: int = 3600
    # Steps a managed browsing task may take. The chat tool keeps its own,
    # tighter budget (a chat turn cannot wait for 20 page loads).
    BROWSER_TASK_MAX_STEPS: int = 30
    BROWSER_TASK_DEFAULT_STEPS: int = 8
    # WORKAROUND, not a design rule: tools are skipped for these languages
    # while MADLAD translation is unreliable — the answer falls back to
    # English anyway, so the planner call buys nothing visible.
    # TODO: empty this once translation is fixed. A tool-free answer to a
    # factual question is a HALLUCINATED answer.
    NO_TOOLS_LANGS: list[str] = ["yo", "ig"]

    # Interim, deliberately: speech normalization (clean_for_tts) runs in the
    # backend before calling TTS. Its better home is the TTS server itself —
    # the last stop before audio, so every caller benefits and the wav cache
    # keys on normalized text. Flip to False once the pod TTS applies it
    # server-side (patch: docs/tts-server-normalization.md).
    TTS_CLEAN_IN_BACKEND: bool = True

    # Generation
    LLM_CONTEXT_TOKENS: int = 8192  # served model's max_model_len
    HISTORY_TOKEN_BUDGET: int = 5500  # upper bound; the context clamp may lower it
    MAX_REPLY_TOKENS: int = 4096
    MAX_CONTINUATIONS: int = 2  # extra rounds when a reply hits the token cap
    LLM_TEMPERATURE: float = 1.0
    LLM_TOP_P: float = 0.95
    # Languages whose voice replies stream clause-by-clause into TTS (Piper is
    # ~0.2s/clip; WazobiaVoice is ~6s/clip regardless of length, and yo/ig
    # must translate the full text first — those get one clip at the end).
    TTS_STREAM_LANGS: list[str] = ["en"]

    # --- /v1 model proxy (Vivid Code, the VS Code extension, the editor) ---
    # Developer tools speak OpenAI over /v1/chat/completions. They point here
    # rather than at a pod so every call carries a Vivid identity. Turning this
    # off leaves those clients with nowhere to go — it is not a safe default.
    MODEL_PROXY_ENABLED: bool = True
    # Ceiling on max_tokens for one proxied reply. A tool-calling agent asks
    # for a lot; this stops a single client reserving the whole KV cache.
    MODEL_PROXY_MAX_TOKENS: int = 16384
    # Proxy calls a minute, per credential. Separate from RATE_LIMIT_PER_MINUTE
    # because an agent loop makes many small calls per human action, where a
    # chat turn makes one.
    MODEL_PROXY_RATE_LIMIT_PER_MINUTE: int = 120

    # Limits
    RATE_LIMIT_PER_MINUTE: int = 20
    DEFAULT_CLIENT_ID: str = "vivid_web"

    # Operator view of /v1/health/models and /v1/health/code: which provider
    # and model serve each role, the OpenRouter balance and key expiry. The
    # routes are public for the app's sake, so this bearer token gates the
    # detail. Empty = the detail is never shown. Generate: openssl rand -hex 24
    HEALTH_TOKEN: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("MODEL_PROVIDER", "LLM_PROVIDER", "CODE_LLM_PROVIDER",
                     "ASR_PROVIDER", "TTS_PROVIDER")
    @classmethod
    def _known_provider(cls, value: str, info) -> str:
        """Refuse to boot on a misspelt provider. This switch gets flipped in
        a hurry, at the moment a GPU dies; a typo must fail at startup, not
        on the first chat turn after the restart."""
        value = value.strip().lower()
        if value == "" and info.field_name != "MODEL_PROVIDER":
            return value  # an override left empty follows the master switch
        if value not in LLM_PROVIDERS:
            raise ValueError(
                f"{info.field_name} must be one of {', '.join(LLM_PROVIDERS)}, "
                f"not {value!r}")
        return value


settings = Settings()
