"""Error-response contract tests (database-free): wire format and OpenAPI agree."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def anon():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_validation_error_has_field_details_and_never_echoes_input(anon):
    response = await anon.post(
        "/api/v1/auth/login", json={"employee_code": "OWN001", "password": 12345, "extra": "x"}
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_failed"
    assert {
        "field": "password",
        "message": "Input should be a valid string",
        "type": "string_type",
    } in error["details"]
    assert "12345" not in response.text


async def test_missing_field_is_reported_by_name(anon):
    response = await anon.post("/api/v1/auth/login", json={"employee_code": "OWN001"})
    fields = {d["field"]: d["type"] for d in response.json()["error"]["details"]}
    assert fields == {"password": "missing"}


async def test_authentication_error_shape_has_no_details(anon):
    response = await anon.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "authentication_failed", "message": "Not authenticated."}
    }


def test_openapi_declares_the_real_error_shape_not_fastapis_default():
    schema = app.openapi()
    assert "HTTPValidationError" not in schema["components"]["schemas"]
    for name in ("ErrorResponse", "ErrorBody", "FieldError"):
        assert name in schema["components"]["schemas"]
    ref = schema["paths"]["/api/v1/tasks"]["post"]["responses"]["422"]["content"][
        "application/json"
    ]
    assert ref["schema"]["$ref"].endswith("/ErrorResponse")
    assert "429" in schema["paths"]["/api/v1/auth/login"]["post"]["responses"]
