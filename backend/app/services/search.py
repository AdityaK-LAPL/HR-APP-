"""Safe text matching for list filters."""

_ESCAPE = "\\"


def like_pattern(text: str) -> str:
    """`%text%` with LIKE wildcards in `text` escaped, so a literal `%` or `_` typed by a
    user matches itself instead of everything. Use with `.ilike(pattern, escape=ESCAPE)`."""
    escaped = (
        text.replace(_ESCAPE, _ESCAPE * 2).replace("%", _ESCAPE + "%").replace("_", _ESCAPE + "_")
    )
    return f"%{escaped}%"


ESCAPE = _ESCAPE
