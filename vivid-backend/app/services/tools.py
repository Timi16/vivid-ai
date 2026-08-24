"""The Vivid tool registry — the single source of truth for tool calling.

Each tool declares everything about itself in one @tool(...) decorator: name,
planner description, args hint, the status line users see while it runs, and
an availability predicate. The planner prompt, status events, and gating all
derive from this registry — adding a tool is ONE function with ONE decorator,
nothing else in the codebase changes.

Per-client tools (the B2B hook): clients.config_json may carry
{"tools": ["weather", ...]} to restrict a client to a subset; absent means all
available tools. Nothing else needs to know.

All of this is CPU + network I/O — exactly the work that was moved OFF the
GPU pod. A failing tool returns an "error: …" observation so the LLM can say
it could not check rather than inventing an answer.
"""
import ast
import json
import operator
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Awaitable, Callable
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services import search
from app.services.models_gateway import http

_HEADERS = {"User-Agent": "VividAI-backend/0.1"}


# ---------------------------------------------------------------- registry
async def _noop_status(_: str) -> None:
    pass


@dataclass
class ToolContext:
    """Turn-scoped context handed to tools that declare context=True: the chat
    (for per-chat resources like a browser session), a status callback for
    progress the user sees live, the user's attached files for this message
    (available to run_code's working directory), and `outputs` — files tools
    create, which the pipeline attaches to the reply."""
    chat_id: str | None = None
    status: Callable[[str], Awaitable[None]] = _noop_status
    files: list = field(default_factory=list)    # {"name","mime","data": bytes}
    outputs: list = field(default_factory=list)  # {"name","mime","data": bytes}

    def __post_init__(self):
        if self.status is None:
            self.status = _noop_status


@dataclass
class Tool:
    name: str
    fn: Callable
    desc: str
    args: str = ""
    status: str = "Working on it…"
    enabled: Callable[[], bool] = lambda: True
    context: bool = False  # fn signature is (args, ctx) instead of (args)


REGISTRY: dict[str, Tool] = {}


def tool(name: str, desc: str, args: str = "", status: str = "Working on it…",
         enabled: Callable[[], bool] = lambda: True, context: bool = False):
    def deco(fn):
        REGISTRY[name] = Tool(name=name, fn=fn, desc=desc, args=args,
                              status=status, enabled=enabled, context=context)
        return fn
    return deco


def available(allow: list[str] | None = None) -> dict[str, Tool]:
    """Tools usable right now, optionally restricted to a client's allowlist."""
    return {name: t for name, t in REGISTRY.items()
            if t.enabled() and (allow is None or name in allow)}


async def run_tool(t: Tool, args: dict, ctx: ToolContext | None = None) -> str:
    """Execute any Tool object (registry or connector-bound) safely."""
    try:
        if t.context:
            return await t.fn(args or {}, ctx or ToolContext())
        return await t.fn(args or {})
    except Exception as e:
        return f"error: {type(e).__name__}: {e}"


async def run(name: str, args: dict, ctx: ToolContext | None = None) -> str:
    t = REGISTRY.get(name)
    if t is None:
        return f"error: unknown tool '{name}'"
    return await run_tool(t, args, ctx)


async def _get_json(url: str, params: dict | None = None):
    r = await http.client().get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------- now
@tool("now", "current date and time in Nigeria", status="Checking the time…")
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


@tool("calculate", "evaluate an arithmetic expression", args="expression",
      status="Calculating…")
async def tool_calculate(args: dict) -> str:
    expr = str(args.get("expression", "")).replace(",", "").replace("^", "**")
    result = _eval_node(ast.parse(expr, mode="eval"))
    return f"{expr} = {result:,.6f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------- weather
_WEATHER_CODES = {0: "clear sky", 1: "mainly clear", 2: "partly cloudy",
                  3: "overcast", 45: "fog", 51: "light drizzle",
                  61: "light rain", 63: "rain", 65: "heavy rain",
                  80: "rain showers", 95: "thunderstorm"}


@tool("weather", "current weather for a city", args="city",
      status="Checking the weather…")
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
@tool("exchange_rate", "currency exchange rate, e.g. USD to NGN",
      args="base, quote", status="Checking exchange rates…")
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


@tool("crypto_price", "current cryptocurrency price", args="symbol",
      status="Checking prices…")
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
@tool("wikipedia", "factual summary of a topic, person or place", args="query",
      status="Looking that up…")
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
# Both run services/search.py: query rewrite -> parallel Tavily -> merge ->
# rerank -> read the top page when its snippet is thin. context=True only for
# the live status line ("Reading the top result…").
@tool("web_search",
      ("search the web for current information — pass the user's actual "
       "question or topic; it is turned into search queries automatically"),
      args="query", status="Searching the web…",
      enabled=lambda: bool(settings.TAVILY_API_KEY), context=True)
async def tool_web_search(args: dict, ctx: ToolContext) -> str:
    return await search.search(str(args.get("query", "")), None, ctx.status)


@tool("news", "recent news on a topic", args="query",
      status="Checking the news…",
      enabled=lambda: bool(settings.TAVILY_API_KEY), context=True)
