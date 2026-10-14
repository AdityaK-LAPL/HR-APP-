"""Attachment endpoints - see docs/api-contract.md section 15."""

import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.http import content_disposition
from app.db.session import get_db
from app.schemas.attachment import (
    AttachmentListResponse,
    AttachmentResponse,
    AttachmentWithUrlResponse,
)
from app.schemas.principal import CurrentUser
from app.services import attachment_service

router = APIRouter(prefix="/attachments", tags=["attachments"])


@router.get("", response_model=AttachmentListResponse)
async def list_attachments(
    entity_type: str,
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> AttachmentListResponse:
    attachments = await attachment_service.list_attachments(
        db, actor=current_user, entity_type=entity_type, entity_id=entity_id
    )
    return AttachmentListResponse(
        items=[AttachmentResponse.model_validate(a) for a in attachments]
    )


@router.post("", response_model=AttachmentWithUrlResponse, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    entity_type: str = Form(...),
    entity_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> AttachmentWithUrlResponse:
    # Read one byte past the limit: an oversized upload is refused without holding all of it.
    content = await file.read(get_settings().attachment_max_size_bytes + 1)
    attachment = await attachment_service.upload_attachment(
        db,
        actor=current_user,
        entity_type=entity_type,
        entity_id=entity_id,
        filename=file.filename or "upload",
        content=content,
    )
    _, download_url = await attachment_service.get_attachment_with_url(
        db, actor=current_user, attachment_id=attachment.id
    )
    return AttachmentWithUrlResponse(
        **AttachmentResponse.model_validate(attachment).model_dump(), download_url=download_url
    )


@router.get("/{attachment_id}", response_model=AttachmentWithUrlResponse)
async def get_attachment(
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> AttachmentWithUrlResponse:
    attachment, download_url = await attachment_service.get_attachment_with_url(
        db, actor=current_user, attachment_id=attachment_id
    )
    return AttachmentWithUrlResponse(
        **AttachmentResponse.model_validate(attachment).model_dump(), download_url=download_url
    )


@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    content, attachment = await attachment_service.download_attachment_bytes(
        db, actor=current_user, attachment_id=attachment_id
    )
    return StreamingResponse(
        iter([content]),
        media_type=attachment.mime_type or "application/octet-stream",
        headers={"Content-Disposition": content_disposition(attachment.original_filename)},
    )


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    await attachment_service.delete_attachment(db, actor=current_user, attachment_id=attachment_id)
