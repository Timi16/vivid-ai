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

_JSON = re.compile(r"\{.*\}", re.DOTALL)


def wants_tools(text: str) -> bool:
    text = text.strip()
    return bool(text) and not _CHITCHAT.match(text)


def _planner_prompt(usable: dict) -> str:
    today = datetime.now(ZoneInfo("Africa/Lagos")).strftime("%A %d %B %Y")
    lines = "\n".join(f"- {name}({t.args}): {t.desc}"
                      for name, t in usable.items())
    media_rule = ""
    if "generate_image" in usable or "generate_video" in usable:
        media_rule = (
            "RULE: making, drawing, painting, designing or generating a "
            "picture, image, logo or poster = generate_image; a video, clip "
            "or animation = generate_video. Never run_code for those, and "
            "never produce image data, base64 or links yourself.\n")
    return (
        f"Today is {today}. You are a tool planner for a Nigerian assistant. "
        "Your training data is stale: any question about prices, rates, "
        "weather, news, dates or current events NEEDS a tool.\n"
        f"Available tools:\n{lines}\n\n"
        "RULE: whenever the message involves code being run, demonstrated, "
        "tested, or producing an output/result (calculations, conversions, "
        "simulations, \"show the output\"), you MUST call run_code with the "
        "complete program — program output must never be guessed.\n"
        "RULE: converting or processing an attached file (image→PDF, "
        "CSV analysis, resizing…) = run_code reading the attached filename "
        "and writing the new file. But UNDERSTANDING an image — describing "
        "it, reading text in it, solving a question shown in it — needs NO "
        "tool: the model sees the image directly. Never attempt OCR "
        "(pytesseract etc.) on an attached image.\n"
        f"{media_rule}"
        'Reply with ONLY JSON, no prose: {"calls": [{"tool": "<name>", '
        '"args": {...}}]} — use {"calls": []} when no tool is needed '
        "(opinions, chit-chat, general knowledge that does not change)."
    )


async def gather_context(text: str, history, ctx,
                         allowed_tools: list[str] | None = None,
                         extra_tools: dict | None = None) -> tuple[str, bool]:
    """Returns (extra_system_prompt, used_tools). Raises nothing — a broken
    planner or tool degrades to answering without observations.
    ctx is the turn's ToolContext (status callback, chat id, attached files);
    allowed_tools comes from the client's config (B2B hook); None = all.
    extra_tools are the user's connector-bound tools for this turn."""
    status_cb = ctx.status
    usable = {**tools.available(allowed_tools), **(extra_tools or {})}
    if not usable:
        return "", False
    recent = "\n".join(f"{m.role}: {m.content[:200]}" for m in list(history)[:4][::-1])
    user = (f"Recent conversation:\n{recent}\n\nNew message: {text}"
            if recent else text)
    if ctx.files:
        listing = ", ".join(f"{f['name']} ({f['mime']})" for f in ctx.files)
        user += (f"\n\nAttached files (available to run_code in its working "
                 f"directory by filename): {listing}")
    try:
        # run_code puts whole programs in the args JSON — give it room
        raw = await llm.complete(
            [{"role": "system", "content": _planner_prompt(usable)},
             {"role": "user", "content": user}],
            max_tokens=700, temperature=0.0)
        match = _JSON.search(raw)
        calls = (json.loads(match.group(0)) if match else {}).get("calls") or []
    except Exception as e:
        log.warning("planner failed, answering without tools: %s", e)
        return "", False

    observations = []
    for call in calls[:MAX_CALLS]:
        name = (call or {}).get("tool")
        if name not in usable:
            continue
        await status_cb(usable[name].status)
        result = await tools.run_tool(usable[name], call.get("args") or {}, ctx)
        log.info("tool %s(%s) -> %s", name, call.get("args"), result[:120])
        observations.append(f"[{name}] {result}")

    if not observations:
        return "", False
    extra = ("\n\nTOOL RESULTS (fetched just now — the only current facts you "
             "have; do not invent others):\n"
             + "\n".join(observations)
             + "\n\nThe work above is ALREADY DONE. Answer with the result in "
             "plain sentences — for example \"The answer is 75025.\" Do NOT "
             "write, repeat or explain code unless the user explicitly asked "
             "to see the code itself. Never reproduce this block, the "
             "[bracketed] tool names, or the words 'output:' verbatim — the "
             "user must not see raw tool internals.\n")
    return extra, True
