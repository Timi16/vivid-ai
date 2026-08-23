"""Adapter for the embeddings service (spec section 5: http, text -> vector).
The service is not deployed yet; until EMBEDDINGS_URL is set, embed() returns
None and search runs on Postgres full-text only. Adjust the request/response
shape here once the real service exists — nothing else needs to change."""
from app.core.config import settings
from app.services.models_gateway import http


async def embed(texts: list[str]) -> list[list[float]] | None:
    if not settings.EMBEDDINGS_URL or not texts:
        return None
    r = await http.client().post(settings.EMBEDDINGS_URL, json={"texts": texts},
                                 timeout=60)
    r.raise_for_status()
    body = r.json()
    if isinstance(body, list):
        return body
    return body.get("vectors") or body.get("embeddings")
