"""Tool implementations for the agent loop. All of this is CPU + network I/O —
exactly the work that moves OFF the GPU pod: every tool that ran there was
another way to crash or stall the process serving the model.

Each tool returns a short plain-text observation for the prompt, or raises;
run() converts failures into an "error: …" observation so the LLM can say it
could not check rather than inventing an answer.
"""
import ast
import html
import operator
import re
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings
from app.services.models_gateway import http

_HEADERS = {"User-Agent": "VividAI-backend/0.1"}


async def _get_json(url: str, params: dict | None = None):
    r = await http.client().get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------- now
async def tool_now(args: dict) -> str:
    now = datetime.now(ZoneInfo("Africa/Lagos"))
    return now.strftime("Current date and time in Nigeria (WAT): %A %d %B %Y, %H:%M")


# ---------------------------------------------------------------- calculate
_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod, ast.Pow: operator.pow,
        ast.USub: operator.neg, ast.UAdd: operator.pos}


def _eval_node(node):
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval_node(node.operand))
    raise ValueError("unsupported expression")


async def tool_calculate(args: dict) -> str:
    expr = str(args.get("expression", "")).replace(",", "").replace("^", "**")
    result = _eval_node(ast.parse(expr, mode="eval"))
    return f"{expr} = {result:,.6f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------- weather
_WEATHER_CODES = {0: "clear sky", 1: "mainly clear", 2: "partly cloudy",
                  3: "overcast", 45: "fog", 51: "light drizzle",
                  61: "light rain", 63: "rain", 65: "heavy rain",
                  80: "rain showers", 95: "thunderstorm"}


async def tool_weather(args: dict) -> str:
    city = str(args.get("city", "Lagos"))
    geo = await _get_json("https://geocoding-api.open-meteo.com/v1/search",
                          {"name": city, "count": 1})
    if not geo.get("results"):
        return f"error: could not find a place called '{city}'"
    place = geo["results"][0]
    wx = await _get_json(
        "https://api.open-meteo.com/v1/forecast",
        {"latitude": place["latitude"], "longitude": place["longitude"],
         "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m"})
    cur = wx["current"]
    desc = _WEATHER_CODES.get(cur.get("weather_code"), "")
    return (f"Weather in {place['name']}, {place.get('country', '')}: "
            f"{cur['temperature_2m']}°C, {desc}, humidity {cur['relative_humidity_2m']}%, "
            f"wind {cur['wind_speed_10m']} km/h")


# ---------------------------------------------------------------- exchange rate
async def tool_exchange_rate(args: dict) -> str:
    base = str(args.get("base", "USD")).upper()
    quote = str(args.get("quote", "NGN")).upper()
    data = await _get_json(f"https://open.er-api.com/v6/latest/{base}")
    rate = (data.get("rates") or {}).get(quote)
    if rate is None:
        return f"error: no rate for {base}/{quote}"
    return f"Exchange rate: 1 {base} = {rate:,.2f} {quote} (source: open.er-api.com)"


# ---------------------------------------------------------------- crypto price
_COIN_IDS = {"btc": "bitcoin", "bitcoin": "bitcoin", "eth": "ethereum",
             "ethereum": "ethereum", "sol": "solana", "solana": "solana",
             "bnb": "binancecoin", "xrp": "ripple", "ada": "cardano",
             "doge": "dogecoin", "dogecoin": "dogecoin", "usdt": "tether",
             "ton": "the-open-network", "sui": "sui", "ltc": "litecoin"}


async def tool_crypto_price(args: dict) -> str:
    raw = str(args.get("symbol", "bitcoin")).lower().strip()
    coin = _COIN_IDS.get(raw, raw)
    data = await _get_json("https://api.coingecko.com/api/v3/simple/price",
                           {"ids": coin, "vs_currencies": "usd,ngn"})
    if coin not in data:
        return f"error: unknown coin '{raw}'"
    p = data[coin]
    ngn = f", ₦{p['ngn']:,.0f}" if "ngn" in p else ""
    return f"Current {coin} price: ${p['usd']:,.2f}{ngn} (source: CoinGecko)"


