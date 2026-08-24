"""Decane Connect access-token verification (spec: kit.decane.app/llms-node.txt).

Tokens are ES256 JWTs. Verification is offline against either the project's
static public key (DECANE_VERIFICATION_KEY, SPKI PEM) or Decane's JWKS at
{DECANE_API_BASE}/.well-known/jwks.json. The claim that matters for identity
is `uid` — a stable user UUID; `project_id` must match our app id (Decane's
audience-equivalent). Email is deliberately NOT in the token.
"""
import jwt
from jwt import PyJWKClient

from app.core.config import settings


class DecaneAuthError(Exception):
    pass


_jwks_client: PyJWKClient | None = None


def _jwks() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            f"{settings.DECANE_API_BASE.rstrip('/')}/.well-known/jwks.json",
            cache_keys=True, lifespan=3600)
    return _jwks_client


def verify_access_token(token: str) -> dict:
    """Returns the verified claims; raises DecaneAuthError on any problem."""
    if not settings.DECANE_APP_ID:
        raise DecaneAuthError("Decane sign-in is not configured")
    try:
        if settings.DECANE_VERIFICATION_KEY:
            # .env files are single-line: the PEM arrives with literal \n.
            key = settings.DECANE_VERIFICATION_KEY.replace("\\n", "\n")
        else:
            key = _jwks().get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["ES256"],
                            options={"verify_aud": False})
    except jwt.PyJWTError as e:
        raise DecaneAuthError(f"invalid token: {e}") from e
    if claims.get("project_id") != settings.DECANE_APP_ID:
        raise DecaneAuthError("token was issued for a different app")
    if not claims.get("uid"):
        raise DecaneAuthError("token has no user id")
    return claims
