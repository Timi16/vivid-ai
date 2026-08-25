"""A string that resists being looked at.

Authenticated browsing means credentials pass through this SDK. The rule from
the plan is that they reach Playwright and nothing else: never a snapshot,
never an LLM controller prompt, never a log line. A plain `str` cannot enforce
that — one f-string in a caller's debug logging and the password is on disk.

`Secret` makes leaking deliberate: repr and str are redacted, so it survives
logging, exception formatting and tracebacks intact, and pickling raises
rather than writing the credential to disk or another process. Reading the
real value takes an explicit `.reveal()`, which is easy to grep for in review.

    s.type(snap.find("Password"), secret(os.environ["PW"]))

The transport sends the revealed value over TLS and sets `"secret": true` on
the request, which is what tells the browser service to mark the field so its
value never re-enters a snapshot.
"""
from __future__ import annotations

from typing import SupportsIndex

REDACTED = "***"


class Secret:
    __slots__ = ("_value",)

    def __init__(self, value: str) -> None:
        if isinstance(value, Secret):        # secret(secret(x)) shouldn't nest
            value = value.reveal()
        if not isinstance(value, str):
            raise TypeError("secret() takes a string")
        self._value = value

    def reveal(self) -> str:
        """The real value. The only way to get it, and named to be greppable."""
        return self._value

    # Every path Python might print this by: repr for containers and debuggers,
    # str for f-strings and print, format for "{}".format and f"{x:>10}".
    def __repr__(self) -> str:
        return f"Secret({REDACTED})"

    def __str__(self) -> str:
        return REDACTED

    def __format__(self, spec: str) -> str:
        return format(REDACTED, spec)

    def __len__(self) -> int:
        return len(self._value)

    def __bool__(self) -> bool:
        return bool(self._value)

    # Comparison is constant-time-ish and only against another Secret: an
    # accidental `if pw == "letmein"` in caller code should not quietly work.
    def __eq__(self, other: object) -> bool:
        if isinstance(other, Secret):
            import hmac
            return hmac.compare_digest(self._value, other._value)
        return NotImplemented

    def __hash__(self) -> int:
        # Deliberately not hash(self._value): a Secret must not be findable in
        # a dict by hashing a guess of its contents.
        return hash(id(self))

    # Serialisation is the leak a redacted repr does not cover: pickle reaches
    # past __repr__ to the value itself, so a Secret that reaches
    # multiprocessing, a disk cache, or a request recorder writes the
    # plaintext out. Crossing a process or disk boundary is exactly the thing
    # this type exists to prevent, so refuse loudly and name the escape hatch.
    def __reduce__(self):
        raise TypeError(
            "a Secret cannot be pickled: serialising it would write the "
            "credential out in plaintext. Pass it as a Secret within the "
            "process, or call .reveal() at the boundary if you have decided "
            "that is safe.")

    def __reduce_ex__(self, protocol: SupportsIndex):
        return self.__reduce__()

    # Copying, unlike pickling, stays in memory and crosses no boundary — and
    # a Secret is immutable, so the copy could only ever be an alias. Return
    # self rather than raising: a caller deep-copying a config dict that
    # happens to hold a credential should not have their code break, and this
    # way no second plaintext copy is made either.
    def __copy__(self) -> Secret:
        return self

    def __deepcopy__(self, memo: dict) -> Secret:
        return self


def secret(value: str) -> Secret:
    """Wrap a credential so it cannot be printed or logged by accident."""
    return Secret(value)


def reveal(value: str | Secret) -> str:
    """Unwrap either a Secret or a plain string, for transport code."""
    return value.reveal() if isinstance(value, Secret) else value


def is_secret(value: object) -> bool:
    return isinstance(value, Secret)
