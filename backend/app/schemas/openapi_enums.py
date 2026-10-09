"""Describe enum-valued fields in the generated OpenAPI document.

Request fields are validated by `field_validator`s and the database by CHECK constraints, but
the schemas declare them as plain `str`, so OpenAPI (and any client generated from it) saw no
allowed values. This adds the `enum` keyword after the schema is built - documentation only,
no change to validation or runtime behaviour. The values come from the same constants the
validators and CHECK constraints use, so they cannot drift; `tests/test_openapi_enums.py`
fails if a listed field disappears or an enum no longer matches docs/api-contract.md.
"""

from typing import Any

from app.models.attachment import ATTACHABLE_ENTITY_TYPES
from app.models.attendance import ATTENDANCE_EVENT_TYPES, ATTENDANCE_STATUSES
from app.models.leave import LEAVE_STATUSES
from app.models.machine import MACHINE_STATUSES
from app.models.project import PROJECT_STATUSES
from app.models.service import (
    CONTACT_METHODS,
    SERVICE_CALL_STATUSES,
    SERVICE_TYPES,
    VISIT_TYPES,
)
from app.models.task import TASK_PRIORITIES, TASK_STATUSES
from app.schemas.permission import VALID_EFFECTS, VALID_SCOPE_TYPES
from app.schemas.service import PRIORITIES as SERVICE_PRIORITIES
from app.schemas.user import VALID_ROLES

PERMISSION_APPLIES_TO = ("manager", "employee", "any")
CALENDAR_ENTRY_TYPES = ("task", "leave")

# values -> [(schema name, property), ...]
ENUM_FIELDS: tuple[tuple[tuple[str, ...], tuple[tuple[str, str], ...]], ...] = (
    (TASK_STATUSES, (("TaskResponse", "status"), ("TaskUpdateRequest", "status"))),
    (
        TASK_PRIORITIES,
        (
            ("TaskCreateRequest", "priority"),
            ("TaskUpdateRequest", "priority"),
            ("TaskResponse", "priority"),
        ),
    ),
    (
        PROJECT_STATUSES,
        (
            ("ProjectCreateRequest", "status"),
            ("ProjectUpdateRequest", "status"),
            ("ProjectResponse", "status"),
        ),
    ),
    (LEAVE_STATUSES, (("LeaveResponse", "status"),)),
    (
        VALID_ROLES,
        (
            ("UserCreateRequest", "role"),
            ("UserUpdateRequest", "role"),
            ("UserResponse", "role"),
            ("UserProfile", "role"),
            ("UserDirectoryEntry", "role"),
            ("HierarchyNode", "role"),
            ("MyPermissionsResponse", "role"),
        ),
    ),
    (ATTENDANCE_STATUSES, (("AttendanceDayResponse", "status"),)),
    (ATTENDANCE_EVENT_TYPES, (("AttendanceEventResponse", "event_type"),)),
    (MACHINE_STATUSES, (("MachineResponse", "status"), ("MachineUpdateRequest", "status"))),
    (
        CONTACT_METHODS,
        (("ServiceCallCreateRequest", "contact_method"), ("ServiceCallResponse", "contact_method")),
    ),
    (
        SERVICE_TYPES,
        (
            ("ServiceCallCreateRequest", "service_type"),
            ("ServiceCallResponse", "service_type"),
            ("ServiceReportResponse", "service_type"),
        ),
    ),
    (
        SERVICE_PRIORITIES,
        (
            ("ServiceCallCreateRequest", "priority"),
            ("ServiceCallUpdateRequest", "priority"),
            ("ServiceCallResponse", "priority"),
        ),
    ),
    (
        SERVICE_CALL_STATUSES,
        (("ServiceCallUpdateRequest", "status"), ("ServiceCallResponse", "status")),
    ),
    (
        VISIT_TYPES,
        (("ServiceVisitCreateRequest", "visit_type"), ("ServiceVisitResponse", "visit_type")),
    ),
    (
        ATTACHABLE_ENTITY_TYPES,
        (
            ("AttachmentResponse", "entity_type"),
            ("AttachmentWithUrlResponse", "entity_type"),
            ("Body_upload_attachment_api_v1_attachments_post", "entity_type"),
        ),
    ),
    (
        VALID_SCOPE_TYPES,
        (
            ("PermissionGrantCreateRequest", "scope_type"),
            ("PermissionGrantResponse", "scope_type"),
            ("MyGrant", "scope_type"),
        ),
    ),
    (
        VALID_EFFECTS,
        (
            ("PermissionGrantCreateRequest", "effect"),
            ("PermissionGrantResponse", "effect"),
            ("MyGrant", "effect"),
        ),
    ),
    (PERMISSION_APPLIES_TO, (("PermissionDefinitionResponse", "applies_to_role"),)),
    (CALENDAR_ENTRY_TYPES, (("CalendarEntry", "entry_type"),)),
)


def add_enums(openapi_schema: dict[str, Any]) -> dict[str, Any]:
    schemas = openapi_schema.get("components", {}).get("schemas", {})
    for values, fields in ENUM_FIELDS:
        for schema_name, prop in fields:
            node = schemas.get(schema_name, {}).get("properties", {}).get(prop)
            if node is None:
                continue
            # Optional fields are `anyOf: [{type: string}, {type: null}]`.
            targets = [b for b in node.get("anyOf", []) if b.get("type") == "string"] or [node]
            for target in targets:
                target["enum"] = list(values)
    return openapi_schema
