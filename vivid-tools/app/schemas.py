from pydantic import BaseModel, Field


class GotoRequest(BaseModel):
    url: str
    session: str = "default"


class SessionRequest(BaseModel):
    session: str = "default"


class TextRequest(SessionRequest):
    selector: str = "body"


class ActRequest(SessionRequest):
    ref: int = Field(ge=0)
    action: str = "click"                # click | type | submit
    value: str = ""


class ToolResponse(BaseModel):
    ok: bool = True
    error: str | None = None
    data: dict = {}
