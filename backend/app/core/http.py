"""Small helpers for building HTTP responses."""

import re
from urllib.parse import quote


def content_disposition(filename: str) -> str:
    """`attachment` with an ASCII fallback plus the real name in RFC 5987 form.

    A filename may come from a person (an uploaded file's name, an employee's name in a report), and
    a header value must be Latin-1 and free of quotes and control characters, so the fallback is
    ASCII-only and the exact name travels percent-encoded in `filename*`.
    """
    last_segment = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    fallback = re.sub(r"[^A-Za-z0-9._ -]", "_", last_segment)[:100] or "download"
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"
