"""Chats and their messages.

Streaming a chat turn runs over the websocket, which still authenticates by
decoding a user JWT from a query parameter — an API key cannot open it. So
this resource covers chat state only, and `send()` arrives once the websocket
accepts key auth. See the SDK README for what that changes.
"""
from __future__ import annotations

# `Chats.list` shadows the builtin inside the class body, so annotations
# written after it resolve to the method rather than to `list`. This
# package ships py.typed, so that reaches partners' type checkers.
import builtins
from typing import Any

from .._transport import AsyncTransport, Transport
from ..types import Chat, Message


def _create_body(language: str, title: str | None) -> dict:
    body: dict[str, Any] = {"language": language}
    if title:
        body["title"] = title
    return body


def _update_body(title: str | None, pinned: bool | None) -> dict:
    body: dict[str, Any] = {}
    if title is not None:
        body["title"] = title
    if pinned is not None:
        body["pinned"] = pinned
    if not body:
        raise ValueError("pass title= or pinned= to update a chat")
    return body


class Chats:
    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def create(self, *, language: str = "en", title: str | None = None) -> Chat:
        data = self._t.request("POST", "/chats",
                               json_body=_create_body(language, title))
        return Chat.from_dict(data or {})

    def list(self, *, limit: int = 50, offset: int = 0) -> list[Chat]:
        data = self._t.request("GET", "/chats",
                               params={"limit": limit, "offset": offset})
        return [Chat.from_dict(c) for c in (data or [])]

    def get(self, chat_id: str) -> Chat:
        return Chat.from_dict(self._t.request("GET", f"/chats/{chat_id}") or {})

    def update(self, chat_id: str, *, title: str | None = None,
               pinned: bool | None = None) -> Chat:
        data = self._t.request("PATCH", f"/chats/{chat_id}",
                               json_body=_update_body(title, pinned))
        return Chat.from_dict(data or {})

    def delete(self, chat_id: str) -> None:
        self._t.request("DELETE", f"/chats/{chat_id}")

    def messages(self, chat_id: str, *, limit: int = 100,
                 offset: int = 0) -> builtins.list[Message]:
        data = self._t.request("GET", f"/chats/{chat_id}/messages",
                               params={"limit": limit, "offset": offset})
        return [Message.from_dict(m) for m in (data or [])]


class AsyncChats:
    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def create(self, *, language: str = "en",
                     title: str | None = None) -> Chat:
        data = await self._t.request("POST", "/chats",
                                     json_body=_create_body(language, title))
        return Chat.from_dict(data or {})

    async def list(self, *, limit: int = 50, offset: int = 0) -> list[Chat]:
        data = await self._t.request("GET", "/chats",
                                     params={"limit": limit, "offset": offset})
        return [Chat.from_dict(c) for c in (data or [])]

    async def get(self, chat_id: str) -> Chat:
        data = await self._t.request("GET", f"/chats/{chat_id}")
        return Chat.from_dict(data or {})

    async def update(self, chat_id: str, *, title: str | None = None,
                     pinned: bool | None = None) -> Chat:
        data = await self._t.request("PATCH", f"/chats/{chat_id}",
                                     json_body=_update_body(title, pinned))
        return Chat.from_dict(data or {})

    async def delete(self, chat_id: str) -> None:
        await self._t.request("DELETE", f"/chats/{chat_id}")

    async def messages(self, chat_id: str, *, limit: int = 100,
                       offset: int = 0) -> builtins.list[Message]:
        data = await self._t.request("GET", f"/chats/{chat_id}/messages",
                                     params={"limit": limit, "offset": offset})
        return [Message.from_dict(m) for m in (data or [])]


__all__ = ["AsyncChats", "Chats"]
