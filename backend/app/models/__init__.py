"""SQLAlchemy models package.

Each phase adds its own module here (e.g. `identity.py` in Phase 2,
`tasks.py`/`projects.py` in Phase 3). Every model must import `Base` from
`app.db.base` so Alembic's autogenerate can discover it - see
`alembic/env.py`. Importing this package imports every model module so
`Base.metadata` is always fully populated.
"""

from app.models import (  # noqa: F401
    attachment,
    attendance,
    audit,
    company,
    customer,
    eod,
    identity,
    leave,
    machine,
    notification,
    permission,
    project,
    service,
    task,
)

