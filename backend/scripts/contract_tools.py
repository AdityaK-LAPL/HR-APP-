"""Keep docs/openapi.json and the generated operation reference in docs/api-contract.md
in sync with the running code. Run from `backend/`:

    python -m scripts.contract_tools           # rewrite both
    python -m scripts.contract_tools --check   # exit 1 if either is out of date (CI-friendly)

The hand-written parts of api-contract.md (permission semantics, rules) are never touched;
only the block between the BEGIN/END GENERATED markers is replaced.
"""

import json
import re
import sys
from pathlib import Path

from fastapi.routing import APIRoute

from app.main import app

DOCS = Path(__file__).resolve().parents[2] / "docs"
BEGIN = "<!-- BEGIN GENERATED OPERATION REFERENCE (python -m scripts.contract_tools) -->"
END = "<!-- END GENERATED OPERATION REFERENCE -->"


def _auth(route: APIRoute) -> str:
    names = []
    for dep in route.dependant.dependencies:
        name = dep.call.__name__
        if name == "_dependency" and dep.call.__closure__:  # app.api.deps.require_role(...)
            roles: list[str] = []
            for cell in dep.call.__closure__:
                if isinstance(cell.cell_contents, tuple):
                    roles += [str(r) for r in cell.cell_contents]
            return "Owner" if roles == ["owner"] else "Manager or Owner"
        names.append(name)
    if "company_reports_user" in names:
        return "Owner, or a manager holding `download_company_reports`"
    if "get_current_user" in names:
        return "Session"
    if route.path.endswith("/auth/refresh"):
        return "Refresh cookie"
    return "None"


def _schema_name(schema: dict | None) -> str:
    if not schema:
        return "-"
    if "$ref" in schema:
        return schema["$ref"].rsplit("/", 1)[-1]
    if schema.get("type") == "array":
        return f"{_schema_name(schema.get('items'))}[]"
    return schema.get("type", "-")


def build_reference(spec: dict) -> str:
    schemas = spec["components"]["schemas"]
    routes = {
        (m, r.path): r
        for r in app.routes
        if isinstance(r, APIRoute)
        for m in r.methods - {"HEAD", "OPTIONS"}
    }
    lines = [
        "| Method & path | OK | Auth (route-level) | Query params | Request body (* = required) "
        "| Response |",
        "|---|---|---|---|---|---|",
    ]
    for path, item in spec["paths"].items():
        for method, op in item.items():
            route = routes[(method.upper(), path)]
            ok = next(c for c in op["responses"] if c.startswith("2"))
            params = [
                p["name"] + ("*" if p.get("required") else "")
                for p in op.get("parameters", [])
                if p["in"] == "query"
            ]
            body = "-"
            for ctype, req in op.get("requestBody", {}).get("content", {}).items():
                s = schemas[req["schema"]["$ref"].rsplit("/", 1)[-1]]
                needed = set(s.get("required", []))
                fields = ", ".join(
                    f + ("*" if f in needed else "") for f in s.get("properties", {})
                )
                body = fields if ctype == "application/json" else f"({ctype}) {fields}"
            content = op["responses"][ok].get("content", {})
            json_schema = content.get("application/json", {}).get("schema")
            resp = _schema_name(json_schema)
            if ok == "204":
                resp = "(empty)"
            elif path.endswith("/download"):
                resp = "(file stream; Content-Type is the stored file's)"
            short = path.removeprefix("/api/v1")
            query = ", ".join(params) or "-"
            auth = _auth(route)
            name = f"`{method.upper()} {short}`"
            lines.append(f"| {name} | {ok} | {auth} | {query} | {body} | {resp} |")
    return "\n".join(lines)


def main() -> int:
    spec = app.openapi()
    openapi_text = json.dumps(spec, indent=2) + "\n"
    contract_path = DOCS / "api-contract.md"
    contract = contract_path.read_text(encoding="utf-8")
    block = f"{BEGIN}\n\n{build_reference(spec)}\n\n{END}"
    if BEGIN in contract:
        new_contract = re.sub(
            re.escape(BEGIN) + r".*?" + re.escape(END), lambda _: block, contract, flags=re.S
        )
    else:
        new_contract = contract.rstrip() + "\n\n" + block + "\n"

    openapi_path = DOCS / "openapi.json"
    stale = (
        not openapi_path.exists()
        or json.loads(openapi_path.read_text()) != spec
        or new_contract != contract
    )
    if "--check" in sys.argv:
        print("docs are up to date" if not stale else "docs are OUT OF DATE - run without --check")
        return 1 if stale else 0
    openapi_path.write_text(openapi_text, encoding="utf-8")
    contract_path.write_text(new_contract, encoding="utf-8")
    print(f"wrote {openapi_path.name} ({len(spec['paths'])} paths) and the operation reference")
    return 0


if __name__ == "__main__":
    sys.exit(main())
