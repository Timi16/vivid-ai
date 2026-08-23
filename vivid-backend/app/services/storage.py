"""S3-compatible object storage. boto3 is sync, so calls run in a thread."""
import asyncio

import boto3
from botocore.client import Config

from app.core.config import settings

_client = None
_presign_client = None


def _make_client(endpoint: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name="us-east-1",
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


async def ensure_bucket() -> None:
    def _ensure():
        c = client()
        try:
            c.head_bucket(Bucket=settings.S3_BUCKET)
        except Exception:
            c.create_bucket(Bucket=settings.S3_BUCKET)
    await asyncio.to_thread(_ensure)


async def upload(key: str, data: bytes, mime: str) -> None:
    await asyncio.to_thread(
        client().put_object,
        Bucket=settings.S3_BUCKET, Key=key, Body=data, ContentType=mime)


async def download(key: str) -> bytes:
    def _get() -> bytes:
        return client().get_object(Bucket=settings.S3_BUCKET, Key=key)["Body"].read()
    return await asyncio.to_thread(_get)


def presigned_url(key: str, expires_in: int = 3600) -> str:
    return presign_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": key},
        ExpiresIn=expires_in)
