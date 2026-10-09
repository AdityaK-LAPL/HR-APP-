"""Authentication endpoints - see docs/api-contract.md section 1."""

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.cookies import REFRESH_TOKEN_COOKIE, clear_auth_cookies, set_auth_cookies
from app.core.errors import AuthenticationError
from app.core.rate_limit import rate_limit_login
from app.db.session import get_db
from app.models.identity import User, UserCredentials
from app.schemas.auth import ChangePasswordRequest, LoginRequest, UserProfile
from app.schemas.errors import ErrorResponse
from app.schemas.principal import CurrentUser
from app.services import auth_service
from app.services.user_service import get_user


async def _profile(db: AsyncSession, user: User) -> UserProfile:
    must_reset = (
        await db.execute(
            select(UserCredentials.must_reset).where(UserCredentials.user_id == user.id)
        )
    ).scalar_one_or_none()
    return UserProfile.model_validate(user).model_copy(update={"must_reset": bool(must_reset)})


router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post(
    "/login",
    response_model=UserProfile,
    dependencies=[Depends(rate_limit_login)],
    responses={429: {"model": ErrorResponse, "description": "Too many attempts from this IP"}},
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    result = await auth_service.authenticate(
        db,
        employee_code=payload.employee_code,
        password=payload.password,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    set_auth_cookies(
        response,
        access_token=result.access_token,
        refresh_token=result.refresh_token,
        csrf_token=result.csrf_token,
    )
    return await _profile(db, result.user)


@router.post(
    "/refresh",
    response_model=UserProfile,
    dependencies=[Depends(rate_limit_login)],
    responses={429: {"model": ErrorResponse, "description": "Too many attempts from this IP"}},
)
async def refresh(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> UserProfile:
    raw_refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if not raw_refresh_token:
        raise AuthenticationError("No active session to refresh.")

    result = await auth_service.refresh_session(
        db,
        raw_refresh_token=raw_refresh_token,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    set_auth_cookies(
        response,
        access_token=result.access_token,
        refresh_token=result.refresh_token,
        csrf_token=result.csrf_token,
    )
    return await _profile(db, result.user)


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    raw_refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    await auth_service.logout(db, raw_refresh_token=raw_refresh_token, current_user=current_user)
    clear_auth_cookies(response)


@router.get("/me", response_model=UserProfile)
async def me(
    db: AsyncSession = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)
) -> UserProfile:
    user = await get_user(db, actor=current_user, user_id=current_user.id)
    profile = UserProfile.model_validate(user)
    return profile.model_copy(update={"must_reset": current_user.must_reset})


@router.post("/change-password", status_code=204)
async def change_password(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    await auth_service.change_password(
        db,
        current_user=current_user,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
