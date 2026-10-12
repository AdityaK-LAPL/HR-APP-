"""Attachment upload/download/delete business logic. See
docs/api-contract.md section 15 and docs/architecture.md section 6.

Every entity_type dispatches to that domain's own existing authorized
getter for read access (so there is exactly one implementation of "can
this caller see this task/customer/service call/...", not a second copy
here) and a narrower, entity-specific rule for write access (upload/
delete), since "can view" and "can attach a file" are not always the same
set of people - see _check_write_access.
"""

import re
import uuid
from pathlib import PurePosixPath

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AuthorizationError, NotFoundError, ValidationFailedError
from app.models.attachment import ATTACHABLE_ENTITY_TYPES, Attachment
from app.schemas.principal import CurrentUser
from app.services import (
    customer_service,
    eod_service,
    machine_service,
    project_service,
    service_call_service,
    service_report_service,
    task_service,
)
from app.services.audit_service import record_audit_log
from app.services.permission_service import in_scope
from app.services.storage import get_storage_backend, guess_content_type

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
    ".txt",
}

# First bytes of common formats, checked against the actual uploaded
# content rather than trusting the client-supplied filename/extension.
_MAGIC_SIGNATURES: dict[bytes, tuple[str, ...]] = {
    b"%PDF": (".pdf",),
    b"\x89PNG": (".png",),
    b"\xff\xd8\xff": (".jpg", ".jpeg"),
    b"GIF87a": (".gif",),
    b"GIF89a": (".gif",),
    b"PK\x03\x04": (".docx", ".xlsx"),  # zip-based Office formats
}
_SIGNATURE_REQUIRED_EXTENSIONS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".docx", ".xlsx",
}  # fmt: skip


_MAX_FILENAME_LENGTH = 150
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")


def sanitize_filename(raw: str) -> str:
    """The name shown to people: no directories, no control characters, a sane length.

    A client can send anything as a filename ("../../x.png", "a?b#c.png", a 300-character name,
    emoji). It is only ever *displayed* (and offered as the download name) - the file itself is
    stored under a server-generated name - but it is still cleaned so it can never carry a path
    or break a header.
    """
    name = _CONTROL_CHARACTERS.sub("", raw).replace("\\", "/").rsplit("/", 1)[-1]
    name = " ".join(name.split()).strip(" .")
    if len(name) > _MAX_FILENAME_LENGTH:
        stem, dot, ext = name.rpartition(".")
        if dot and len(ext) < 12:
            name = stem[: _MAX_FILENAME_LENGTH - len(ext) - 1] + dot + ext
        else:
            name = name[:_MAX_FILENAME_LENGTH]
    return name


def _validate_upload(filename: str, content: bytes) -> None:
    settings = get_settings()
    if len(content) == 0:
        raise ValidationFailedError("Uploaded file is empty.")
    if len(content) > settings.attachment_max_size_bytes:
        raise ValidationFailedError(
            f"File exceeds the maximum allowed size of {settings.attachment_max_size_bytes} bytes."
        )

    extension = PurePosixPath(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValidationFailedError(f"File type {extension or '(none)'} is not allowed.")

    is_webp = content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    for signature, extensions in _MAGIC_SIGNATURES.items():
        if content.startswith(signature):
            if extension not in extensions:
                raise ValidationFailedError(
                    "File content does not match its extension."
                )
            return
    if is_webp:
        if extension != ".webp":
            raise ValidationFailedError("File content does not match its extension.")
        return
    # No recognized signature. Plain text/csv and the legacy .doc/.xls formats have no reliable
    # one, so the extension allow-list is the only check for them. Every other type has a
    # signature, so content that has none (e.g. an executable renamed to .png) is refused.
    if extension in _SIGNATURE_REQUIRED_EXTENSIONS:
        raise ValidationFailedError("File content does not match its extension.")


async def _fetch_entity_with_read_check(
    db: AsyncSession, actor: CurrentUser, entity_type: str, entity_id: uuid.UUID
):
    if entity_type not in ATTACHABLE_ENTITY_TYPES:
        raise ValidationFailedError(f"entity_type must be one of {ATTACHABLE_ENTITY_TYPES}")

    if entity_type == "task":
        return await task_service.get_task(db, actor=actor, task_id=entity_id)
    if entity_type == "eod_report":
        return await eod_service.get_eod(db, actor=actor, eod_id=entity_id)
    if entity_type == "project":
        return await project_service.get_project(db, actor=actor, project_id=entity_id)
    if entity_type == "customer":
        return await customer_service.get_customer(db, actor=actor, customer_id=entity_id)
    if entity_type == "machine":
        return await machine_service.get_machine(db, actor=actor, machine_id=entity_id)
    if entity_type == "service_call":
        return await service_call_service.get_service_call(
            db, actor=actor, service_call_id=entity_id
        )
    if entity_type == "service_report":
        return await service_report_service.get_report(db, actor=actor, report_id=entity_id)
    raise ValidationFailedError(f"Unsupported entity_type: {entity_type}")


async def _check_write_access(
    db: AsyncSession, actor: CurrentUser, entity_type: str, entity
) -> bool:
    if actor.role == "owner":
        return True

    if entity_type == "task":
        return (
            entity.assigned_to == actor.id
            or entity.assigned_by == actor.id
            or await in_scope(db, actor, entity.assigned_to)
        )
    if entity_type == "eod_report":
        return entity.user_id == actor.id
    if entity_type == "project":
        return entity.owning_manager_id == actor.id or await in_scope(
            db, actor, entity.owning_manager_id
        )
    if entity_type == "customer":
        return await customer_service.can_edit_customer(db, actor, entity)
    if entity_type == "machine":
        return await machine_service.can_edit_machine(db, actor, entity)
    if entity_type == "service_call":
        return await service_call_service.can_manage_call(
            db, actor, entity
        ) or await service_call_service.is_assigned_to_call(db, actor, entity.id)
    if entity_type == "service_report":
        if entity.employee_id == actor.id:
            return True
        call = await service_call_service.fetch_call(db, entity.service_call_id)
        return await service_call_service.can_manage_call(db, actor, call)
    return False


async def upload_attachment(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    entity_type: str,
    entity_id: uuid.UUID,
    filename: str,
    content: bytes,
) -> Attachment:
    entity = await _fetch_entity_with_read_check(db, actor, entity_type, entity_id)
    if not await _check_write_access(db, actor, entity_type, entity):
        raise AuthorizationError("You do not have permission to attach files to this record.")

    filename = sanitize_filename(filename) or "upload"
    _validate_upload(filename, content)
    content_type = guess_content_type(filename)

    # Stored under a name the server makes up: the client's filename never reaches a path or URL.
    extension = PurePosixPath(filename).suffix.lower()
    storage_path = f"{entity_type}/{entity_id}/{uuid.uuid4()}{extension}"
    storage = get_storage_backend()
    await storage.upload(storage_path, content, content_type)

    attachment = Attachment(
        entity_type=entity_type,
        entity_id=entity_id,
        storage_path=storage_path,
        original_filename=filename,
        mime_type=content_type,
        size_bytes=len(content),
        uploaded_by=actor.id,
    )
    db.add(attachment)
    await db.flush()
    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="attachment.uploaded",
        entity_type=entity_type,
        entity_id=entity_id,
        new_value={
            "attachment_id": str(attachment.id),
            "filename": filename,
            "bytes": len(content),
        },
    )
    return attachment


