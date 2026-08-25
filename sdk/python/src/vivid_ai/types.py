"""Wire models.

Plain dataclasses rather than pydantic: this SDK is a dependency other people
install, and every dependency it carries is one they have to reconcile with
their own. httpx is the only one worth that cost.

Every `from_dict` ignores unknown keys, so a field added server-side never
breaks an installed SDK.
"""
from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .errors import ElementNotFound


def _dt(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        # The API emits RFC 3339; Python <3.11 chokes on a trailing "Z".
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


# --------------------------------------------------------------- browsing
@dataclass(frozen=True)
class Element:
    """One interactive element from a snapshot.

    `ref` is positional and only valid for the snapshot that produced it —
    that is why it travels with `snapshot_id`, so a stale ref is rejected
    rather than silently acting on whatever now sits at that index.
    """
    ref: int
    tag: str
    label: str
    type: str = ""
    snapshot_id: str = ""

    @property
    def kind(self) -> str:
        """`input/password`, `a`, `button` — how the snapshot text renders it."""
        return f"{self.tag}/{self.type}" if self.type else self.tag

    def __str__(self) -> str:
        return f"[{self.ref}] {self.kind}: {self.label}"

    @classmethod
    def from_dict(cls, data: dict, ref: int, snapshot_id: str = "") -> Element:
        return cls(ref=data.get("ref", ref), tag=data.get("tag", ""),
                   label=data.get("label", ""), type=data.get("type") or "",
                   snapshot_id=snapshot_id)


@dataclass(frozen=True)
class Snapshot:
    """A page as the agent sees it: text and numbered elements, not pixels."""
    url: str
    title: str
    text: str
    elements: list[Element] = field(default_factory=list)
    headings: list[str] = field(default_factory=list)
    snapshot_id: str = ""
    #: The preformatted view the LLM controller receives. Handy to log, and to
    #: feed a model of your own if you are writing your own loop.
    rendered: str = ""

    def __iter__(self) -> Iterator[Element]:
        return iter(self.elements)

    def __len__(self) -> int:
        return len(self.elements)

    def find(self, text: str, *, kind: str | None = None) -> Element:
        """The element whose label best matches `text`.

        Matching is case-insensitive and ranked: exact, then prefix, then
        substring, and among equals the earliest in document order. Ranking
        rather than "first substring hit" is what stops a search box labelled
        "Search products" winning over a button labelled "Search".

        `kind` filters by tag or tag/type ("button", "input", "input/password")
        when a page labels a link and a button identically.

        Raises ElementNotFound rather than returning None: a missing element is
        a broken flow, and an SDK that returns None here just moves the
        AttributeError one line down.
        """
        needle = text.strip().lower()
        best: tuple[int, int, Element] | None = None
        for el in self.elements:
            if kind and el.kind != kind and el.tag != kind:
                continue
            label = el.label.strip().lower()
            if label == needle:
                rank = 0
            elif label.startswith(needle):
                rank = 1
            elif needle in label:
                rank = 2
            else:
                continue
            candidate = (rank, el.ref, el)
            if best is None or candidate[:2] < best[:2]:
                best = candidate
        if best is None:
            available = ", ".join(f"{e.label!r}" for e in self.elements[:12])
            raise ElementNotFound(
                f"no element matching {text!r}"
                + (f" of kind {kind!r}" if kind else "")
                + (f"; page has: {available}" if available else
                   "; the page reported no interactive elements"))
        return best[2]

    def find_all(self, text: str, *, kind: str | None = None) -> list[Element]:
        needle = text.strip().lower()
        return [el for el in self.elements
                if needle in el.label.strip().lower()
                and (not kind or el.kind == kind or el.tag == kind)]

    @classmethod
    def from_dict(cls, data: dict) -> Snapshot:
        sid = data.get("snapshot_id") or ""
        return cls(
            url=data.get("url") or "",
            title=data.get("title") or "",
            text=data.get("text") or "",
            headings=list(data.get("headings") or []),
            elements=[Element.from_dict(e, i, sid)
                      for i, e in enumerate(data.get("elements") or [])],
            snapshot_id=sid,
            rendered=data.get("snapshot") or "",
        )


@dataclass(frozen=True)
class BrowserSessionInfo:
    id: str
    allowed_domains: list[str] = field(default_factory=list)
    authenticated: bool = False
    created_at: datetime | None = None
    expires_at: datetime | None = None

    @classmethod
    def from_dict(cls, data: dict) -> BrowserSessionInfo:
        return cls(id=data.get("id") or "",
                   allowed_domains=list(data.get("allowed_domains") or []),
                   authenticated=bool(data.get("authenticated")),
                   created_at=_dt(data.get("created_at")),
                   expires_at=_dt(data.get("expires_at")))


@dataclass(frozen=True)
class NavResult:
    url: str
    title: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> NavResult:
        return cls(url=data.get("url") or "", title=data.get("title") or "")


@dataclass(frozen=True)
class ActResult:
    did: str
    url: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> ActResult:
        return cls(did=data.get("did") or "", url=data.get("url") or "")


@dataclass(frozen=True)
class TaskStep:
    """One decision the managed controller made, and what came of it.

    The trail is the debuggable part of an agent loop, so it is structured
    rather than the cosmetic status strings the chat UI receives.
    """
    index: int
    action: str                    # goto | click | type | submit | done | error
    url: str = ""
    label: str = ""
    ref: int | None = None
    ok: bool = True
    error: str | None = None
    #: Only on the terminal step.
    answer: str | None = None

    def __str__(self) -> str:
        head = f"{self.index}. {self.action}"
        if self.label:
            head += f" {self.label!r}"
        if self.url:
            head += f" -> {self.url}"
        return head if self.ok else f"{head} [failed: {self.error}]"

    @classmethod
    def from_dict(cls, data: dict, index: int = 0) -> TaskStep:
        return cls(index=data.get("index", index),
                   action=data.get("action") or "",
                   url=data.get("url") or "", label=data.get("label") or "",
                   ref=data.get("ref"), ok=bool(data.get("ok", True)),
                   error=data.get("error"), answer=data.get("answer"))


@dataclass(frozen=True)
class TaskResult:
    answer: str
    steps: list[TaskStep] = field(default_factory=list)
    url: str = ""
    session_id: str = ""
    #: True when the controller ran out of steps before answering — the answer
    #: is then a best effort from the last page rather than a finished one.
    truncated: bool = False

    @classmethod
    def from_dict(cls, data: dict) -> TaskResult:
        return cls(answer=data.get("answer") or "",
                   steps=[TaskStep.from_dict(s, i)
                          for i, s in enumerate(data.get("steps") or [])],
                   url=data.get("url") or "",
                   session_id=data.get("session_id") or "",
                   truncated=bool(data.get("truncated")))


# ------------------------------------------------------------------ chat
@dataclass(frozen=True)
class Attachment:
    id: str
    kind: str                      # image | file | audio
    mime: str
    size_bytes: int
    filename: str | None = None
    #: Presigned and short-lived — roughly an hour. Fetch it, do not store it.
    url: str | None = None
    created_at: datetime | None = None

    @classmethod
    def from_dict(cls, data: dict) -> Attachment:
        return cls(id=data.get("id") or "", kind=data.get("kind") or "file",
                   mime=data.get("mime") or "application/octet-stream",
                   size_bytes=int(data.get("size_bytes") or 0),
                   filename=data.get("filename"), url=data.get("url"),
                   created_at=_dt(data.get("created_at")))


@dataclass(frozen=True)
class Artifact:
    id: str
    kind: str
    mime: str
    size_bytes: int
    url: str
    chat_id: str
    filename: str | None = None
    chat_title: str | None = None
    message_id: str | None = None
    created_at: datetime | None = None

    @classmethod
    def from_dict(cls, data: dict) -> Artifact:
        return cls(id=data.get("id") or "", kind=data.get("kind") or "file",
                   mime=data.get("mime") or "application/octet-stream",
                   size_bytes=int(data.get("size_bytes") or 0),
                   url=data.get("url") or "", chat_id=data.get("chat_id") or "",
                   filename=data.get("filename"),
                   chat_title=data.get("chat_title"),
                   message_id=data.get("message_id"),
                   created_at=_dt(data.get("created_at")))


@dataclass(frozen=True)
class Chat:
    id: str
    language: str = "en"
    title: str | None = None
    pinned: bool = False
    client_id: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_dict(cls, data: dict) -> Chat:
        return cls(id=data.get("id") or "", language=data.get("language") or "en",
                   title=data.get("title"), pinned=bool(data.get("pinned")),
                   client_id=data.get("client_id") or "",
                   created_at=_dt(data.get("created_at")),
                   updated_at=_dt(data.get("updated_at")))


@dataclass(frozen=True)
class Usage:
    prompt_tokens: int | None = None
    completion_tokens: int | None = None

    @classmethod
    def from_dict(cls, data: dict | None) -> Usage | None:
        if not data:
            return None
        return cls(prompt_tokens=data.get("prompt_tokens"),
                   completion_tokens=data.get("completion_tokens"))


@dataclass(frozen=True)
class Message:
    id: str
    chat_id: str
    role: str
    content: str
    used_tools: bool = False
    attachments: list[Attachment] = field(default_factory=list)
    usage: Usage | None = None
    created_at: datetime | None = None

    @classmethod
    def from_dict(cls, data: dict) -> Message:
        return cls(id=data.get("id") or "", chat_id=data.get("chat_id") or "",
                   role=data.get("role") or "assistant",
                   content=data.get("content") or "",
                   used_tools=bool(data.get("used_tools")),
                   attachments=[Attachment.from_dict(a)
                                for a in (data.get("attachments") or [])],
                   usage=Usage.from_dict(data.get("usage")),
                   created_at=_dt(data.get("created_at")))


@dataclass(frozen=True)
class SearchResult:
    chat_id: str
    message_id: str
    role: str
    snippet: str
    score: float
    source: str                    # vector | text
    language: str = "en"
    title: str | None = None

    @classmethod
    def from_dict(cls, data: dict) -> SearchResult:
        return cls(chat_id=data.get("chat_id") or "",
                   message_id=data.get("message_id") or "",
                   role=data.get("role") or "", snippet=data.get("snippet") or "",
                   score=float(data.get("score") or 0.0),
                   source=data.get("source") or "text",
                   language=data.get("language") or "en",
                   title=data.get("title"))


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str | None = None
    avatar_url: str | None = None
    created_at: datetime | None = None

    @classmethod
    def from_dict(cls, data: dict) -> User:
        return cls(id=data.get("id") or "", email=data.get("email") or "",
                   name=data.get("name"), avatar_url=data.get("avatar_url"),
                   created_at=_dt(data.get("created_at")))
