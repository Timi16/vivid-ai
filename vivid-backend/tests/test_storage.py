"""The two storage drivers behind one API.

The load-bearing property is that _target() agrees with itself: upload() calls
it WITH a mime, delivery_url() calls it WITHOUT one, and if those disagree the
object is stored under a public_id nothing ever asks for. That failure looks
exactly like a missing file, so it is worth a test rather than a comment.
"""
import pytest

from app.core.config import settings
from app.services import storage
from app.services import storage_cloudinary as cl


@pytest.fixture
def cloudinary(monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_DRIVER", "cloudinary")
    monkeypatch.setattr(settings, "CLOUDINARY_CLOUD_NAME", "testcloud")
    monkeypatch.setattr(settings, "CLOUDINARY_API_KEY", "key")
    monkeypatch.setattr(settings, "CLOUDINARY_API_SECRET", "secret")
    monkeypatch.setattr(settings, "CLOUDINARY_FOLDER", "vivid")
    monkeypatch.setattr(settings, "CLOUDINARY_MEDIA_BASE_URL", "")


@pytest.mark.parametrize("key,mime,rtype", [
    ("u/a-photo.png", "image/png", "image"),
    ("u/a-clip.mp4", "video/mp4", "video"),
    # Cloudinary has no audio resource type; audio is served as video.
    ("u/a-reply.wav", "audio/wav", "video"),
    ("u/a-doc.pdf", "application/pdf", "raw"),
    ("u/a-site.html", "text/html", "raw"),
    ("u/a-noext", "application/octet-stream", "raw"),
])
def test_target_agrees_with_and_without_mime(cloudinary, key, mime, rtype):
    with_mime = cl._target(key, mime)
    without = cl._target(key, None)
    assert with_mime == without, "upload and delivery would disagree"
    assert with_mime[0] == rtype


def test_delivery_url_shape(cloudinary):
    assert cl.delivery_url("u/a-photo.png", "image/png") == (
        "https://res.cloudinary.com/testcloud/image/upload/vivid/u/a-photo.png")
    # raw keeps the extension inside the public_id rather than as a format
    assert cl.delivery_url("u/a-doc.pdf", "application/pdf") == (
        "https://res.cloudinary.com/testcloud/raw/upload/vivid/u/a-doc.pdf")


def test_media_base_url_lets_a_cdn_sit_in_front(cloudinary, monkeypatch):
    monkeypatch.setattr(settings, "CLOUDINARY_MEDIA_BASE_URL",
                        "https://cdn.example.com/testcloud")
    assert cl.delivery_url("u/a-photo.png", "image/png").startswith(
        "https://cdn.example.com/testcloud/image/upload/")


def test_signature_is_sorted_params_then_secret(cloudinary):
    import hashlib
    params = {"timestamp": 123, "public_id": "vivid/u/a"}
    expected = hashlib.sha1(
        b"public_id=vivid/u/a&timestamp=123secret").hexdigest()
    assert cl._sign(params) == expected


def test_presigned_url_dispatches_to_cloudinary(cloudinary):
    url = storage.presigned_url("u/a-photo.png")
    assert url.startswith("https://res.cloudinary.com/testcloud/image/upload/")
    assert "X-Amz-Signature" not in url


def test_s3_is_the_default_driver(monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_DRIVER", "s3")
    assert storage.driver() == "s3"
    assert not storage._use_cloudinary()


@pytest.mark.asyncio
async def test_ensure_bucket_is_a_noop_on_cloudinary(cloudinary):
    # Would raise if it tried to reach MinIO; Cloudinary has no buckets.
    await storage.ensure_bucket()


def test_cloudinary_reports_missing_credentials(cloudinary, monkeypatch):
    monkeypatch.setattr(settings, "CLOUDINARY_API_SECRET", "")
    assert not cl.configured()
