import uuid

from pydantic import BaseModel, ConfigDict


class ManagerReassignRequest(BaseModel):
    manager_id: uuid.UUID | None = None


class HierarchyNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_code: str
    name: str
    role: str
    manager_id: uuid.UUID | None
