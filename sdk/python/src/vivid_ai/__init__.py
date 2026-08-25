"""Vivid AI SDK — agentic browsing, chats, files and search.

    from vivid_ai import Vivid, secret

    vivid = Vivid(api_key="vk_...")

    # you drive
    with vivid.browser.session(allowed_domains=["example.com"]) as s:
        s.goto("https://example.com/login")
        snap = s.snapshot()
        s.type(snap.find("Email"), "bot@example.com")
        s.type(snap.find("Password"), secret(os.environ["PW"]))
        s.click(snap.find("Sign in"))

    # Vivid drives
    task = vivid.browser.run(goal="find the pricing tiers",
                             url="https://example.com")
    for step in task:
        print(step)
    print(task.result().answer)
"""
from ._version import __version__
from .client import AsyncVivid, Vivid
from .errors import (
                     APIError,
                     BlockedUrl,
                     BrowserError,
                     Busy,
                     CapacityExceeded,
                     ConnectionError_,
                     DomainNotAllowed,
                     ElementNotFound,
                     Forbidden,
                     ModelUnavailable,
                     NavTimeout,
                     NotFound,
                     QuotaExceeded,
                     RateLimited,
                     SessionExpired,
                     StaleRef,
                     TaskFailed,
                     Unauthorized,
                     VividError,
)
from .resources.browser import (
                     AsyncBrowserSession,
                     AsyncBrowsingTask,
                     BrowserSession,
                     BrowsingTask,
)
from .secret import Secret, secret
from .types import (
                     ActResult,
                     Artifact,
                     Attachment,
                     BrowserSessionInfo,
                     Chat,
                     Element,
                     Message,
                     NavResult,
                     SearchResult,
                     Snapshot,
                     TaskResult,
                     TaskStep,
                     Usage,
                     User,
)

__all__ = [
    "__version__",
    # clients
    "Vivid", "AsyncVivid",
    # browsing
    "BrowserSession", "AsyncBrowserSession", "BrowsingTask",
    "AsyncBrowsingTask", "BrowserSessionInfo", "Snapshot", "Element",
    "NavResult", "ActResult", "TaskStep", "TaskResult",
    # credentials
    "secret", "Secret",
    # other models
    "Chat", "Message", "Attachment", "Artifact", "SearchResult", "User",
    "Usage",
    # errors
    "VividError", "APIError", "ConnectionError_", "Unauthorized", "Forbidden",
    "NotFound", "RateLimited", "QuotaExceeded", "CapacityExceeded", "Busy",
    "BrowserError", "SessionExpired", "StaleRef", "BlockedUrl",
    "DomainNotAllowed", "NavTimeout", "ElementNotFound", "ModelUnavailable",
    "TaskFailed",
]
