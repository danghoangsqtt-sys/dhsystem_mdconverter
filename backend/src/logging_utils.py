"""Local log rotation and per-request correlation IDs.

Every log line written while handling a request carries the same short ID,
so a user reporting a problem can hand back that ID (echoed as the
`X-Request-ID` response header) and it greps straight to the matching lines
in the rotated `backend.log` file - instead of guessing from timestamps.
"""

from __future__ import annotations

import contextvars
import logging
import logging.handlers
import time
import uuid
from pathlib import Path

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_REQUEST_ID: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

LOG_FORMAT = "%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s"
LOG_FILE_NAME = "backend.log"
MAX_LOG_FILE_BYTES = 5 * 1024 * 1024
BACKUP_COUNT = 5

logger = logging.getLogger(__name__)


def get_request_id() -> str:
    return _REQUEST_ID.get()


class RequestIdFilter(logging.Filter):
    """Stamps the active request's correlation ID onto every log record.

    Attached to handlers, not loggers: a `Filter` on an ancestor logger is
    skipped during propagation (only the record's originating logger and
    each individual handler run their own filters), so per-handler is the
    only placement that stamps records from every module.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _REQUEST_ID.get()
        return True


def configure_logging(log_dir: Path, level: int = logging.INFO) -> None:
    """Wire up console + rotating file handlers on the root logger.

    Idempotent: clears handlers this function previously installed instead
    of stacking duplicates, so re-invoking it (tests, `--reload`) is safe.
    """
    root = logging.getLogger()
    root.setLevel(level)
    for existing in list(root.handlers):
        # removeHandler() only detaches it - close() is needed too, or a
        # RotatingFileHandler from a previous call leaks its open file.
        existing.close()
        root.removeHandler(existing)

    formatter = logging.Formatter(LOG_FORMAT)
    request_filter = RequestIdFilter()

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.addFilter(request_filter)
    root.addHandler(console_handler)

    log_dir.mkdir(parents=True, exist_ok=True)
    file_handler = logging.handlers.RotatingFileHandler(
        log_dir / LOG_FILE_NAME,
        maxBytes=MAX_LOG_FILE_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.addFilter(request_filter)
    root.addHandler(file_handler)


class CorrelationIdMiddleware:
    """Assigns each HTTP request a short correlation ID.

    Plain ASGI (not `BaseHTTPMiddleware`) so the contextvar is set directly
    around the inner app call, with no extra task hop to worry about.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Truncated to 12 hex chars: this is a single-user local app, so
        # full UUID collision-resistance is unnecessary and a shorter ID is
        # easier for a user to read back from a diagnostics screen or log.
        request_id = uuid.uuid4().hex[:12]
        token = _REQUEST_ID.set(request_id)
        status_code_seen: list[int] = []

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_code_seen.append(message["status"])
                headers = MutableHeaders(scope=message)
                headers.append("X-Request-ID", request_id)
            await send(message)

        started = time.monotonic()
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = (time.monotonic() - started) * 1000
            status_code = status_code_seen[0] if status_code_seen else "-"
            logger.info(
                "%s %s %s %.1fms",
                scope["method"],
                scope["path"],
                status_code,
                duration_ms,
            )
            _REQUEST_ID.reset(token)
