"""Adapter for the reranker service (BGE-reranker-v2-m3 or similar behind
Hugging Face text-embeddings-inference: POST {base}/rerank).

Same contract as embeddings.py: until RERANKER_URL is set, rerank() returns
None and callers keep their own ordering. One cross-encoder serves both web
search snippets and the RAG corpus, so it earns its VRAM twice.

Request : {"query": str, "texts": [str, ...]}
Response: [{"index": int, "score": float}, ...]   (TEI) — or the same list
          under a "results" key for other servers.
"""
from app.core.config import settings
from app.services.models_gateway import http


async def rerank(query: str, docs: list[str], top_k: int | None = None
                 ) -> list[int] | None:
    """Indices into `docs`, best first. None when the service is not
    configured; raises on transport errors so callers can fall back."""
    if not settings.RERANKER_URL or not docs:
        return None
    base = settings.RERANKER_URL.rstrip("/")
    r = await http.client().post(f"{base}/rerank",
                                 json={"query": query, "texts": docs},
                                 timeout=15)
    r.raise_for_status()
    body = r.json()
    rows = body.get("results") if isinstance(body, dict) else body
    ranked = sorted((row for row in rows or [] if "index" in row),
                    key=lambda row: row.get("score", 0.0), reverse=True)
    order = [int(row["index"]) for row in ranked if 0 <= int(row["index"]) < len(docs)]
    return order[:top_k] if top_k else order
