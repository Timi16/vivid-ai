from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # Model services on RunPod. Nothing else in the codebase may know these.
    LLM_BASE_URL: str = ""    # OpenAI-compatible root incl. /v1, e.g. https://<pod>-8000.proxy.runpod.net/v1
    LLM_MODEL: str = "RedHatAI/gemma-3-27b-it-quantized.w4a16"
    ASR_BASE_URL: str = ""        # STT server: /transcribe /health
    TTS_BASE_URL: str = ""        # TTS server: /speak /health (falls back to ASR_BASE_URL)
    TRANSLATE_BASE_URL: str = ""  # MADLAD server: /translate (falls back to ASR_BASE_URL)
    EMBEDDINGS_URL: str = ""  # optional; empty disables vector search (full-text still works)
    EMBEDDING_DIM: int = 768

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

    # Limits
    RATE_LIMIT_PER_MINUTE: int = 20
    DEFAULT_CLIENT_ID: str = "vivid_web"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
