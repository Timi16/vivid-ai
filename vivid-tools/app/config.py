from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    token: str = ""                      # BROWSER_TOKEN; empty disables auth (dev only)
    session_ttl: int = 600               # seconds idle before a context is closed
    max_sessions: int = 8                # each context is ~150-250MB of RAM
    nav_timeout_ms: int = 20_000
    max_text_chars: int = 2000
    max_elements: int = 40
    allow_private_hosts: bool = False     # keep False: the caller is an LLM

    class Config:
        env_prefix = "BROWSER_"
        env_file = ".env"


@lru_cache
def settings() -> Settings:
    return Settings()
