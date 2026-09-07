"""Cloudinary object storage: the CDN-backed alternative to MinIO.

Why it exists: MinIO serves attachments from the one VPS, through Caddy, with
no cache in front. Every image is a round trip to that box. Cloudinary puts
them on a CDN, which is the whole reason to switch — and it removes the
storage.<domain> hostname, because delivery URLs are plain public URLs rather
than presigned ones whose signature covers the host.

Hand-rolled on the shared httpx client rather than the cloudinary SDK: the
signed-upload contract is a sha1 over sorted params, the rest is one POST, and
this way uploads are async like every other outbound call instead of parked in
a thread. It also keeps a sync-only dependency out of requirements.txt.

Keys are unchanged from the S3 driver — `{user_id}/{uuid}-{filename}` — so
nothing in the database moves and there is no migration. Cloudinary's resource
type and public_id are DERIVED from the key, consistently on the way in and on
the way out, which is the only subtle part here:

    image/png   ->  image/upload/<key without .png>.png
    audio/wav   ->  video/upload/<key without .wav>.wav   (audio is "video")
    text/html   ->  raw/upload/<key with .html>

Delivery goes through MEDIA_BASE_URL so a CDN can sit in front, exactly as
neutv points Fastly at res.cloudinary.com.
"""
import hashlib
import logging
import mimetypes
import posixpath
import time

import httpx

from app.core.config import settings
from app.services.models_gateway import http

log = logging.getLogger("vivid.storage.cloudinary")

_API = "https://api.cloudinary.com/v1_1"

#: Cloudinary has three resource types and audio is not one of them — it is
#: served as "video". Anything that is not obviously media is "raw", which
#: stores and returns bytes verbatim (PDFs, the HTML artifacts).
_IMAGE, _VIDEO, _RAW = "image", "video", "raw"


class StorageError(Exception):
    pass


def configured() -> bool:
    return bool(settings.CLOUDINARY_CLOUD_NAME
                and settings.CLOUDINARY_API_KEY
                and settings.CLOUDINARY_API_SECRET)


def _resource_type(mime: str) -> str:
    if mime.startswith("image/"):
        return _IMAGE
    # Cloudinary stores and transcodes audio under the video resource type.
    if mime.startswith(("video/", "audio/")):
        return _VIDEO
    return _RAW


def _target(key: str, mime: str | None = None) -> tuple[str, str, str]:
    """(resource_type, public_id, extension) for `key`.

    Called on upload with the real mime, and on URL building with none — so it
    must agree with itself either way. When mime is absent it is guessed from
    the key's extension, which is why the extension is never dropped from the
    key itself.
    """
    if mime is None:
        mime = mimetypes.guess_type(key)[0] or "application/octet-stream"
    rtype = _resource_type(mime)

    base, ext = posixpath.splitext(key)
    ext = ext.lstrip(".").lower()

    if settings.CLOUDINARY_FOLDER:
        prefix = settings.CLOUDINARY_FOLDER.strip("/")
        base = f"{prefix}/{base}"
        key = f"{prefix}/{key}"

    # raw keeps the extension inside the public_id; image and video carry it as
    # the delivery format instead. Getting this backwards yields a 404 that
    # looks exactly like a missing file.
    if rtype == _RAW or not ext:
        return rtype, key, ""
    return rtype, base, ext


def _sign(params: dict) -> str:
    """Cloudinary's signature: sorted k=v joined by &, then the secret, sha1."""
    payload = "&".join(f"{k}={params[k]}" for k in sorted(params))
    return hashlib.sha1(
        (payload + settings.CLOUDINARY_API_SECRET).encode()).hexdigest()


def delivery_url(key: str, mime: str | None = None) -> str:
    """The public URL for `key`. No expiry and no signature: unguessable
    public_ids are the access control, the same practical model the presigned
    URLs had, minus the hour."""
    rtype, public_id, ext = _target(key, mime)
    base = (settings.CLOUDINARY_MEDIA_BASE_URL.rstrip("/")
            or f"https://res.cloudinary.com/{settings.CLOUDINARY_CLOUD_NAME}")
    path = f"{public_id}.{ext}" if ext else public_id
    return f"{base}/{rtype}/upload/{path}"


async def upload(key: str, data: bytes, mime: str) -> None:
    if not configured():
        raise StorageError("CLOUDINARY_CLOUD_NAME, _API_KEY and _API_SECRET "
                           "must all be set")
    rtype, public_id, _ = _target(key, mime)
    timestamp = int(time.time())
    signed = {"public_id": public_id, "timestamp": timestamp}
    # overwrite/invalidate are deliberately absent: keys carry a uuid and are
    # never reused, so an overwrite would mean a collision worth failing on.
    form = {
        **{k: str(v) for k, v in signed.items()},
        "api_key": settings.CLOUDINARY_API_KEY,
        "signature": _sign(signed),
    }
    try:
        r = await http.client().post(
            f"{_API}/{settings.CLOUDINARY_CLOUD_NAME}/{rtype}/upload",
            data=form,
            files={"file": (posixpath.basename(key), data, mime)},
            timeout=settings.CLOUDINARY_TIMEOUT)
    except httpx.HTTPError as e:
        raise StorageError(f"cloudinary upload failed: {e}") from e
    if r.status_code >= 400:
        raise StorageError(
            f"cloudinary upload returned {r.status_code}: {r.text[:300]}")


async def download(key: str, mime: str | None = None) -> bytes:
    """Fetch bytes back. Reads through the delivery URL rather than the admin
    API: it is the same path the browser uses, so a download that works proves
    the URL handed to the client works too.

    NOT byte-identical for images. Cloudinary re-encodes what it stores under
    the image resource type, so bytes in != bytes out (verified: an 8x8 PNG
    came back 95 bytes for 77 uploaded, same dimensions, still a valid PNG).
    Every caller here re-reads pictures to show them or to hand them to the
    vision model, and neither cares. Anything that ever needs the original
    octets — a checksum, a signature over the file — must not use this driver
    for that object. `raw` objects DO round-trip exactly."""
    url = delivery_url(key, mime)
    try:
        r = await http.client().get(url, timeout=settings.CLOUDINARY_TIMEOUT)
    except httpx.HTTPError as e:
        raise StorageError(f"cloudinary download failed: {e}") from e
    if r.status_code >= 400:
        raise StorageError(
            f"cloudinary download returned {r.status_code} for {url}")
    return r.content