async def tool_news(args: dict, ctx: ToolContext) -> str:
    return await search.search(str(args.get("query", "")), "news", ctx.status)


# ---------------------------------------------------------------- read url
@tool("read_url", "fetch and read a web page", args="url",
      status="Reading the page…")
async def tool_read_url(args: dict) -> str:
    url = str(args.get("url", ""))
    if not url.startswith(("http://", "https://")):
        return "error: not a valid http(s) url"
    return f"Content of {url}: {await search.fetch_page_text(url)}"


# ---------------------------------------------------------------- browse
def _tools_headers() -> dict:
    if settings.VIVID_TOOLS_TOKEN:
        return {"Authorization": f"Bearer {settings.VIVID_TOOLS_TOKEN}"}
    return {}


async def _vt(path: str, payload: dict, timeout: int = 40) -> dict:
    """One call to the vivid-tools browser service; raises on tool errors."""
    base = settings.VIVID_TOOLS_URL.rstrip("/")
    r = await http.client().post(f"{base}{path}", json=payload,
                                 headers=_tools_headers(), timeout=timeout)
    r.raise_for_status()
    body = r.json()
    if not body.get("ok", True):
        raise RuntimeError(body.get("error") or "browser error")
    return body.get("data") or {}


@tool("browse_page",
      ("open ONE web page in a real browser and read what it renders — use "
       "instead of read_url for JavaScript-heavy sites, or when read_url "
       "returns empty/garbled content; no clicking or typing"),
      args="url", status="Browsing the page…",
      enabled=lambda: bool(settings.VIVID_TOOLS_URL))
async def tool_browse_page(args: dict) -> str:
    """One throwaway session per call: no cookies or state leak between users."""
    url = str(args.get("url", ""))
    if not url.startswith(("http://", "https://")):
        return "error: not a valid http(s) url"
    sid = f"turn-{uuid.uuid4().hex[:12]}"
    try:
        await _vt("/browse/goto", {"url": url, "session": sid})
        snap = await _vt("/browse/snapshot", {"session": sid}, 30)
        return snap.get("snapshot") or "error: empty page"
    finally:
        try:
            await _vt("/browse/close", {"session": sid}, 10)
        except Exception:
            pass


# --- multi-round browsing agent ----------------------------------------------
BROWSE_MAX_STEPS = 6
_BROWSE_JSON = re.compile(r"\{.*\}", re.DOTALL)

_BROWSE_CONTROLLER = """You are operating a web browser to accomplish this goal:
GOAL: {goal}

Below is a snapshot of the current page: title, headings, text, and numbered
interactive ELEMENTS. Decide the single next action. Reply with ONLY one JSON
object, no prose:
  {{"action": "click", "ref": <n>}}                     click element [n]
  {{"action": "type", "ref": <n>, "value": "<text>"}}   fill a field
  {{"action": "submit", "ref": <n>, "value": "<text>"}} fill and press Enter (search boxes)
  {{"action": "goto", "url": "https://..."}}            open a different page
  {{"action": "done", "answer": "<what you found>"}}    finish — answer the goal from what the pages showed

You have {remaining} actions left. If the current page already contains what
the goal needs, reply done with a specific, factual answer. The answer must
quote only what a snapshot actually showed — include the page title and site
domain you got it from (e.g. "according to iana.org…"). Never invent content
that is not in a snapshot.
Result of your previous action: {last_result}"""


@tool("browse",
      ("interact with a website to accomplish a goal — navigate, click "
       "links/buttons, type into fields, search within a site, follow "
       "multi-page flows; give it the starting url and what to achieve. For "
       "just reading one page use browse_page instead"),
      args="url, goal", status="Opening the browser…",
      enabled=lambda: bool(settings.VIVID_TOOLS_URL), context=True)
