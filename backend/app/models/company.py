"""Company-wide settings and holidays - the calendar behind the attendance reports.

`CompanySettings` is a single row (id = 1). Weekdays are numbered like Python's `date.weekday()`:
0 = Monday ... 6 = Sunday, so the default {5, 6} is Saturday + Sunday. Holidays are removed softly
(`is_active = false`): history is never deleted.
"""

import uuid
from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, ForeignKey, SmallInteger, Text, Time, func, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class CompanySettings(Base):
    __tablename__ = "company_settings"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, server_default=text("1"))
    company_name: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="Laser Automation"
    )
    weekly_off_days: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger), nullable=False, server_default=text("'{5,6}'")
    )
    late_after: Mapped[time] = mapped_column(Time, nullable=False, server_default=text("'09:30'"))
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )


class CompanyHoliday(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "company_holidays"

    holiday_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