# ---------------------------------------------------------------- wikipedia
async def tool_wikipedia(args: dict) -> str:
    query = str(args.get("query", ""))
    hits = await _get_json("https://en.wikipedia.org/w/api.php",
                           {"action": "opensearch", "search": query,
                            "limit": 1, "format": "json"})
    if not hits[1]:
        return f"error: no Wikipedia article found for '{query}'"
    title = hits[1][0]
    page = await _get_json(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" + title.replace(" ", "_"))
    return f"Wikipedia — {title}: {page.get('extract', 'no summary')[:900]}"


# ---------------------------------------------------------------- web search / news
async def _tavily(query: str, topic: str | None) -> str:
    if not settings.TAVILY_API_KEY:
        return "error: web search is not configured (TAVILY_API_KEY missing)"
    payload = {"api_key": settings.TAVILY_API_KEY, "query": query,
               "max_results": 5, "search_depth": "basic"}
    if topic:
        payload["topic"] = topic
    r = await http.client().post("https://api.tavily.com/search", json=payload,
                                 timeout=20)
    r.raise_for_status()
    data = r.json()
    lines = [f"- {it['title']}: {it.get('content', '')[:250]}"
             for it in data.get("results", [])[:5]]
    return "Search results:\n" + "\n".join(lines) if lines else "error: no results"


async def tool_web_search(args: dict) -> str:
    return await _tavily(str(args.get("query", "")), None)


async def tool_news(args: dict) -> str:
    return await _tavily(str(args.get("query", "")), "news")


# ---------------------------------------------------------------- read url
_TAGS = re.compile(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", re.DOTALL | re.IGNORECASE)


async def tool_read_url(args: dict) -> str:
    url = str(args.get("url", ""))
    if not url.startswith(("http://", "https://")):
        return "error: not a valid http(s) url"
    r = await http.client().get(url, timeout=20, follow_redirects=True)
    r.raise_for_status()
    body = r.text
    text = html.unescape(_TAGS.sub(" ", body))
    text = re.sub(r"\s+", " ", text).strip()
    return f"Content of {url}: {text[:2500]}"


# ---------------------------------------------------------------- registry
TOOLS = {
    "now": {"fn": tool_now, "args": "",
            "desc": "current date and time in Nigeria"},
    "calculate": {"fn": tool_calculate, "args": "expression",
                  "desc": "evaluate an arithmetic expression"},
    "weather": {"fn": tool_weather, "args": "city",
                "desc": "current weather for a city"},
    "exchange_rate": {"fn": tool_exchange_rate, "args": "base, quote",
                      "desc": "currency exchange rate, e.g. USD to NGN"},
    "crypto_price": {"fn": tool_crypto_price, "args": "symbol",
                     "desc": "current cryptocurrency price"},
    "wikipedia": {"fn": tool_wikipedia, "args": "query",
                  "desc": "factual summary of a topic, person or place"},
    "web_search": {"fn": tool_web_search, "args": "query",
                   "desc": "search the web for current information"},
    "news": {"fn": tool_news, "args": "query",
             "desc": "recent news on a topic"},
    "read_url": {"fn": tool_read_url, "args": "url",
                 "desc": "fetch and read a web page"},
}


def available() -> dict:
    if settings.TAVILY_API_KEY:
        return TOOLS
    return {k: v for k, v in TOOLS.items() if k not in ("web_search", "news")}


async def run(name: str, args: dict) -> str:
    tool = TOOLS.get(name)
    if tool is None:
        return f"error: unknown tool '{name}'"
    try:
        return await tool["fn"](args or {})
    except Exception as e:
        return f"error: {type(e).__name__}: {e}"
