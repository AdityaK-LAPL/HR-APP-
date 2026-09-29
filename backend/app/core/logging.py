"""Application logging setup.

Provides structured, consistent logging across the app and a per-request
correlation id so a single request's log lines (and any resulting audit log
entry or error response) can be tied together.
"""

import contextvars
import logging
import sys
import uuid

request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get() or "-"
        return True


def configure_logging(log_level: str = "INFO") -> None:
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level.upper())

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    handler.addFilter(RequestIdFilter())

    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    # Quiet noisy third-party loggers unless we're debugging.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def new_request_id() -> str:
    return uuid.uuid4().hex


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
