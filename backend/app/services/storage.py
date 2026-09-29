"""File storage abstraction for attachments. See docs/architecture.md
section 6.

Two backends, selected automatically from configuration:

- `LocalFilesystemStorage`: writes under a local directory
  (`settings.local_storage_dir`). Used whenever Supabase credentials
  aren't configured (`Settings.use_supabase_storage` is false) - this
  environment, local development, CI. Fully functional and covered by
  tests without needing a Supabase project.
- `SupabaseStorage`: the production backend, calling the Supabase Storage
  REST API directly over HTTP (no Supabase Python SDK dependency, to keep
  the exact request/response shape visible and auditable here). Selected
  automatically once `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
  set. **Not exercised in this environment** - no Supabase project is
  configured - so treat it with the same "written, not yet verified"
  status as every other piece of this backend that depends on
  infrastructure this environment doesn't have. See
  docs/development-status.md.

Both backends only ever operate on `storage_path` values the application
itself generated (see app/services/attachment_service.py) - never on a
path supplied directly by a client.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Protocol

import httpx

from app.core.config import get_settings


class StorageBackend(Protocol):
    async def upload(self, storage_path: str, content: bytes, content_type: str) -> None: ...

    async def download(self, storage_path: str) -> bytes: ...

    async def generate_signed_url(self, storage_path: str) -> str: ...

    async def delete(self, storage_path: str) -> None: ...


class LocalFilesystemStorage:
    """Dev/test-friendly backend - real files on local disk, no external
    service required. `generate_signed_url` returns our own app's
    `/attachments/{id}/download` route rather than a real signed URL,
    since there is no separate object-storage service to sign a URL for.
    """

    def __init__(self, root_dir: str):
        self._root = Path(root_dir)

    def _resolve(self, storage_path: str) -> Path:
        # storage_path is always server-generated (see attachment_service.py),
        # never client input, but resolve+relative-to guards against any
        # future caller accidentally passing something path-traversal-ish.
        resolved = (self._root / storage_path).resolve()
        if not resolved.is_relative_to(self._root.resolve()):
            raise ValueError("storage_path escapes the storage root")
        return resolved

    async def upload(self, storage_path: str, content: bytes, content_type: str) -> None:
        path = self._resolve(storage_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    async def download(self, storage_path: str) -> bytes:
        return self._resolve(storage_path).read_bytes()

    async def generate_signed_url(self, storage_path: str) -> str:
        # The caller (attachment_service.get_attachment) substitutes the
        # real attachment id into this placeholder before returning it to
        # the client, since this backend has no id in scope here.
        return "/api/v1/attachments/{attachment_id}/download"

    async def delete(self, storage_path: str) -> None:
        path = self._resolve(storage_path)
        path.unlink(missing_ok=True)


class SupabaseStorage:
    """Calls the Supabase Storage REST API directly. See module docstring
    for why this has not been executed/verified in this environment.
    """

    def __init__(self, base_url: str, service_role_key: str, bucket: str, expire_seconds: int):
        self._base_url = base_url.rstrip("/")
        self._key = service_role_key
        self._bucket = bucket
        self._expire_seconds = expire_seconds

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._key}", "apikey": self._key}

    async def upload(self, storage_path: str, content: bytes, content_type: str) -> None:
        url = f"{self._base_url}/storage/v1/object/{self._bucket}/{storage_path}"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url,
                content=content,
                headers={**self._headers(), "Content-Type": content_type},
            )
            response.raise_for_status()

    async def download(self, storage_path: str) -> bytes:
        url = f"{self._base_url}/storage/v1/object/{self._bucket}/{storage_path}"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=self._headers())
            response.raise_for_status()
            return response.content

    async def generate_signed_url(self, storage_path: str) -> str:
        url = f"{self._base_url}/storage/v1/object/sign/{self._bucket}/{storage_path}"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url, json={"expiresIn": self._expire_seconds}, headers=self._headers()
            )
            response.raise_for_status()
            signed_path = response.json()["signedURL"]
            return f"{self._base_url}/storage/v1{signed_path}"

    async def delete(self, storage_path: str) -> None:
        url = f"{self._base_url}/storage/v1/object/{self._bucket}/{storage_path}"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.delete(url, headers=self._headers())
            response.raise_for_status()


def get_storage_backend() -> StorageBackend:
    settings = get_settings()
    if settings.use_supabase_storage:
        return SupabaseStorage(
            base_url=settings.supabase_url,  # type: ignore[arg-type]
            service_role_key=settings.supabase_service_role_key,  # type: ignore[arg-type]
            bucket=settings.supabase_storage_bucket,
            expire_seconds=settings.attachment_signed_url_expire_seconds,
        )
    return LocalFilesystemStorage(settings.local_storage_dir)


def guess_content_type(filename: str) -> str:
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"
