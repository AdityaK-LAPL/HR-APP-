"""EOD report business logic. See docs/api-contract.md section 7.

No update path exists - once submitted a report is historical, per
context.md section 3.3.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, NotFoundError
from app.models.eod import EodReport
from app.models.identity import ManagerHierarchyClosure
from app.schemas.eod import EodCreateRequest
from app.schemas.principal import CurrentUser
from app.services.permission_service import in_scope


async def submit_eod(
    db: AsyncSession, *, actor: CurrentUser, payload: EodCreateRequest
) -> EodReport:
    report = EodReport(
        user_id=actor.id,
        report_date=payload.report_date,
        project_id=payload.project_id,
        task_id=payload.task_id,
        work_completed=payload.work_completed,
        work_remaining=payload.work_remaining,
        issues=payload.issues,
        notes=payload.notes,
    )
    db.add(report)
    await db.flush()
    return report


async def get_eod(db: AsyncSession, *, actor: CurrentUser, eod_id: uuid.UUID) -> EodReport:
    report = (
        await db.execute(select(EodReport).where(EodReport.id == eod_id))
    ).scalar_one_or_none()
    if report is None:
        raise NotFoundError("EOD report not found.")
    if (
        actor.role != "owner"
        and report.user_id != actor.id
        and not await in_scope(db, actor, report.user_id)
    ):
        raise AuthorizationError("You do not have permission to view this EOD report.")
    return report


async def list_eod(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    user_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    report_date: date | None,
    page: int,
    page_size: int,
) -> tuple[list[EodReport], int]:
    stmt = select(EodReport)

    if actor.role == "manager":
        subtree_ids = select(ManagerHierarchyClosure.descendant_id).where(
            ManagerHierarchyClosure.ancestor_id == actor.id
        )
        stmt = stmt.where(EodReport.user_id.in_(subtree_ids) | (EodReport.user_id == actor.id))
    elif actor.role != "owner":
        stmt = stmt.where(EodReport.user_id == actor.id)

    if user_id is not None:
        stmt = stmt.where(EodReport.user_id == user_id)
    if project_id is not None:
        stmt = stmt.where(EodReport.project_id == project_id)
    if report_date is not None:
        stmt = stmt.where(EodReport.report_date == report_date)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = (
        stmt.order_by(EodReport.report_date.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    reports = (await db.execute(stmt)).scalars().all()
    return list(reports), total
