"""Owner-configured permission grants - see docs/api-contract.md section 3
and docs/permissions.md section 4."""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_owner
from app.db.session import get_db
from app.schemas.permission import (
    MyPermissionsResponse,
    PermissionDefinitionResponse,
    PermissionGrantCreateRequest,
    PermissionGrantResponse,
)
from app.schemas.principal import CurrentUser
from app.services import permission_grant_service

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("/me", response_model=MyPermissionsResponse)
async def my_permissions(
    db: AsyncSession = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)
) -> MyPermissionsResponse:
    """The caller's own role defaults and active grants (any logged-in user)."""
    return MyPermissionsResponse.model_validate(
        await permission_grant_service.my_permissions(db, actor=current_user)
    )


@router.get("/definitions", response_model=list[PermissionDefinitionResponse])
async def list_definitions(
    db: AsyncSession = Depends(get_db), current_user: CurrentUser = Depends(require_owner)
) -> list[PermissionDefinitionResponse]:
    definitions = await permission_grant_service.list_definitions(db)
    return [PermissionDefinitionResponse.model_validate(d) for d in definitions]


@router.get("/grants", response_model=list[PermissionGrantResponse])
async def list_grants(
    grantee_user_id: uuid.UUID | None = None,
    permission_key: str | None = None,
    scope_type: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_owner),
) -> list[PermissionGrantResponse]:
    grants = await permission_grant_service.list_grants(
        db,
        actor=current_user,
        grantee_user_id=grantee_user_id,
        permission_key=permission_key,
        scope_type=scope_type,
    )
    return [PermissionGrantResponse.model_validate(g) for g in grants]


@router.post("/grants", response_model=PermissionGrantResponse, status_code=status.HTTP_201_CREATED)
async def create_grant(
    payload: PermissionGrantCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_owner),
) -> PermissionGrantResponse:
    grant = await permission_grant_service.create_grant(db, actor=current_user, payload=payload)
    return PermissionGrantResponse.model_validate(grant)


@router.delete("/grants/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_grant(
    grant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_owner),
) -> None:
    await permission_grant_service.revoke_grant(db, actor=current_user, grant_id=grant_id)
