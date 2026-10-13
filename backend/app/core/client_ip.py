"""The client's IP address as the application should see it (rate limit, audit trail, sessions)."""

import ipaddress

from fastapi import Request

from app.core.config import get_settings


def client_ip(request: Request) -> str | None:
    """The address of the caller, or None when unknown.

    Behind a platform that reports the real address in a header (CLIENT_IP_HEADER, e.g.
    X-Forwarded-For on Vercel) that header's first entry is used; anything that is not a valid IP
    address falls back to the connected peer, because the value also lands in an INET column.
    """
    header = get_settings().client_ip_header
    if header:
        first = request.headers.get(header, "").split(",")[0].strip()
        try:
            return str(ipaddress.ip_address(first))
        except ValueError:
            pass
    return request.client.host if request.client else None
