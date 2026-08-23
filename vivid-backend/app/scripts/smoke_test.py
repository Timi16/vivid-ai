"""End-to-end API smoke test, run inside the backend container: `make smoke`.

Passes with or without the RunPod services configured — a ws turn must end in
either streamed tokens + done (models up) or a clean llm_error event.
"""
import asyncio
import json
import sys
import uuid

import httpx
import websockets

BASE = "http://localhost:8000/v1"
FAILURES = []


def check(name: str, ok: bool, detail: str = ""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))
    if not ok:
        FAILURES.append(name)


async def main():
    email = f"smoke-{uuid.uuid4().hex[:8]}@test.com"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/health")
        check("health", r.status_code == 200)

        r = await c.post(f"{BASE}/auth/signup",
                         json={"email": email, "password": "password123"})
        check("signup", r.status_code == 201, str(r.status_code))
        tok = r.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}

        r = await c.post(f"{BASE}/chats", json={"language": "en"}, headers=h)
        check("create chat", r.status_code == 201)
        chat_id = r.json()["id"]

        r = await c.post(f"{BASE}/attachments",
                         files={"file": ("note.txt", b"vivid smoke note", "text/plain")},
                         data={"chat_id": chat_id}, headers=h)
        check("upload attachment", r.status_code == 201)

        r = await c.get(f"{BASE}/chats", headers=h)
        check("list chats", r.status_code == 200 and len(r.json()) == 1)

        r = await c.get(f"{BASE}/chats/{chat_id}/messages")
        check("auth required", r.status_code in (401, 403), str(r.status_code))

    events = []
    async with websockets.connect(f"ws://localhost:8000/ws?token={tok}") as ws:
        await ws.send(json.dumps({"type": "message", "chat_id": chat_id,
                                  "text": "Reply with exactly: smoke test ok"}))
        try:
            while True:
                ev = json.loads(await asyncio.wait_for(ws.recv(), 60))
                events.append(ev)
                if ev["type"] in ("done", "error"):
                    break
        except asyncio.TimeoutError:
            pass
    kinds = [e["type"] for e in events]
    llm_up = "done" in kinds and "token" in kinds
    llm_down = any(e["type"] == "error" and e.get("code") == "llm_error" for e in events)
    check("ws turn", llm_up or llm_down,
          "streamed reply" if llm_up else "clean llm_error (LLM not configured)")

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/chats/{chat_id}/messages", headers=h)
        roles = [m["role"] for m in r.json()]
        check("user message persisted", "user" in roles, str(roles))
        if llm_up:
            check("assistant message persisted", "assistant" in roles, str(roles))
        r = await c.delete(f"{BASE}/chats/{chat_id}", headers=h)
        check("delete chat", r.status_code == 204)

    print(f"\n{'ALL PASS' if not FAILURES else 'FAILED: ' + ', '.join(FAILURES)}")
    sys.exit(1 if FAILURES else 0)


asyncio.run(main())
