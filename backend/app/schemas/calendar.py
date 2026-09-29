import uuid
from datetime import date

from pydantic import BaseModel


class CalendarEntry(BaseModel):
    entry_date: date
    entry_type: str
    user_id: uuid.UUID
    title: str
    status: str
    project_id: uuid.UUID | None = None


class CalendarResponse(BaseModel):
    items: list[CalendarEntry]