async def tool_browse(args: dict, ctx: ToolContext) -> str:
    """A mini agent-in-a-tool: snapshot -> the LLM picks one action -> execute
    -> repeat, up to BROWSE_MAX_STEPS. The browser session is keyed to the
    chat, so a follow-up message can continue on the same page (cookies and
    all); vivid-tools reaps idle sessions after its TTL."""
    from app.services.models_gateway import llm

    url = str(args.get("url", ""))
    goal = str(args.get("goal") or args.get("query") or "read the page").strip()
    if not url.startswith(("http://", "https://")):
        return "error: not a valid http(s) url"

    sid = f"chat-{ctx.chat_id}" if ctx.chat_id else f"turn-{uuid.uuid4().hex[:10]}"
    await _vt("/browse/goto", {"url": url, "session": sid})
    last_result = f"opened {url}"
    trail: list[str] = []

    for step in range(BROWSE_MAX_STEPS):
        snap = await _vt("/browse/snapshot", {"session": sid}, 30)
        controller = _BROWSE_CONTROLLER.format(
            goal=goal, remaining=BROWSE_MAX_STEPS - step,
            last_result=last_result)
        try:
            raw = await llm.complete(
                [{"role": "system", "content": controller},
                 {"role": "user", "content": snap.get("snapshot") or "(blank page)"}],
                max_tokens=300, temperature=0.0)
            match = _BROWSE_JSON.search(raw)
            decision = json.loads(match.group(0)) if match else {}
        except Exception as e:
            return (f"error: browse controller failed ({e}); "
                    f"last page:\n{(snap.get('snapshot') or '')[:2000]}")

        action = decision.get("action")
        if action == "done":
            answer = str(decision.get("answer") or "").strip()
            steps = f" (steps: {'; '.join(trail)})" if trail else ""
            return (answer or (snap.get("snapshot") or "")[:2000]) + steps

        try:
            if action == "goto":
                new_url = str(decision.get("url", ""))
                if not new_url.startswith(("http://", "https://")):
                    raise ValueError("controller produced an invalid url")
                await ctx.status(f"Opening {new_url[:50]}…")
                nav = await _vt("/browse/goto", {"url": new_url, "session": sid})
                last_result = f"opened {nav.get('url')}"
            elif action in ("click", "type", "submit"):
                verb = {"click": "Clicking", "type": "Typing",
                        "submit": "Searching"}[action]
                await ctx.status(f"{verb}…")
                res = await _vt("/browse/act", {
                    "session": sid, "ref": int(decision.get("ref", -1)),
                    "action": action, "value": str(decision.get("value", ""))})
                last_result = res.get("did") or action
            else:
                break  # unparseable decision — stop burning steps
            trail.append(last_result)
        except Exception as e:
            last_result = f"error: {e}"
            trail.append(last_result)

    snap = await _vt("/browse/snapshot", {"session": sid}, 30)
    return ("Ran out of browsing steps. Actions taken: "
            + "; ".join(trail[-4:]) + "\nFinal page:\n"
            + (snap.get("snapshot") or ""))[:3500]


# ---------------------------------------------------------------- run code
_FENCE = re.compile(r"^```[a-zA-Z]*\s*|\s*```$")


@tool("run_code",
      ("execute a Python 3 program (has pillow, reportlab, numpy, pandas; no "
       "internet) and read what it prints — REQUIRED whenever code output "
       "matters: calculations, conversions, data processing, simulations, or "
       "when the user asks to run/demonstrate/test code. The user's attached "
       "files are ALREADY in the current working directory — open them by "
       "their exact bare filename, never an invented /tmp/ or absolute path. "
       "Files the program CREATES (PDFs, images, CSVs…) are attached to the "
       "reply automatically. The program MUST print() its result"),
      args="code", status="Running code…",
      enabled=lambda: bool(settings.SANDBOX_URL), context=True)
async def tool_run_code(args: dict, ctx: ToolContext) -> str:
    """Executes in the isolated sandbox container — model-generated code
    never runs in this process. Each run is a fresh subprocess: no state, no
    network, no secrets. The user's attachments go in as workdir files;
    created files come back via ctx.outputs and get attached to the reply."""
    import base64 as _b64
    import mimetypes

    code = _FENCE.sub("", str(args.get("code", "")).strip())
    if not code:
        return "error: no code provided"
    # Models keep inventing absolute paths ("/tmp/photo.png") when both the
    # input files and any file the program should hand back live in the run's
    # working directory. Rewriting the literal /tmp/ prefix keeps reads AND
    # writes in the workdir — a write outside it would silently lose the file.
    code = code.replace("/tmp/", "")
    if ctx.files:
        for f in ctx.files[:8]:
            name = f["name"]
            for prefix in ("/workspace/", "/home/user/", "~/", "./"):
                code = code.replace(f"{prefix}{name}", name)
    payload = {"code": code, "timeout": settings.SANDBOX_RUN_TIMEOUT}
    if ctx.files:
        payload["files"] = {f["name"]: _b64.b64encode(f["data"]).decode()
                            for f in ctx.files[:8]}
    r = await http.client().post(
        f"{settings.SANDBOX_URL.rstrip('/')}/run", json=payload,
        timeout=settings.SANDBOX_RUN_TIMEOUT + 20)
    r.raise_for_status()
    res = r.json()
    out = (res.get("stdout") or "").strip()
    err = (res.get("stderr") or "").strip()
    pieces = []
    if res.get("timed_out"):
        pieces.append(f"error: the program exceeded {settings.SANDBOX_RUN_TIMEOUT}s and was killed")
    if out:
        pieces.append(f"program printed:\n{out[:3000]}")
    if err:
        pieces.append(f"errors:\n{err[:1500]}")
    created = False
    for name, b64 in (res.get("files") or {}).items():
        data = _b64.b64decode(b64)
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
        ctx.outputs.append({"name": name, "mime": mime, "data": data})
        created = True
        pieces.append(f"created the file '{name}' ({len(data)} bytes) — it is "
                      "attached to your reply; tell the user it is ready")
    if err and not created:
        pieces.append("NO FILE WAS CREATED. Do not tell the user a file is "
                      "attached — tell them what failed instead.")
    if not pieces:
        pieces.append("the program produced no output — it must print() its result")
    return "\n".join(pieces)
