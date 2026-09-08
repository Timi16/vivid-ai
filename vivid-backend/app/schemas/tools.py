from pydantic import BaseModel, ConfigDict, Field

from app.schemas.media import GeneratedFile


class ToolOut(BaseModel):
    """One tool a caller may run, and what it takes."""
    model_config = ConfigDict(from_attributes=True)

    name: str
    description: str
    #: The argument names, as a human-readable list. Deliberately not a JSON
    #: schema: these are read by a person wiring up a call, and the tools take
    #: flat string arguments.
    arguments: str


class ToolRunRequest(BaseModel):
    arguments: dict = Field(default_factory=dict)


class ToolRunResponse(BaseModel):
    tool: str
    #: What the tool observed, as the text the assistant itself would be given.
    result: str
    #: Files the tool created, already stored. run_code writing a chart, or
    #: generate_image producing a picture, land here.
    files: list[GeneratedFile] = []
