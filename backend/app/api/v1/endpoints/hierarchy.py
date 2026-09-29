"""Manager hierarchy endpoints - see docs/api-contract.md section 3."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_owner
from app.db.session import get_db
from app.schemas.hierarchy import HierarchyNode, ManagerReassignRequest
from app.schemas.principal import CurrentUser
from app.services import hierarchy_service

router = APIRouter(prefix="/hierarchy", tags=["hierarchy"])


@router.get("", response_model=list[HierarchyNode])
async def get_hierarchy(
    root_user_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[HierarchyNode]:
    users = await hierarchy_service.get_hierarchy(db, actor=current_user, root_user_id=root_user_id)
    return [HierarchyNode.model_validate(u) for u in users]


@router.patch("/{user_id}/manager", response_model=HierarchyNode)
async def reassign_manager(
    user_id: uuid.UUID,
    payload: ManagerReassignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_owner),
) -> HierarchyNode:
    user = await hierarchy_service.reassign_manager(
        db, actor=current_user, user_id=user_id, new_manager_id=payload.manager_id
    )
    return HierarchyNode.model_validate(user)
