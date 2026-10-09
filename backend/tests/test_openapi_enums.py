"""The OpenAPI document describes enum-valued fields, and they match api-contract.md section 20."""

import re
from pathlib import Path

from app.main import app
from app.schemas.openapi_enums import ENUM_FIELDS

CONTRACT = Path(__file__).resolve().parents[2] / "docs" / "api-contract.md"

# contract row -> a schema property that must carry exactly those values
CONTRACT_FIELDS = {
    "tasks.status": ("TaskResponse", "status"),
    "tasks.priority": ("TaskResponse", "priority"),
    "projects.status": ("ProjectResponse", "status"),
    "leave_requests.status": ("LeaveResponse", "status"),
    "users.role": ("UserResponse", "role"),
    "attendance_events.event_type": ("AttendanceEventResponse", "event_type"),
    "attendance_days.status": ("AttendanceDayResponse", "status"),
    "machines.status": ("MachineResponse", "status"),
    "service_calls.contact_method": ("ServiceCallResponse", "contact_method"),
    "service_calls.priority": ("ServiceCallResponse", "priority"),
    "service_calls.service_type": ("ServiceCallResponse", "service_type"),
    "service_calls.status": ("ServiceCallResponse", "status"),
    "service_visits.visit_type": ("ServiceVisitResponse", "visit_type"),
    "attachments.entity_type": ("AttachmentResponse", "entity_type"),
    "permission_grants.scope_type": ("PermissionGrantResponse", "scope_type"),
    "permission_grants.effect": ("PermissionGrantResponse", "effect"),
    "permission_definitions.applies_to_role": ("PermissionDefinitionResponse", "applies_to_role"),
}


def _contract_values() -> dict[str, list[str]]:
    section = CONTRACT.read_text(encoding="utf-8").split("## 20. Enums Reference")[1]
    rows = re.findall(r"^\| `([\w.]+)` \| (.+?) \|$", section, re.M)
    return {field: re.findall(r"`(\w+)`", values) for field, values in rows}


def test_every_listed_enum_field_exists_and_is_described():
    schemas = app.openapi()["components"]["schemas"]
    for values, fields in ENUM_FIELDS:
        for schema_name, prop in fields:
            assert schema_name in schemas, f"{schema_name} no longer exists - update ENUM_FIELDS"
            node = schemas[schema_name]["properties"].get(prop)
            assert node is not None, f"{schema_name}.{prop} no longer exists - update ENUM_FIELDS"
            branches = [b for b in node.get("anyOf", []) if b.get("type") == "string"] or [node]
            assert all(b.get("enum") == list(values) for b in branches), f"{schema_name}.{prop}"


def test_openapi_enums_match_the_contract_reference():
    schemas = app.openapi()["components"]["schemas"]
    contract = _contract_values()
    for contract_field, (schema_name, prop) in CONTRACT_FIELDS.items():
        assert (
            contract_field in contract
        ), f"{contract_field} missing from api-contract.md section 20"
        assert (
            schemas[schema_name]["properties"][prop]["enum"] == contract[contract_field]
        ), contract_field


def test_enum_annotation_does_not_change_validation():
    # Documentation only: an unlisted value must still be rejected by the existing validators,
    # not silently accepted because the schema now says "enum".
    from app.schemas.task import TaskCreateRequest

    try:
        TaskCreateRequest(
            title="x", assigned_to="00000000-0000-0000-0000-000000000001", priority="bogus"
        )
    except ValueError:
        return
    raise AssertionError("invalid priority was accepted")
