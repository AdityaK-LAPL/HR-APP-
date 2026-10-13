"""In-memory sliding-window rate limiting for the unauthenticated auth
endpoints (login, refresh) - the classic brute-force targets, and the only
endpoints that have no session yet for the per-account lockout in
app/services/auth_service.py to key off. This is deliberately narrow, not
a blanket rate limiter on every route.

Single-process, in-memory: correct and sufficient for one backend
instance, but state is NOT shared across multiple instances/workers - a
multi-instance production deployment needs a shared store (Redis) instead.
Flagged as an open infrastructure question in docs/architecture.md section
11 (open question 6), still unresolved as of this phase.
"""

import time
from collections import defaultdict, deque

from fastapi import Request, status

from app.core.client_ip import client_ip
from app.core.config import get_settings
from app.core.errors import AppError


class RateLimitExceededError(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limit_exceeded"


class InMemoryRateLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    # Keys are client IPs, so without clean-up the table grows with every address ever seen.
    _SWEEP_AT = 4096

    def _sweep(self, now: float) -> None:
        stale = [
            key
            for key, hits in self._hits.items()
            if not hits or now - hits[-1] > self.window_seconds
        ]
        for key in stale:
            del self._hits[key]

    def check(self, key: str) -> None:
        now = time.monotonic()
        if len(self._hits) >= self._SWEEP_AT:
            self._sweep(now)
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        if len(hits) >= self.max_requests:
            raise RateLimitExceededError("Too many requests. Please try again later.")
        hits.append(now)


_login_limiter: InMemoryRateLimiter | None = None


def _get_login_limiter() -> InMemoryRateLimiter:
    global _login_limiter
    if _login_limiter is None:
        settings = get_settings()
        _login_limiter = InMemoryRateLimiter(
            max_requests=settings.login_rate_limit_max,
            window_seconds=settings.login_rate_limit_window_seconds,
        )
    return _login_limiter


def rate_limit_login(request: Request) -> None:
    """FastAPI dependency - raises RateLimitExceededError (429) once an IP
    exceeds the configured request rate against this endpoint."""

    limiter = _get_login_limiter()
    limiter.check(f"{request.scope['path']}:{client_ip(request) or 'unknown'}")


def reset_rate_limits() -> None:
    """Test-only: clears all in-memory rate-limit state. The limiter is a
    process-wide singleton, so without this, one test's login attempts
    would count against the next test's - see tests/conftest.py."""

    global _login_limiter
    _login_limiter = None
