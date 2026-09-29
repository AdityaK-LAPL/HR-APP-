"""SQLAlchemy declarative base shared by every model.

A fixed naming convention is applied so Alembic autogenerate produces
deterministic, predictable constraint/index names instead of
database-driver-assigned ones - this matters once migrations need to
`ALTER`/`DROP` a specific constraint by name later.
"""

from datetime import datetime

from sqlalchemy import DateTime, MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    # Every timestamp column is `timestamptz` in the migrations and the app
    # passes timezone-aware UTC datetimes; a bare `Mapped[datetime]` would
    # otherwise map to naive `TIMESTAMP` and asyncpg rejects aware values.
    type_annotation_map = {datetime: DateTime(timezone=True)}