async def list_attachments(
    db: AsyncSession, *, actor: CurrentUser, entity_type: str, entity_id: uuid.UUID
) -> list[Attachment]:
    # Read-check first, mirroring every other list endpoint in this
    # codebase - without this, an attachment's existence/filename would be
    # discoverable by anyone who could guess entity_type+entity_id.
    await _fetch_entity_with_read_check(db, actor, entity_type, entity_id)

    stmt = (
        select(Attachment)
        .where(
            Attachment.entity_type == entity_type,
            Attachment.entity_id == entity_id,
            Attachment.is_active.is_(True),
        )
        .order_by(Attachment.created_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def _get_active_attachment(db: AsyncSession, attachment_id: uuid.UUID) -> Attachment:
    attachment = (
        await db.execute(
            select(Attachment).where(Attachment.id == attachment_id, Attachment.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if attachment is None:
        raise NotFoundError("Attachment not found.")
    return attachment


async def get_attachment_with_url(
    db: AsyncSession, *, actor: CurrentUser, attachment_id: uuid.UUID
) -> tuple[Attachment, str]:
    attachment = await _get_active_attachment(db, attachment_id)
    await _fetch_entity_with_read_check(db, actor, attachment.entity_type, attachment.entity_id)

    storage = get_storage_backend()
    url = await storage.generate_signed_url(attachment.storage_path)
    url = url.replace("{attachment_id}", str(attachment.id))
    return attachment, url


async def download_attachment_bytes(
    db: AsyncSession, *, actor: CurrentUser, attachment_id: uuid.UUID
) -> tuple[bytes, Attachment]:
    attachment = await _get_active_attachment(db, attachment_id)
    await _fetch_entity_with_read_check(db, actor, attachment.entity_type, attachment.entity_id)

    storage = get_storage_backend()
    content = await storage.download(attachment.storage_path)
    return content, attachment


async def delete_attachment(
    db: AsyncSession, *, actor: CurrentUser, attachment_id: uuid.UUID
) -> None:
    attachment = await _get_active_attachment(db, attachment_id)

    if attachment.uploaded_by != actor.id:
        entity = await _fetch_entity_with_read_check(
            db, actor, attachment.entity_type, attachment.entity_id
        )
        if not await _check_write_access(db, actor, attachment.entity_type, entity):
            raise AuthorizationError("You do not have permission to remove this attachment.")

    # Soft-remove only (hidden from listings) - the file itself stays in
    # storage, per api-contract.md section 15, unless the Owner purges it
    # through a separate operational process, not built here.
    attachment.is_active = False
    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="attachment.removed",
        entity_type=attachment.entity_type,
        entity_id=attachment.entity_id,
        old_value={"attachment_id": str(attachment.id), "filename": attachment.original_filename},
    )
    await db.flush()
