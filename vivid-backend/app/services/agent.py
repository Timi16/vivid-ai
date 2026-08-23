"""The tool/agent loop, moved off the pod. One planner call decides which
tools to run (the LLM endpoint just returns tokens — it knows nothing about
tools), the backend executes them, and the observations are appended to the
system prompt as the only current facts the model may use.

Rules carried over from the pod pipeline:
- Only skip the planner when the message is NOTHING BUT a greeting; matching a
  greeting *prefix* once let "Hey Vivid, what is the price of Solana?" run
  tool-free and the model invented a price.
- The yo/ig skip is a WORKAROUND, not a rule — it lives in config
  (settings.NO_TOOLS_LANGS) with a TODO to remove once translation is fixed.
"""
import json
import logging
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from app.services import tools
from app.services.models_gateway import llm

log = logging.getLogger("vivid.agent")

MAX_CALLS = 3

_CHITCHAT = re.compile(
    r"^(hi|hello|hey|thanks|thank you|how are you|how far|abeg|báwo|kedu)"
    r"[\s,!.]*(vivid)?[\s,!.]*$", re.I)

_STATUS = {
    "web_search": "Searching the web…",
    "news": "Checking the news…",
    "read_url": "Reading the page…",
    "weather": "Checking the weather…",
    "exchange_rate": "Checking exchange rates…",
    "crypto_price": "Checking prices…",
    "wikipedia": "Looking that up…",
    "calculate": "Calculating…",
    "now": "Checking the time…",
}

_JSON = re.compile(r"\{.*\}", re.DOTALL)


def wants_tools(text: str) -> bool:
    text = text.strip()
    return bool(text) and not _CHITCHAT.match(text)


def _planner_prompt() -> str:
    today = datetime.now(ZoneInfo("Africa/Lagos")).strftime("%A %d %B %Y")
    lines = "\n".join(f"- {name}({t['args']}): {t['desc']}"
                      for name, t in tools.available().items())
    return (
        f"Today is {today}. You are a tool planner for a Nigerian assistant. "
        "Your training data is stale: any question about prices, rates, "
        "weather, news, dates or current events NEEDS a tool.\n"
        f"Available tools:\n{lines}\n\n"
        'Reply with ONLY JSON, no prose: {"calls": [{"tool": "<name>", '
        '"args": {...}}]} — use {"calls": []} when no tool is needed '
        "(opinions, chit-chat, general knowledge that does not change)."
    )


async def gather_context(text: str, history, status_cb) -> tuple[str, bool]:
    """Returns (extra_system_prompt, used_tools). Raises nothing — a broken
    planner or tool degrades to answering without observations."""
    recent = "\n".join(f"{m.role}: {m.content[:200]}" for m in list(history)[:4][::-1])
    user = (f"Recent conversation:\n{recent}\n\nNew message: {text}"
            if recent else text)
    try:
        raw = await llm.complete(
            [{"role": "system", "content": _planner_prompt()},
             {"role": "user", "content": user}],
            max_tokens=250, temperature=0.0)
        match = _JSON.search(raw)
        calls = (json.loads(match.group(0)) if match else {}).get("calls") or []
    except Exception as e:
        log.warning("planner failed, answering without tools: %s", e)
        return "", False

    observations = []
    for call in calls[:MAX_CALLS]:
        name = (call or {}).get("tool")
        if name not in tools.available():
            continue
        await status_cb(_STATUS.get(name, "Working on it…"))
        result = await tools.run(name, call.get("args") or {})
        log.info("tool %s(%s) -> %s", name, call.get("args"), result[:120])
        observations.append(f"[{name}] {result}")

    if not observations:
        return "", False
    extra = ("\n\nTool results, fetched just now — these are the only current "
             "facts you have; use them and do not invent others:\n"
             + "\n".join(observations) + "\n")
    return extra, True
