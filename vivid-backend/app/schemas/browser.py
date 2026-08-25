from datetime import datetime

from pydantic import BaseModel, Field, field_validator

MAX_DOMAINS = 20


class SessionCreate(BaseModel):
    """Open a browser session.

    `storage_state` is a Playwright storage-state blob from a previous
    session's /storage_state — cookies and local storage. Supplying it makes
    the session authenticated, which is why `allowed_domains` becomes
    mandatory: see the validator.
    """
    storage_state: dict | None = None
    allowed_domains: list[str] | None = Field(default=None, max_length=MAX_DOMAINS)
    idle_ttl: int | None = Field(default=None, ge=60, le=3600)

    @field_validator("allowed_domains")
    @classmethod
    def _clean(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return [d for d in (s.strip() for s in value) if d][:MAX_DOMAINS]


class SessionOut(BaseModel):
    id: str
    allowed_domains: list[str] = []
    authenticated: bool = False
    created_at: datetime | None = None
    expires_at: datetime | None = None


class GotoRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)


class TextRequest(BaseModel):
    selector: str = Field(default="body", max_length=500)


class ActRequest(BaseModel):
    ref: int = Field(ge=0)
    action: str = Field(default="click", pattern="^(click|type|submit)$")
    value: str = Field(default="", max_length=10_000)
    #: True when `value` is a credential. The browser service marks the field
    #: so its value never re-enters a snapshot; nothing here logs it.
    secret: bool = False
    #: The snapshot this ref came from. Optional but strongly recommended —
    #: without it the server cannot tell a current ref from one taken two
    #: navigations ago.
    snapshot_id: str | None = Field(default=None, max_length=64)


class ElementOut(BaseModel):
    ref: int
    tag: str
    type: str = ""
    label: str = ""


class SnapshotOut(BaseModel):
    snapshot_id: str
    url: str = ""
    title: str = ""
    text: str = ""
    headings: list[str] = []
    elements: list[ElementOut] = []
    #: The preformatted view the controller sees, handy for logging or for
    #: feeding a model of your own.
    snapshot: str = ""


class NavOut(BaseModel):
    url: str
    title: str = ""


class ActOut(BaseModel):
    did: str
    url: str = ""


class TextOut(BaseModel):
    text: str
    url: str = ""


class StorageStateOut(BaseModel):
    storage_state: dict


class TaskRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=2000)
    #: Required unless `session_id` names a session already on the right page.
    url: str | None = Field(default=None, max_length=4096)
    max_steps: int | None = Field(default=None, ge=1, le=100)
    #: Run inside a session you already opened — the way to browse as a
    #: logged-in user.
    session_id: str | None = None
    #: Only used when no session_id is given, for the throwaway session.
    allowed_domains: list[str] | None = Field(default=None, max_length=MAX_DOMAINS)
    #: Stream steps as server-sent events instead of returning one JSON body.
    stream: bool = False


class TaskStepOut(BaseModel):
    index: int
    action: str
    url: str = ""
    label: str = ""
    ref: int | None = None
    ok: bool = True
    error: str | None = None
    answer: str | None = None


class TaskResultOut(BaseModel):
    answer: str
    url: str = ""
    session_id: str = ""
    truncated: bool = False
    steps: list[TaskStepOut] = []
