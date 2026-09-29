"""Project endpoints - see docs/api-contract.md section 5."""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.principal import CurrentUser
from app.schemas.project import (
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectMemberAddRequest,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectUpdateRequest,
)
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    status_: str | None = Query(None, alias="status"),
    manager_id: uuid.UUID | None = None,
    member_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ProjectListResponse:
    projects, total = await project_service.list_projects(
        db,
        actor=current_user,
        status=status_,
        manager_id=manager_id,
        member_id=member_id,
        page=page,
        page_size=page_size,
    )
    return ProjectListResponse(
        items=[ProjectResponse.model_validate(p) for p in projects],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ProjectResponse:
    project = await project_service.create_project(db, actor=current_user, payload=payload)
    return ProjectResponse.model_validate(project)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ProjectResponse:
    project = await project_service.get_project(db, actor=current_user, project_id=project_id)
    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ProjectResponse:
    project = await project_service.update_project(
        db, actor=current_user, project_id=project_id, payload=payload
    )
    return ProjectResponse.model_validate(project)


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
async def list_members(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[ProjectMemberResponse]:
    members = await project_service.list_members(db, actor=current_user, project_id=project_id)
    return [ProjectMemberResponse.model_validate(m) for m in members]


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    project_id: uuid.UUID,
    payload: ProjectMemberAddRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ProjectMemberResponse:
    member = await project_service.add_member(
        db, actor=current_user, project_id=project_id, payload=payload
    )
    return ProjectMemberResponse.model_validate(member)


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    await project_service.remove_member(
        db, actor=current_user, project_id=project_id, user_id=user_id
    )
