"""User management endpoints - see docs/api-contract.md section 2."""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_owner
from app.db.session import get_db
from app.schemas.auth import ResetPasswordRequest
from app.schemas.principal import CurrentUser
from app.schemas.user import UserCreateRequest, UserListResponse, UserResponse, UserUpdateRequest
from app.services import auth_service, user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=UserListResponse)
async def list_users(
    manager_id: uuid.UUID | None = None,
    role: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> UserListResponse:
    users, total = await user_service.list_users(
        db,
        actor=current_user,
        manager_id=manager_id,
        role=role,
        is_active=is_active,
        search=search,
        page=page,
        page_size=page_size,
    )
    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_owner),
) -> UserResponse:
    user = await user_service.create_user(db, actor=current_user, payload=payload)
    return UserResponse.model_validate(user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> UserResponse:
    user = await user_service.get_user(db, actor=current_user, user_id=user_id)
    return UserResponse.model_validate(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> UserResponse:
    user = await user_service.update_user(db, actor=current_user, user_id=user_id, payload=payload)
    return UserResponse.model_validate(user)


@router.get("/{user_id}/subordinates", response_model=list[UserResponse])
async def get_subordinates(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[UserResponse]:
    users = await user_service.get_subordinates(db, actor=current_user, user_id=user_id)
    return [UserResponse.model_validate(u) for u in users]


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    user_id: uuid.UUID,
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    await auth_service.admin_reset_password(
        db,
        actor=current_user,
        target_user_id=user_id,
        temporary_password=payload.temporary_password,
    )
