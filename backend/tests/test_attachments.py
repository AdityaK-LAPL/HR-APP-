"""Attachment endpoint tests - see docs/api-contract.md section 15.

Uses the local filesystem storage backend (no Supabase credentials are
configured anywhere in this test run - see app/services/storage.py), so
upload/download/delete are exercised for real, not mocked. Still
`requires_db` since attachment metadata and the entities attachments are
validated against both live in Postgres.

NOT YET EXECUTED in this environment (no reachable Postgres) - see
docs/development-status.md.
"""

import io

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db

PNG_MAGIC = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
PDF_MAGIC = b"%PDF-1.4\n" + b"\x00" * 32


async def test_manager_can_attach_file_to_own_task(client, db_session):
    owner = await make_user(db_session, employee_code="OWN800", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP800", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN800", password="InitialPass123!")

    task_resp = await client.post(
        "/api/v1/tasks",
        json={"title": "Install unit", "assigned_to": str(employee.id)},
        headers=headers,
    )
    task_id = task_resp.json()["id"]

    files = {"file": ("photo.png", io.BytesIO(PNG_MAGIC), "image/png")}
    data = {"entity_type": "task", "entity_id": task_id}
    response = await client.post("/api/v1/attachments", data=data, files=files, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["original_filename"] == "photo.png"
    assert body["download_url"]


async def test_unrelated_employee_cannot_attach_file_to_task(client, db_session):
    owner = await make_user(db_session, employee_code="OWN801", name="Owner", role="owner")
    employee_a = await make_user(
        db_session, employee_code="EMP801", name="A", role="employee", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="EMP802", name="B", role="employee", manager_id=owner.id
    )

    owner_headers = await login(client, employee_code="OWN801", password="InitialPass123!")
    task_resp = await client.post(
        "/api/v1/tasks",
        json={"title": "A's task", "assigned_to": str(employee_a.id)},
        headers=owner_headers,
    )
    task_id = task_resp.json()["id"]

    b_headers = await login(client, employee_code="EMP802", password="InitialPass123!")
    files = {"file": ("photo.png", io.BytesIO(PNG_MAGIC), "image/png")}
    data = {"entity_type": "task", "entity_id": task_id}
    response = await client.post("/api/v1/attachments", data=data, files=files, headers=b_headers)
    # RLS hides rows outside the caller's scope, so the API answers 404 (existence is not revealed).
    assert response.status_code == 404


async def test_disallowed_extension_rejected(client, db_session):
    owner = await make_user(db_session, employee_code="OWN802", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP803", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN802", password="InitialPass123!")
    task_resp = await client.post(
        "/api/v1/tasks",
        json={"title": "Task", "assigned_to": str(employee.id)},
        headers=headers,
    )
    task_id = task_resp.json()["id"]

    files = {"file": ("script.exe", io.BytesIO(b"MZ" + b"\x00" * 32), "application/octet-stream")}
    data = {"entity_type": "task", "entity_id": task_id}
    response = await client.post("/api/v1/attachments", data=data, files=files, headers=headers)
    assert response.status_code == 422


async def test_content_extension_mismatch_rejected(client, db_session):
    owner = await make_user(db_session, employee_code="OWN803", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP804", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN803", password="InitialPass123!")
    task_resp = await client.post(
        "/api/v1/tasks",
        json={"title": "Task", "assigned_to": str(employee.id)},
        headers=headers,
    )
    task_id = task_resp.json()["id"]

    # PNG magic bytes but claims to be a .pdf
    files = {"file": ("fake.pdf", io.BytesIO(PNG_MAGIC), "application/pdf")}
    data = {"entity_type": "task", "entity_id": task_id}
    response = await client.post("/api/v1/attachments", data=data, files=files, headers=headers)
    assert response.status_code == 422


async def test_upload_download_and_delete_roundtrip(client, db_session):
    owner = await make_user(db_session, employee_code="OWN804", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP805", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN804", password="InitialPass123!")
    task_resp = await client.post(
        "/api/v1/tasks",
        json={"title": "Task", "assigned_to": str(employee.id)},
        headers=headers,
    )
    task_id = task_resp.json()["id"]

    files = {"file": ("report.pdf", io.BytesIO(PDF_MAGIC), "application/pdf")}
    data = {"entity_type": "task", "entity_id": task_id}
    upload_resp = await client.post("/api/v1/attachments", data=data, files=files, headers=headers)
    attachment_id = upload_resp.json()["id"]

    download_resp = await client.get(
        f"/api/v1/attachments/{attachment_id}/download", headers=headers
    )
    assert download_resp.status_code == 200
    assert download_resp.content == PDF_MAGIC

    delete_resp = await client.delete(f"/api/v1/attachments/{attachment_id}", headers=headers)
    assert delete_resp.status_code == 204

    get_after_delete = await client.get(f"/api/v1/attachments/{attachment_id}", headers=headers)
    assert get_after_delete.status_code == 404


async def test_list_attachments_for_an_entity(client, db_session):
    owner = await make_user(db_session, employee_code="OWN806", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP806", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN806", password="InitialPass123!")
    task_resp = await client.post(
        "/api/v1/tasks",
        json={"title": "Task", "assigned_to": str(employee.id)},
        headers=headers,
    )
    task_id = task_resp.json()["id"]

    for filename, content in (("a.pdf", PDF_MAGIC), ("b.png", PNG_MAGIC)):
        files = {"file": (filename, io.BytesIO(content), "application/octet-stream")}
        data = {"entity_type": "task", "entity_id": task_id}
        await client.post("/api/v1/attachments", data=data, files=files, headers=headers)

    response = await client.get(
        "/api/v1/attachments", params={"entity_type": "task", "entity_id": task_id}, headers=headers
    )
    assert response.status_code == 200
    filenames = {item["original_filename"] for item in response.json()["items"]}
    assert filenames == {"a.pdf", "b.png"}


async def test_only_scoped_manager_can_attach_to_customer(client, db_session):
    owner = await make_user(db_session, employee_code="OWN805", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR800", name="Manager A", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="MGR801", name="Manager B", role="manager", manager_id=owner.id
    )

    a_headers = await login(client, employee_code="MGR800", password="InitialPass123!")
    customer_resp = await client.post(
        "/api/v1/customers",
        json={"customer_code": "CUST800", "name": "Attach Co"},
        headers=a_headers,
    )
    customer_id = customer_resp.json()["id"]

    files = {"file": ("brochure.pdf", io.BytesIO(PDF_MAGIC), "application/pdf")}
    data = {"entity_type": "customer", "entity_id": customer_id}

    b_headers = await login(client, employee_code="MGR801", password="InitialPass123!")
    b_response = await client.post("/api/v1/attachments", data=data, files=files, headers=b_headers)
    assert b_response.status_code == 403

    # Logging in as B replaced A's session on this client - log back in.
    a_headers = await login(client, employee_code="MGR800", password="InitialPass123!")
    files = {"file": ("brochure.pdf", io.BytesIO(PDF_MAGIC), "application/pdf")}
    a_response = await client.post("/api/v1/attachments", data=data, files=files, headers=a_headers)
    assert a_response.status_code == 201
