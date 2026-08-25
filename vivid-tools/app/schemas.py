from pydantic import BaseModel, Field


class SessionRequest(BaseModel):
    session: str = "default"


class OpenSessionRequest(SessionRequest):
    """Create a context explicitly.

    `storage_state` is a Playwright storage-state blob — replaying it is how a
    session becomes authenticated without any credential passing through here.
    `allowed_domains` restricts every navigation in the session; the backend
    requires it whenever storage_state is present.
    """
    storage_state: dict | None = None
    allowed_domains: list[str] = Field(default_factory=list, max_length=20)


class GotoRequest(SessionRequest):
    url: str


class TextRequest(SessionRequest):
    selector: str = "body"


class ActRequest(SessionRequest):
    ref: int = Field(ge=0)
    action: str = "click"                # click | type | submit
    value: str = ""
    #: True when `value` is a credential: the field is then marked so its
    #: value never appears in a later snapshot.
    secret: bool = False


class ToolResponse(BaseModel):
    ok: bool = True
    error: str | None = None
    data: dict = {}
