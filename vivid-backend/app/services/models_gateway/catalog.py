"""The public model catalogue: the only names a client is allowed to ask for.

Vivid Code, the VS Code extension and the editor talk to the backend, never to
a pod. They ask for `vivid-code` or `vivid-chat`; this module is the single
place that knows which upstream endpoint and which vendor model id that means.

Two things follow from keeping the mapping here. Upstream addresses stay in
settings (behind provider.py), where the rest of the codebase already may not
look at them. And moving a pod — or moving off the pods onto OpenRouter for an
afternoon — becomes a config change instead of a client release. The
alternative, which is what Vivid Code did before, bakes a `*.proxy.runpod.net`
host into a shipped binary.
"""
from dataclasses import dataclass

from app.services.models_gateway import provider
from app.services.models_gateway.provider import Endpoint

#: The coding agent's engine, and the default for tools that do not name one.
CODE_MODEL_ID = "vivid-code"
#: The assistant's engine — the same model the product's chat turns run on.
CHAT_MODEL_ID = "vivid-chat"


class UnknownModel(Exception):
    """The client asked for a model this deployment does not serve."""


@dataclass(frozen=True)
class Model:
    """One public model, and where it actually lives."""
    id: str
    endpoint: Endpoint
    context_tokens: int
    description: str

    @property
    def base_url(self) -> str:
        return self.endpoint.base_url

    @property
    def upstream_model(self) -> str:
        """What the upstream calls it. Substituted into the request, so a
        client never has to know the vendor string."""
        return self.endpoint.model

    @property
    def configured(self) -> bool:
        return self.endpoint.configured


def catalog() -> list[Model]:
    """Every model this deployment serves, best default first.

    Order is load-bearing: a client that has not been told which model to use
    discovers one by taking the first entry (Vivid Code does exactly this), and
    the proxy's consumers are coding tools.
    """
    coder = provider.endpoint(provider.CODE)
    chat = provider.endpoint(provider.CHAT)
    models = [
        Model(id=CODE_MODEL_ID, endpoint=coder,
              context_tokens=coder.context_tokens,
              description="Vivid's coding engine — agentic edits, tool calls, long files."),
        Model(id=CHAT_MODEL_ID, endpoint=chat,
              context_tokens=chat.context_tokens,
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
