"""Refuses to start the test suite on a machine that is configured as production.

The fixtures TRUNCATE the business tables, so running them against the company's database would
erase its data. A production machine is recognised by an exported ENVIRONMENT or one in
backend/.env. This runs first, before tests/conftest.py defaults ENVIRONMENT to "test" (which
would hide it).
"""

import os
from pathlib import Path

import pytest


def _declared_environment() -> str:
    declared = os.environ.get("ENVIRONMENT")
    env_file = Path(__file__).resolve().parents[1] / ".env"
    if declared is None and env_file.exists():
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            if line.strip().startswith("ENVIRONMENT="):
                declared = line.split("=", 1)[1].strip().strip("\"'")
    return (declared or "").lower()


if _declared_environment() == "production":
    raise pytest.UsageError(
        "ENVIRONMENT is 'production': this test suite empties the database tables and must not "
        "run here. Use a separate development/test database."
    )
