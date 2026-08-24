"""A/B the web search pipeline on real transcripts, inside the backend
container: `make search-eval f=transcripts.txt` (or `make search-eval` for
the built-in sample).

Input: one transcript per line. Lines pasted straight from the backend log
(`tool web_search({'query': '…'})`) are understood too, so ten real turns can
be lifted from `make logs s=backend` without editing.

Per transcript it prints the rewritten queries, the top titles Tavily returns
for the RAW text at basic depth (the old behaviour, 1 credit), and what the
full pipeline hands the model. Credits per transcript ≈ 1 + variants × depth.
"""
import argparse
import asyncio
import re
import sys

from app.core.config import settings
from app.services import search
from app.services.models_gateway import http

SAMPLE = [
    "Hey Vivid, so what's happening with that fuel thing in Lagos",
    "erm what is the dollar to naira rate today in the black market",
    "who won the match yesterday between super eagles and them",
    "vivid abeg when is the next jamb registration closing",
    "what did the CBN say about the interest rate this week",
    "is there still that cholera outbreak in lagos or is it over",
    "how much is a bag of rice now in nigeria",
    "what's the latest on the minimum wage thing with the labour union",
    "vivid what time is the arsenal game today and which channel",
    "any news on the lagos calabar coastal road",
]
_LOG_LINE = re.compile(r"""web_search\(\{'query': '(.*?)'\}\)""")


def load(path: str | None) -> list[str]:
    if not path:
        return SAMPLE
    src = sys.stdin if path == "/dev/stdin" else open(path, encoding="utf-8")
    lines = [ln.strip() for ln in src if ln.strip()]
    out = []
    for ln in lines:
        m = _LOG_LINE.search(ln)
        out.append(m.group(1) if m else ln)
    return out or SAMPLE


async def one(text: str, baseline: bool) -> None:
    print("=" * 78)
    print(f"TRANSCRIPT: {text}")
    queries = await search.rewrite_queries(text, settings.SEARCH_QUERY_VARIANTS)
    print(f"REWRITES:   {queries}")
    if baseline:
        try:
            raw = await search.tavily(text, None, "basic")
            print("RAW/basic top titles:")
            for it in raw[:3]:
                print(f"  - {it.get('title', '')[:70]}  [{len(it.get('content') or '')} chars]")
        except Exception as e:
            print(f"RAW/basic failed: {e}")
    try:
        obs = await search.search(text)
    except Exception as e:
        obs = f"error: {e}"
    print("PIPELINE observation:")
    for ln in obs.splitlines():
        print("  " + ln[:160])


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="transcripts, one per line (- or /dev/stdin for stdin)")
    ap.add_argument("--no-baseline", action="store_true",
                    help="skip the raw-query basic search (saves 1 credit each)")
    a = ap.parse_args()
    if not settings.TAVILY_API_KEY:
        sys.exit("TAVILY_API_KEY is not set")
    path = "/dev/stdin" if a.file == "-" else a.file
    texts = load(path)
    print(f"{len(texts)} transcripts · depth={settings.TAVILY_SEARCH_DEPTH} · "
          f"variants={settings.SEARCH_QUERY_VARIANTS} · top_k={settings.SEARCH_TOP_K} · "
          f"reranker={'on' if settings.RERANKER_URL else 'off'}")
    try:
        for t in texts:
            await one(t, not a.no_baseline)
    finally:
        await http.aclose()


if __name__ == "__main__":
    asyncio.run(main())
