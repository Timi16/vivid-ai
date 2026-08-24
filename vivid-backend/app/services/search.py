"""Web search that survives voice input.

A raw transcript is a poor search query ("Hey Vivid, so what's happening with
that fuel thing in Lagos") and Tavily's ordering is generic, so web_search
and news run this pipeline instead of one basic call:

  1. rewrite   — one cheap LLM call turns the question into N keyword queries
                 ("Lagos fuel price", "petrol scarcity Lagos today", …)
  2. search    — the N queries hit Tavily in parallel; results are merged and
                 deduped by URL
  3. rerank    — a cross-encoder scores every snippet against the ORIGINAL
                 question (falls back to Tavily's score when RERANKER_URL is
                 unset) and the top SEARCH_TOP_K survive
  4. follow up — if the best snippet is thin, the page itself is fetched and
                 an extract appended. The planner is single-shot (it never
                 sees results, so it cannot chain read_url itself); doing it
                 here is what actually closes that gap.

Cost per call in Tavily credits: SEARCH_QUERY_VARIANTS × (2 advanced | 1 basic).
"""
import asyncio
import html
import logging
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services.models_gateway import http, llm, rerank

log = logging.getLogger("vivid.search")

SNIPPET_CHARS = 350     # per result, handed to the answering model
THIN_CHARS = 300        # best snippet shorter than this → read the page
EXTRACT_CHARS = 1200    # from the followed-up page
PAGE_CHARS = 2500       # read_url's own limit

_TAGS = re.compile(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", re.DOTALL | re.IGNORECASE)
_LINE_PREFIX = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s*")
_QUOTES = "\"'“”‘’`"


# ---------------------------------------------------------------- 1. rewrite
async def rewrite_queries(question: str, n: int) -> list[str]:
    """Voice transcripts make poor queries: filler words, no keywords, STT
    errors. One cheap rewrite lifts result quality more than any search
    parameter. Returns up to n distinct queries; falls back to the original
    question when the LLM is down or replies with nothing usable."""
    question = question.strip()[:500]
    n = max(1, n)
    today = datetime.now(ZoneInfo("Africa/Lagos")).strftime("%d %B %Y")
    plural = f"{n} different short web search queries" if n > 1 else "one short web search query"
    prompt = (
        f"Today is {today}. Turn the message below into {plural} that would "
        "find the answer. Keywords only: no punctuation, no numbering, no "
        "explanation, one query per line. Fix obvious speech-to-text "
        "mistakes. Add the place (e.g. Nigeria, Lagos) when the question is "
        "about a local matter and the place is not stated.\n\n"
        f"Message: {question}"
    )
    try:
        raw = await llm.complete([{"role": "user", "content": prompt}],
                                 max_tokens=24 * n + 16, temperature=0.2)
    except Exception as e:
        log.warning("query rewrite failed, searching the raw text: %s", e)
        return [question]
    queries: list[str] = []
    seen: set[str] = set()
    for line in raw.splitlines():
        q = _LINE_PREFIX.sub("", line).strip().strip(_QUOTES).strip()
        # A trailing colon or >12 words is prose ("Here are the queries:"),
        # not a query.
        if not q or q.endswith(":") or len(q.split()) > 12:
            continue
        if q.lower() in seen:
            continue
        seen.add(q.lower())
        queries.append(q)
        if len(queries) == n:
            break
    return queries or [question]


# ---------------------------------------------------------------- 2. search
async def tavily(query: str, topic: str | None, depth: str,
                 max_results: int = 5) -> list[dict]:
    payload = {"api_key": settings.TAVILY_API_KEY, "query": query[:400],
               "max_results": max_results, "search_depth": depth}
    if topic:
        payload["topic"] = topic
    r = await http.client().post("https://api.tavily.com/search", json=payload,
                                 timeout=25)
    r.raise_for_status()
    return [it for it in r.json().get("results", []) if it.get("url")]


def _url_key(url: str) -> str:
    u = url.split("#", 1)[0].strip().lower()
    u = re.sub(r"^https?://(www\.)?", "", u)
    return u.rstrip("/")


def merge(result_lists: list[list[dict]]) -> list[dict]:
    """Union of every query's results, one entry per page: the higher Tavily
    score and the longer snippet win. Ordered by score, best first."""
    by_url: dict[str, dict] = {}
    for results in result_lists:
        for it in results:
            key = _url_key(it["url"])
            cur = by_url.get(key)
            if cur is None:
                by_url[key] = dict(it)
                continue
            cur["score"] = max(cur.get("score", 0.0), it.get("score", 0.0))
            if len(it.get("content") or "") > len(cur.get("content") or ""):
                cur["content"] = it["content"]
    return sorted(by_url.values(), key=lambda it: it.get("score", 0.0), reverse=True)


# ---------------------------------------------------------------- 3. rerank
async def rank(question: str, results: list[dict], top_k: int) -> list[dict]:
    """Cross-encoder order when RERANKER_URL is set, else Tavily's."""
    if len(results) <= 1:
        return results[:top_k]
    docs = [f"{it.get('title', '')}\n{it.get('content', '')}" for it in results]
    try:
        order = await rerank.rerank(question, docs, top_k)
    except Exception as e:
        log.warning("reranker failed, keeping search order: %s", e)
        order = None
    if not order:
        return results[:top_k]
    return [results[i] for i in order]


# ---------------------------------------------------------------- 4. follow up
async def fetch_page_text(url: str, limit: int = PAGE_CHARS) -> str:
    """Plain text of a page (tags stripped). Shared with the read_url tool."""
    r = await http.client().get(url, timeout=20, follow_redirects=True)
    r.raise_for_status()
    text = html.unescape(_TAGS.sub(" ", r.text))
    return re.sub(r"\s+", " ", text).strip()[:limit]


# ---------------------------------------------------------------- pipeline
async def search(question: str, topic: str | None = None,
                 status=None) -> str:
    """The web_search / news tool body. Returns the observation string the
    answering model sees, or an "error: …" line."""
    question = question.strip()
    if not question:
        return "error: empty query"
    # Advanced extraction is worth its 2 credits when the planner picked
    # search deliberately; news is date-sorted headlines where basic suffices.
    depth = settings.TAVILY_SEARCH_DEPTH if topic is None else "basic"
    queries = await rewrite_queries(question, settings.SEARCH_QUERY_VARIANTS)
    log.info("search %r -> %s", question[:80], queries)

    outcomes = await asyncio.gather(
        *(tavily(q, topic, depth) for q in queries), return_exceptions=True)
    result_lists = [o for o in outcomes if isinstance(o, list)]
    if not result_lists:
        err = next(o for o in outcomes if isinstance(o, BaseException))
        raise err
    results = await rank(question, merge(result_lists), settings.SEARCH_TOP_K)
    if not results:
        return f"error: no results for {queries[0]!r}"

    lines = [f"{i}. {it.get('title', '').strip()}: "
             f"{(it.get('content') or '').strip()[:SNIPPET_CHARS]} "
             f"(source: {it['url']})"
             for i, it in enumerate(results, 1)]
    out = f"Search results for {queries[0]!r}:\n" + "\n".join(lines)

    best = results[0]
    if len((best.get("content") or "").strip()) < THIN_CHARS:
        if status:
            await status("Reading the top result…")
        try:
            text = await fetch_page_text(best["url"], EXTRACT_CHARS)
            if text:
                out += f"\nExtract from {best['url']}: {text}"
        except Exception as e:
            log.info("follow-up read of %s failed: %s", best["url"], e)
    return out
