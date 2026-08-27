from __future__ import annotations

import asyncio
import logging
import secrets
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .logging_utils import CorrelationIdMiddleware, configure_logging
from .services.mark_tini import history_service
from .services.mark_tini.docling_service import warm_up_models
from .services.mark_tini.job_service import JobCapacityError  # noqa: F401 - re-exported for tests
from .services.mark_tini.router import job_manager, router as mark_tini_router


configure_logging(settings.log_dir, level=settings.log_level)
logger = logging.getLogger(__name__)

API_TOKEN_HEADER = "X-DocuMark-Token"


def _require_api_token(
    x_documark_token: str | None = Header(default=None, alias=API_TOKEN_HEADER),
) -> None:
    if not x_documark_token or not secrets.compare_digest(x_documark_token, settings.api_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên API không hợp lệ.")


def _cleanup_stale_uploads() -> None:
    """Remove only direct, regular files left by a previous interrupted run."""
    for candidate in settings.upload_dir.iterdir():
        try:
            if candidate.is_file() and not candidate.is_symlink():
                candidate.unlink()
        except OSError as exc:
            logger.warning("Failed to remove stale upload %s: %s", candidate, exc)


def _cleanup_orphaned_outputs() -> None:
    """Remove output Markdown left by a run that crashed between writing the
    file and recording its history entry (or mid atomic-write, as a leftover
    `*.tmp-*` file - see `_atomic_write_text`). Every output file reachable
    through the API has a matching history entry (append_history writes both
    together, and delete_history_item/eviction remove both together); a
    startup gap between the two is the only way one can exist without the
    other, and it would otherwise sit on disk forever with no way for a user
    to ever see or remove it.
    """
    known_ids = {
        str(entry.get("job_id")) for entry in history_service.list_history(settings.history_path)
    }
    for candidate in settings.output_dir.iterdir():
        try:
            if not candidate.is_file() or candidate.is_symlink():
                continue
            if candidate.stem not in known_ids:
                candidate.unlink()
        except OSError as exc:
            logger.warning("Failed to remove orphaned output %s: %s", candidate, exc)


def _cleanup_orphaned_originals() -> None:
    """Remove persisted source copies that no longer have a history entry."""
    known_ids = {
        str(entry.get("job_id")) for entry in history_service.list_history(settings.history_path)
    }
    for candidate in settings.original_dir.iterdir():
        try:
            if not candidate.is_file() or candidate.is_symlink():
                continue
            if candidate.stem not in known_ids:
                candidate.unlink()
        except OSError as exc:
            logger.warning("Failed to remove orphaned original %s: %s", candidate, exc)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.output_dir.mkdir(parents=True, exist_ok=True)
    settings.original_dir.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(_cleanup_stale_uploads)
    await asyncio.to_thread(_cleanup_orphaned_outputs)
    await asyncio.to_thread(_cleanup_orphaned_originals)
    await job_manager.start()
    threading.Thread(target=warm_up_models, daemon=True).start()
    try:
        yield
    finally:
        await job_manager.stop()


app = FastAPI(
    title="Mark Tini Local API",
    description="Local document-to-Markdown conversion API",
    version="1.6.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", API_TOKEN_HEADER],
)
# Added after CORSMiddleware so it ends up wrapping CORS (Starlette's
# add_middleware stacks newest-outermost) - every request, including
# CORS-rejected ones, still gets a correlation ID and a logged summary line.
app.add_middleware(CorrelationIdMiddleware)


if not settings.frontend_dist_dir.is_dir():
    # Only registered when there's no built frontend to serve (API-only/dev
    # usage). If this were unconditional, it would permanently shadow the
    # StaticFiles mount below at the same "/" path — Starlette matches routes
    # in registration order, so the built app's index.html would never be
    # reachable at "/" even once `frontend_dist_dir` exists.
    @app.get("/")
    def read_root() -> dict[str, str]:
        return {"message": "Mark Tini Local API"}


@app.get("/api/session")
def get_session(request: Request) -> dict[str, str]:
    """Bootstrap browser-dev sessions without exposing the token cross-origin."""
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in settings.trusted_origins:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin không được tin cậy.")
    return {"token": settings.api_token}


app.include_router(mark_tini_router, dependencies=[Depends(_require_api_token)])

if settings.frontend_dist_dir.is_dir():
    app.mount("/", StaticFiles(directory=settings.frontend_dist_dir, html=True), name="frontend")
