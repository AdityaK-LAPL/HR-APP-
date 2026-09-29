"""Unit tests for the local filesystem storage backend - no database
required. See app/services/storage.py.
"""

import pytest

from app.services.storage import LocalFilesystemStorage


@pytest.fixture
def storage(tmp_path):
    return LocalFilesystemStorage(str(tmp_path))


async def test_upload_then_download_roundtrip(storage):
    await storage.upload("task/abc/file.pdf", b"hello world", "application/pdf")
    content = await storage.download("task/abc/file.pdf")
    assert content == b"hello world"


async def test_upload_creates_nested_directories(storage, tmp_path):
    await storage.upload("customer/xyz/deep/nested/file.png", b"data", "image/png")
    assert (tmp_path / "customer" / "xyz" / "deep" / "nested" / "file.png").exists()


async def test_delete_removes_file(storage):
    await storage.upload("task/abc/file.pdf", b"hello", "application/pdf")
    await storage.delete("task/abc/file.pdf")
    with pytest.raises(FileNotFoundError):
        await storage.download("task/abc/file.pdf")


async def test_delete_missing_file_does_not_raise(storage):
    await storage.delete("task/does/not/exist.pdf")


async def test_generate_signed_url_returns_download_placeholder(storage):
    url = await storage.generate_signed_url("task/abc/file.pdf")
    assert url == "/api/v1/attachments/{attachment_id}/download"


async def test_path_traversal_is_rejected(storage):
    with pytest.raises(ValueError):
        await storage.upload("../../etc/passwd", b"malicious", "text/plain")
