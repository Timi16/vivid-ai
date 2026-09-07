"""Object storage. Two drivers behind one API; STORAGE_DRIVER picks.

    s3          MinIO on the box, or any S3-compatible service. Attachments
                are handed out as presigned URLs, which is why the deployment
                needs a storage.<domain> hostname: the S3v4 signature covers
                the host, so MinIO cannot sit behind a path prefix.
    cloudinary  A CDN in front of the same bytes. Delivery URLs are public and
                permanent, so no second hostname and no per-request signing —
                and images stop being a round trip to one VPS.

Callers never learn which is live. Keys are identical under both, so the
database is unchanged by a switch; what a switch does NOT do is move existing
objects, so anything already in MinIO stays there and needs migrating.

boto3 is sync, so the S3 paths run in a thread. The Cloudinary driver is
async on the shared httpx client.
"""
import asyncio

import boto3
from botocore.client import Config

from app.core.config import settings
from app.services import storage_cloudinary as _cloudinary

S3 = "s3"
CLOUDINARY = "cloudinary"

_client = None
_presign_client = None


def driver() -> str:
    return (settings.STORAGE_DRIVER or S3).strip().lower()


def _use_cloudinary() -> bool:
    return driver() == CLOUDINARY


# ------------------------------------------------------------------ s3
def _make_client(endpoint: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
        config=Config(signature_version="s3v4"),
    )


def client():
    global _client
    if _client is None:
        _client = _make_client(settings.S3_ENDPOINT_URL)
    return _client


def presign_client():
    # Presigned URLs embed the host in the signature, so they must be signed
    # against the endpoint the browser will actually hit.
    global _presign_client
    if _presign_client is None:
        endpoint = settings.S3_PUBLIC_ENDPOINT_URL or settings.S3_ENDPOINT_URL
        _presign_client = _make_client(endpoint)
    return _presign_client


# --------------------------------------------------------------- public
async def ensure_bucket() -> None:
    """S3 needs a bucket to exist. Cloudinary has no such concept — folders
    are created implicitly by the first upload into them."""
    if _use_cloudinary():
        return

    def _ensure():
        c = client()
        try:
            c.head_bucket(Bucket=settings.S3_BUCKET)
        except Exception:
            c.create_bucket(Bucket=settings.S3_BUCKET)
    await asyncio.to_thread(_ensure)


async def upload(key: str, data: bytes, mime: str) -> None:
    if _use_cloudinary():
        await _cloudinary.upload(key, data, mime)
        return
    await asyncio.to_thread(
        client().put_object,
        Bucket=settings.S3_BUCKET, Key=key, Body=data, ContentType=mime)


async def download(key: str) -> bytes:
    if _use_cloudinary():
        return await _cloudinary.download(key)

    def _get() -> bytes:
        return client().get_object(Bucket=settings.S3_BUCKET, Key=key)["Body"].read()
    return await asyncio.to_thread(_get)


def presigned_url(key: str, expires_in: int = 3600) -> str:
    """A URL the browser can fetch. Cloudinary's is permanent and unsigned, so
    `expires_in` is ignored there — the access model becomes an unguessable
    public_id rather than a time-limited signature."""
    if _use_cloudinary():
        return _cloudinary.delivery_url(key)
    return presign_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": key},
        ExpiresIn=expires_in)
