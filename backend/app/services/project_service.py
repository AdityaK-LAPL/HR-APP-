"""Project business logic. See docs/api-contract.md section 5.

Archiving (`is_active=false`) is gated by the separate `delete_archive_project`
permission even for the project's own owning manager - context.md section 8
calls this out as a distinct, Owner-controllable capability from ordinary
edit access.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, ConflictError, NotFoundError, ValidationFailedError
from app.models.identity import ManagerHierarchyClosure
from app.models.project import Project, ProjectMember
from app.schemas.principal import CurrentUser
from app.schemas.project import ProjectCreateRequest, ProjectMemberAddRequest, ProjectUpdateRequest
from app.services.audit_service import record_audit_log
from app.services.permission_service import has_permission, in_scope
from app.services.user_lookup import get_user_stub


async def _get_project(db: AsyncSession, project_id: uuid.UUID) -> Project:
    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None:
        raise NotFoundError("Project not found.")
    return project


async def _can_view_project(db: AsyncSession, actor: CurrentUser, project: Project) -> bool:
    if actor.role == "owner":
        return True
    if project.owning_manager_id == actor.id:
        return True
    if await in_scope(db, actor, project.owning_manager_id):
        return True
    member_stmt = select(ProjectMember.id).where(
        ProjectMember.project_id == project.id,
        ProjectMember.user_id == actor.id,
        ProjectMember.is_active.is_(True),
    )
    return (await db.execute(member_stmt)).first() is not None


async def _can_modify_project(db: AsyncSession, actor: CurrentUser, project: Project) -> bool:
    if actor.role == "owner":
        return True
    if project.owning_manager_id == actor.id:
        return True
    return await has_permission(
        db, actor, "modify_project", scope_type="project", scope_id=project.id
    )


async def _can_archive_project(db: AsyncSession, actor: CurrentUser, project: Project) -> bool:
    if actor.role == "owner":
        return True
    return await has_permission(
        db, actor, "delete_archive_project", scope_type="project", scope_id=project.id
    )


async def _can_manage_members(db: AsyncSession, actor: CurrentUser, project: Project) -> bool:
    if actor.role == "owner":
        return True
    if project.owning_manager_id == actor.id:
        return True
    return await has_permission(
        db, actor, "assign_employees_to_project", scope_type="project", scope_id=project.id
    )


async def create_project(
    db: AsyncSession, *, actor: CurrentUser, payload: ProjectCreateRequest
) -> Project:
    if actor.role == "employee":
        raise AuthorizationError("Employees cannot create projects.")
    if actor.role == "manager" and not await has_permission(
        db, actor, "create_project", scope_type="global", scope_id=None
    ):
        raise AuthorizationError("You do not have permission to create projects.")

    project = Project(
        name=payload.name,
        description=payload.description,
        owning_manager_id=actor.id,
        status=payload.status,
        start_date=payload.start_date,
        expected_end_date=payload.expected_end_date,
    )
    db.add(project)
    await db.flush()

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="project.created",
        entity_type="project",
        entity_id=project.id,
        new_value={"name": project.name, "status": project.status},
    )
    await db.flush()
    return project


async def get_project(db: AsyncSession, *, actor: CurrentUser, project_id: uuid.UUID) -> Project:
    project = await _get_project(db, project_id)
    if not await _can_view_project(db, actor, project):
        raise AuthorizationError("You do not have permission to view this project.")
    return project


async def list_projects(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    status: str | None,
    manager_id: uuid.UUID | None,
    member_id: uuid.UUID | None,
    page: int,
    page_size: int,
) -> tuple[list[Project], int]:
    stmt = select(Project)

    member_project_ids = select(ProjectMember.project_id).where(
        ProjectMember.user_id == actor.id, ProjectMember.is_active.is_(True)
    )

    if actor.role == "owner":
        pass
    elif actor.role == "manager":
        subtree_ids = select(ManagerHierarchyClosure.descendant_id).where(
            ManagerHierarchyClosure.ancestor_id == actor.id
        )
        stmt = stmt.where(
            Project.owning_manager_id.in_(subtree_ids) | Project.id.in_(member_project_ids)
        )
    else:
        stmt = stmt.where(Project.id.in_(member_project_ids))

    if status is not None:
        stmt = stmt.where(Project.status == status)
    if manager_id is not None:
        stmt = stmt.where(Project.owning_manager_id == manager_id)
    if member_id is not None:
        member_filter = select(ProjectMember.project_id).where(
            ProjectMember.user_id == member_id, ProjectMember.is_active.is_(True)
        )
        stmt = stmt.where(Project.id.in_(member_filter))

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(Project.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    projects = (await db.execute(stmt)).scalars().all()
    return list(projects), total


async def update_project(
    db: AsyncSession, *, actor: CurrentUser, project_id: uuid.UUID, payload: ProjectUpdateRequest
) -> Project:
    project = await _get_project(db, project_id)

    wants_archive = payload.is_active is False
    if wants_archive:
        if not await _can_archive_project(db, actor, project):
            raise AuthorizationError("You do not have permission to archive this project.")
    elif not await _can_modify_project(db, actor, project):
        raise AuthorizationError("You do not have permission to modify this project.")

    old_value = {"name": project.name, "status": project.status, "is_active": project.is_active}

    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    if payload.status is not None:
        project.status = payload.status
    if payload.start_date is not None:
        project.start_date = payload.start_date
    if payload.expected_end_date is not None:
        project.expected_end_date = payload.expected_end_date
    if payload.actual_end_date is not None:
        project.actual_end_date = payload.actual_end_date
    if payload.is_active is not None:
        project.is_active = payload.is_active

    await db.flush()

    new_value = {"name": project.name, "status": project.status, "is_active": project.is_active}
    if old_value != new_value:
        action = "project.archived" if wants_archive else "project.modified"
        await record_audit_log(
            db,
            actor_user_id=actor.id,
            action=action,
            entity_type="project",
            entity_id=project.id,
            old_value=old_value,
            new_value=new_value,
        )
        await db.flush()

    return project


async def list_members(
    db: AsyncSession, *, actor: CurrentUser, project_id: uuid.UUID
) -> list[ProjectMember]:
    project = await _get_project(db, project_id)
    if not await _can_view_project(db, actor, project):
        raise AuthorizationError("You do not have permission to view this project.")
    stmt = select(ProjectMember).where(
        ProjectMember.project_id == project_id, ProjectMember.is_active.is_(True)
    )
    return list((await db.execute(stmt)).scalars().all())


async def add_member(
    db: AsyncSession, *, actor: CurrentUser, project_id: uuid.UUID, payload: ProjectMemberAddRequest
) -> ProjectMember:
    project = await _get_project(db, project_id)
    if not await _can_manage_members(db, actor, project):
        raise AuthorizationError("You do not have permission to change this project's members.")

    user = await get_user_stub(db, payload.user_id)
    if user is None or not user.is_active:
        raise ValidationFailedError("user_id does not reference an active user.")

    existing = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == payload.user_id,
                ProjectMember.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("This user is already an active member of the project.")

    member = ProjectMember(
        project_id=project_id,
        user_id=payload.user_id,
        role_in_project=payload.role_in_project,
        assigned_by=actor.id,
    )
    db.add(member)
    await db.flush()

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="project.member_added",
        entity_type="project",
        entity_id=project.id,
        new_value={"user_id": str(payload.user_id)},
    )
    await db.flush()
    return member


async def remove_member(
    db: AsyncSession, *, actor: CurrentUser, project_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    project = await _get_project(db, project_id)
    if not await _can_manage_members(db, actor, project):
        raise AuthorizationError("You do not have permission to change this project's members.")

    member = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
                ProjectMember.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if member is None:
        raise NotFoundError("Active project membership not found.")

    member.is_active = False
    await db.flush()

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="project.member_removed",
        entity_type="project",
        entity_id=project.id,
        old_value={"user_id": str(user_id)},
    )
    await db.flush()
