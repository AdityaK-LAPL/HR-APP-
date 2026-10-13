"""Unit tests for the client-address helper and the pooler-mode setting - no database required.
See app/core/client_ip.py and Settings.database_prepared_statements_disabled.
"""

import pytest
from starlette.requests import Request

from app.core import client_ip as client_ip_module
from app.core.config import Settings


def _request(headers: dict[str, str] | None = None, peer: str | None = "10.0.0.1") -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": (peer, 1234) if peer else None,
    }
    return Request(scope)


@pytest.fixture
def header_setting(monkeypatch):
    def _set(value: str) -> None:
        monkeypatch.setattr(
            client_ip_module,
            "get_settings",
            lambda: Settings(
                environment="test",
                database_url="postgresql+asyncpg://x@localhost/x",
                jwt_secret_key="k" * 40,
                client_ip_header=value,
            ),
        )

    return _set


def test_uses_the_connected_peer_when_no_header_is_configured(header_setting):
    header_setting("")
    request = _request({"X-Forwarded-For": "203.0.113.9"})
    assert client_ip_module.client_ip(request) == "10.0.0.1"


def test_uses_the_first_address_of_the_configured_header(header_setting):
    header_setting("x-forwarded-for")
    request = _request({"X-Forwarded-For": "203.0.113.9, 70.41.3.18"})
    assert client_ip_module.client_ip(request) == "203.0.113.9"


def test_normalises_ipv6_addresses(header_setting):
    header_setting("x-forwarded-for")
    request = _request({"X-Forwarded-For": "2001:0db8:0000:0000:0000:0000:0000:0001"})
    assert client_ip_module.client_ip(request) == "2001:db8::1"


@pytest.mark.parametrize("value", ["", "not-an-ip", "203.0.113.9:8080", "<script>"])
def test_a_missing_or_malformed_header_falls_back_to_the_peer(header_setting, value):
    header_setting("x-forwarded-for")
    request = _request({"X-Forwarded-For": value} if value else {})
    assert client_ip_module.client_ip(request) == "10.0.0.1"


def test_unknown_when_there_is_no_peer_and_no_header(header_setting):
    header_setting("")
    assert client_ip_module.client_ip(_request(peer=None)) is None


@pytest.mark.parametrize(
    ("url", "forced", "expected"),
    [
        ("postgresql+asyncpg://u:p@pool.example.com:5432/postgres?ssl=require", False, False),
        ("postgresql+asyncpg://u:p@pool.example.com:6543/postgres?ssl=require", False, True),
        ("postgresql+asyncpg://u:p@pool.example.com:5432/postgres?ssl=require", True, True),
        ("postgresql+asyncpg://u:p@localhost/company_app", False, False),
    ],
)
def test_transaction_pooler_turns_prepared_statements_off(url, forced, expected):
    settings = Settings(
        environment="test",
        database_url=url,
        jwt_secret_key="k" * 40,
        db_disable_prepared_statements=forced,
    )
    assert settings.database_prepared_statements_disabled is expected
