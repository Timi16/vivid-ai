"""The public model catalogue: the only names a client is allowed to ask for.

Vivid Code, the VS Code extension and the editor talk to the backend, never to
a pod. They ask for `vivid-code` or `vivid-chat`; this module is the single
place that knows which RunPod endpoint and which vendor model id that means.

Two things follow from keeping the mapping here. Pod addresses stay in
settings, where the rest of the codebase already may not look at them. And
moving a pod becomes a config change instead of a client release — the
alternative, which is what Vivid Code did before, bakes a
`*.proxy.runpod.net` host into a shipped binary.
"""
from dataclasses import dataclass

from app.core.config import settings

#: The coding agent's engine, and the default for tools that do not name one.
CODE_MODEL_ID = "vivid-code"
#: The assistant's engine — the same pod the product's chat turns run on.
CHAT_MODEL_ID = "vivid-chat"


class UnknownModel(Exception):
    """The client asked for a model this deployment does not serve."""


@dataclass(frozen=True)
class Model:
    """One public model, and where it actually lives."""
    id: str
    base_url: str
    #: What the pod calls itself. Substituted into the upstream request, so a
    #: client never has to know the vendor string.
    upstream_model: str
    context_tokens: int
    description: str

    @property
    def configured(self) -> bool:
        return bool(self.base_url)


def _code_base() -> str:
    return (settings.CODE_LLM_BASE_URL or settings.LLM_BASE_URL).rstrip("/")


def _code_model() -> str:
    # A deployment with one pod serves the coder alias off the chat model
    # rather than 404ing: degraded is more useful here than absent.
    return (settings.CODE_LLM_MODEL
            or (settings.LLM_MODEL if not settings.CODE_LLM_BASE_URL else ""))


def catalog() -> list[Model]:
    """Every model this deployment serves, best default first.

    Order is load-bearing: a client that has not been told which model to use
    discovers one by taking the first entry (Vivid Code does exactly this), and
    the proxy's consumers are coding tools.
    """
    models = [
        Model(id=CODE_MODEL_ID, base_url=_code_base(),
              upstream_model=_code_model(),
              context_tokens=settings.CODE_LLM_CONTEXT_TOKENS,
              description="Vivid's coding engine — agentic edits, tool calls, long files."),
        Model(id=CHAT_MODEL_ID, base_url=settings.LLM_BASE_URL.rstrip("/"),
              upstream_model=settings.LLM_MODEL,
              context_tokens=settings.LLM_CONTEXT_TOKENS,
              description="Vivid's assistant engine — conversation, reasoning, design briefs."),
    ]
    return [m for m in models if m.configured]


def resolve(model_id: str | None) -> Model:
    """The model a request is for. `None` or an empty string means "whichever
    you would have given me", which is the first catalogue entry."""
    available = catalog()
    if not available:
        raise UnknownModel("no models are configured on this deployment")
    if not model_id:
        return available[0]
    for model in available:
        if model.id == model_id:
            return model
    # Naming the alternatives matters more than usual: the ids are Vivid's own
    # invention, so a client author has no vendor documentation to fall back on.
    known = ", ".join(m.id for m in available)
    raise UnknownModel(f"unknown model '{model_id}'; this deployment serves: {known}")
