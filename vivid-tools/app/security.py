"""Auth and SSRF protection.

Every URL and selector reaching this service was chosen by an LLM, which may in
turn have been steered by text on a web page. Private addresses are blocked so
a prompt injection cannot make the agent read the GPU pod's internal services
or a cloud metadata endpoint and speak the result back to the user.
"""
import ipaddress
import secrets
import socket
from urllib.parse import urlparse

from fastapi import Header, HTTPException

from .config import settings


def require_token(authorization: str = Header(default="")) -> None:
    expected = settings().token
    if not expected:
        return                                   # auth disabled in dev
    if not secrets.compare_digest(authorization, f"Bearer {expected}"):
        raise HTTPException(status_code=401, detail="unauthorized")


def is_allowed_url(url: str) -> bool:
    if settings().allow_private_hosts:
        return url.startswith(("http://", "https://"))
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        for info in socket.getaddrinfo(parsed.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if (ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_reserved or ip.is_multicast):
                return False
        return True
    except Exception:
        return False
