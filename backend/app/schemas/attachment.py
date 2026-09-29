import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AttachmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    original_filename: str
    mime_type: str | None
    size_bytes: int | None
    uploaded_by: uuid.UUID
    created_at: datetime


class AttachmentWithUrlResponse(AttachmentResponse):
    download_url: str


class AttachmentListResponse(BaseModel):
    items: list[AttachmentResponse]
