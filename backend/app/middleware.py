"""Cross-cutting HTTP middleware: request correlation id and access logging.

Kept separate from business/auth middleware so the request id is available
for every log line and error response from the very first line of request
handling, regardless of what happens later in the stack.
"""

import logging
import re
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import get_settings
from app.core.logging import new_request_id, request_id_var

logger = logging.getLogger("app.request")

# A caller-supplied correlation id is only trusted when it looks like one: it is echoed in a
# response header and written to every log line, so anything else (very long values, control or
# markup characters) is replaced by a fresh id instead of being copied.
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

_API_PREFIX = "/api/"


def _security_headers(path: str) -> dict[str, str]:
    """Headers for every API response. The API only ever returns JSON or a file download, so the
    policy is the strictest one: nothing may be framed, sniffed, cached or executed."""
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
    }
    if path.startswith(_API_PREFIX):
        headers["Cache-Control"] = "no-store"
        headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if get_settings().is_production:
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        supplied = request.headers.get("X-Request-ID", "")
        request_id = supplied if _SAFE_REQUEST_ID.fullmatch(supplied) else new_request_id()
        token = request_id_var.set(request_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
            duration_ms = (time.perf_counter() - start) * 1000
            response.headers["X-Request-ID"] = request_id
            for name, value in _security_headers(request.scope["path"]).items():
                response.headers.setdefault(name, value)
            logger.info(
                "%s %s -> %s (%.1fms)",
                request.method,
                request.scope["path"],
                response.status_code,
                duration_ms,
            )
            return response
        finally:
            request_id_var.reset(token)
