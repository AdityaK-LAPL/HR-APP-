"""Auth cookie names and set/clear helpers.

Access/refresh tokens are httpOnly so client-side JS can never read them
(XSS mitigation). The CSRF token is deliberately NOT httpOnly - the
frontend must read it and echo it back as the X-CSRF-Token header on
mutating requests (the stateless double-submit pattern implemented in
app/api/deps.py), which only works if JS can read the cookie.
"""

from fastapi import Response

from app.core.config import get_settings

ACCESS_TOKEN_COOKIE = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"
CSRF_TOKEN_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"
REFRESH_TOKEN_PATH = "/api/v1/auth"


def set_auth_cookies(
    response: Response, *, access_token: str, refresh_token: str, csrf_token: str
) -> None:
    settings = get_settings()
    secure = settings.is_production

    response.set_cookie(
        ACCESS_TOKEN_COOKIE,
        access_token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        REFRESH_TOKEN_COOKIE,
        refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path=REFRESH_TOKEN_PATH,
    )
    response.set_cookie(
        CSRF_TOKEN_COOKIE,
        csrf_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    response.delete_cookie(REFRESH_TOKEN_COOKIE, path=REFRESH_TOKEN_PATH)
    response.delete_cookie(CSRF_TOKEN_COOKIE, path="/")
