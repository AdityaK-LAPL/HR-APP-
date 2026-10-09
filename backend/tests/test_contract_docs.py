"""Drift guard: docs/openapi.json and the generated operation reference in
docs/api-contract.md must match the running app. Fix with `python -m scripts.contract_tools`."""

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def test_openapi_and_operation_reference_are_current():
    result = subprocess.run(
        [sys.executable, "-m", "scripts.contract_tools", "--check"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
