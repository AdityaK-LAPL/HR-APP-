"""Aggregates all v1 endpoint routers under a single APIRouter.

New feature modules (auth, users, tasks, ...) register themselves here as
they are implemented phase by phase - this file is the one place that needs
a one-line addition when a new router is added.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    attachments,
    attendance,
    audit_logs,
    auth,
    calendar,
    customers,
    eod,
    health,
    hierarchy,
    leaves,
    machines,
    notifications,
    permissions,
    projects,
    reports,
    service_calls,
    tasks,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(hierarchy.router)
api_router.include_router(permissions.router)
api_router.include_router(tasks.router)
api_router.include_router(projects.router)
api_router.include_router(leaves.router)
api_router.include_router(eod.router)
api_router.include_router(attendance.router)
api_router.include_router(calendar.router)
api_router.include_router(customers.router)
api_router.include_router(machines.router)
api_router.include_router(service_calls.router)
api_router.include_router(attachments.router)
api_router.include_router(audit_logs.router)
api_router.include_router(notifications.router)
api_router.include_router(reports.router)
