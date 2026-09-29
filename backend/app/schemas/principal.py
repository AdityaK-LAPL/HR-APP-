"""The authenticated caller, as resolved by app/api/deps.py.

Never constructed from client-supplied data - always the result of
validating a session against the database. Passed into every service-layer
authorization check instead of trusting a role/user id the frontend claims.
"""

import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    employee_code: str
    name: str
    role: str
