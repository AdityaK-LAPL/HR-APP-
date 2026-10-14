"""Leave request business logic. See docs/api-contract.md section 6.

Implements the single-level "Employee -> Manager -> Approval/Rejection"
flow from context.md section 3.2 by default: `current_approver_id` is set
to the applicant's direct manager, and one decision finalizes the request.
The schema (`leave_approvals.sequence`) supports a multi-step chain without
a migration if that's confirmed as a requirement later - see
docs/architecture.md section 11, open question 3. If the applicant has no
manager (only possible for the Owner in this hierarchy), the request is
auto-approved since there is no one above to decide it.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, NotFoundError, ValidationFailedError
from app.models.identity import ManagerHierarchyClosure, User
from app.models.leave import LeaveApproval, LeaveRequest
from app.schemas.leave import LeaveCreateRequest
from app.schemas.principal import CurrentUser
from app.services.audit_service import record_audit_log
from app.services.permission_service import in_scope


async def _get_leave(db: AsyncSession, leave_id: uuid.UUID) -> LeaveRequest:
    leave = (
        await db.execute(select(LeaveRequest).where(LeaveRequest.id == leave_id))
    ).scalar_one_or_none()
    if leave is None:
        raise NotFoundError("Leave request not found.")
    return leave


async def apply_leave(
    db: AsyncSession, *, actor: CurrentUser, payload: LeaveCreateRequest
) -> LeaveRequest:
    applicant = (await db.execute(select(User).where(User.id == actor.id))).scalar_one_or_none()
    if applicant is None:
        raise NotFoundError("User not found.")

    auto_approved = applicant.manager_id is None
    leave = LeaveRequest(
        employee_id=actor.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason,
        leave_kind=payload.leave_kind,
        status="approved" if auto_approved else "pending",
        current_approver_id=None if auto_approved else applicant.manager_id,
    )
    db.add(leave)
    await db.flush()
    return leave


async def get_leave(db: AsyncSession, *, actor: CurrentUser, leave_id: uuid.UUID) -> LeaveRequest:
    leave = await _get_leave(db, leave_id)
    is_visible = (
        actor.role == "owner"
        or leave.employee_id == actor.id
        or await in_scope(db, actor, leave.employee_id)
    )
    if not is_visible:
        raise AuthorizationError("You do not have permission to view this leave request.")
    return leave


async def list_leaves(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    employee_id: uuid.UUID | None,
    status: str | None,
    page: int,
    page_size: int,
) -> tuple[list[LeaveRequest], int]:
    stmt = select(LeaveRequest)

    if actor.role == "manager":
        subtree_ids = select(ManagerHierarchyClosure.descendant_id).where(
            ManagerHierarchyClosure.ancestor_id == actor.id
        )
        stmt = stmt.where(
            LeaveRequest.employee_id.in_(subtree_ids) | (LeaveRequest.employee_id == actor.id)
        )
    elif actor.role != "owner":
        stmt = stmt.where(LeaveRequest.employee_id == actor.id)

    if employee_id is not None:
        stmt = stmt.where(LeaveRequest.employee_id == employee_id)
    if status is not None:
        stmt = stmt.where(LeaveRequest.status == status)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(LeaveRequest.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    leaves = (await db.execute(stmt)).scalars().all()
    return list(leaves), total


async def _decide(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    leave_id: uuid.UUID,
    decision: str,
    comments: str | None,
) -> LeaveRequest:
    leave = await _get_leave(db, leave_id)

    if actor.role != "owner" and leave.current_approver_id != actor.id:
        raise AuthorizationError("You are not the approver for this leave request.")
    if leave.status != "pending":
        raise ValidationFailedError("This leave request has already been decided.")

    db.add(
        LeaveApproval(
            leave_request_id=leave.id,
            approver_id=actor.id,
            sequence=1,
            decision=decision,
            comments=comments,
        )
    )

    leave.status = "approved" if decision == "approved" else "rejected"
    leave.current_approver_id = None
    await db.flush()

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action=f"leave.{decision}",
        entity_type="leave_request",
        entity_id=leave.id,
        new_value={"status": leave.status, "comments": comments},
    )
    await db.flush()
    return leave


async def approve_leave(
    db: AsyncSession, *, actor: CurrentUser, leave_id: uuid.UUID, comments: str | None
) -> LeaveRequest:
    return await _decide(db, actor=actor, leave_id=leave_id, decision="approved", comments=comments)


async def reject_leave(
    db: AsyncSession, *, actor: CurrentUser, leave_id: uuid.UUID, comments: str
) -> LeaveRequest:
    return await _decide(db, actor=actor, leave_id=leave_id, decision="rejected", comments=comments)


async def cancel_leave(
    db: AsyncSession, *, actor: CurrentUser, leave_id: uuid.UUID
) -> LeaveRequest:
    leave = await _get_leave(db, leave_id)
    if leave.employee_id != actor.id:
        raise AuthorizationError("You can only cancel your own leave request.")
    if leave.status != "pending":
        raise ValidationFailedError("Only a pending leave request can be cancelled.")

    leave.status = "cancelled"
    leave.current_approver_id = None
    await db.flush()
    return leave
