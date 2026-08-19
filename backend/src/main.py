from __future__ import annotations

import asyncio
import logging
import secrets
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import BinaryIO

from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import settings
from .services import citation_service, history_service, translation_service
from .services.docling_service import (
    DEFAULT_OCR_LANG,
    DEFAULT_TABLE_MODE,
    convert_document_to_markdown,
    startup_state,
    warm_up_models,
)
from .services.job_service import (
    ConversionJob,
    ConversionJobManager,
    JobCapacityError,
    JobNotFoundError,
    ResultNotReadyError,
)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_TOKEN_HEADER = "X-DocuMark-Token"
SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".pptx",
    ".html",
    ".htm",
    ".png",
    ".jpg",
    ".jpeg",
    ".tif",
    ".tiff",
    ".bmp",
}
UPLOAD_CHUNK_SIZE = 1024 * 1024


class UploadTooLargeError(ValueError):
    pass


def _safe_original_filename(filename: str | None) -> tuple[str, str]:
    if not filename:
        raise HTTPException(status_code=400, detail="Không có tên file tải lên.")
    normalized = filename.replace("\\", "/")
    basename = normalized.rsplit("/", 1)[-1].strip()
    if not basename or len(basename) > 255:
        raise HTTPException(status_code=400, detail="Tên file không hợp lệ.")
    extension = Path(basename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Định dạng {extension or '(không có phần mở rộng)'} chưa được hỗ trợ.",
        )
    return basename, extension


def _copy_upload_with_limit(source: BinaryIO, destination: Path, max_bytes: int) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    try:
        with open(destination, "wb") as output:
            while True:
                chunk = source.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise UploadTooLargeError
                output.write(chunk)
        return total
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def _require_api_token(
    x_documark_token: str | None = Header(default=None, alias=API_TOKEN_HEADER),
) -> None:
    if not x_documark_token or not secrets.compare_digest(x_documark_token, settings.api_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên API không hợp lệ.")


job_manager = ConversionJobManager(
    converter=convert_document_to_markdown,
    output_dir=settings.output_dir,
    history_path=settings.history_path,
    max_history_entries=settings.max_history_entries,
    max_job_records=settings.max_job_records,
)


def _cleanup_stale_uploads() -> None:
    """Remove only direct, regular files left by a previous interrupted run."""
    for candidate in settings.upload_dir.iterdir():
        try:
            if candidate.is_file() and not candidate.is_symlink():
                candidate.unlink()
        except OSError as exc:
            logger.warning("Failed to remove stale upload %s: %s", candidate, exc)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.output_dir.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(_cleanup_stale_uploads)
    await job_manager.start()
    threading.Thread(target=warm_up_models, daemon=True).start()
    try:
        yield
    finally:
        await job_manager.stop()


app = FastAPI(
    title="DocuMark AI Local API",
    description="Local document-to-Markdown conversion API",
    version="1.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", API_TOKEN_HEADER],
)

secure_api = APIRouter(prefix="/api", dependencies=[Depends(_require_api_token)])


if not settings.frontend_dist_dir.is_dir():
    # Only registered when there's no built frontend to serve (API-only/dev
    # usage). If this were unconditional, it would permanently shadow the
    # StaticFiles mount below at the same "/" path — Starlette matches routes
    # in registration order, so the built app's index.html would never be
    # reachable at "/" even once `frontend_dist_dir` exists.
    @app.get("/")
    def read_root() -> dict[str, str]:
        return {"message": "DocuMark AI Local API"}


@app.get("/api/session")
def get_session(request: Request) -> dict[str, str]:
    """Bootstrap browser-dev sessions without exposing the token cross-origin."""
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in settings.trusted_origins:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin không được tin cậy.")
    return {"token": settings.api_token}


@secure_api.get("/health")
def health_check() -> dict[str, str]:
    return startup_state


async def _create_conversion_job(
    file: UploadFile,
    lang: str,
    table_mode: str,
    record_history: bool,
) -> ConversionJob:
    original_filename, extension = _safe_original_filename(file.filename)
    job_id = str(uuid.uuid4())
    upload_path = settings.upload_dir / f"{job_id}{extension}"
    try:
        await asyncio.to_thread(
            _copy_upload_with_limit,
            file.file,
            upload_path,
            settings.max_upload_bytes,
        )
    except UploadTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File vượt giới hạn {settings.max_upload_bytes // (1024 * 1024)} MiB.",
        ) from exc
    except OSError as exc:
        logger.exception("Failed to persist uploaded file")
        raise HTTPException(status_code=500, detail="Không thể lưu file tải lên.") from exc
    finally:
        await file.close()

    try:
        return await job_manager.submit(
            job_id=job_id,
            original_filename=original_filename,
            upload_path=upload_path,
            lang=lang,
            table_mode=table_mode,
            record_history=record_history,
        )
    except JobCapacityError as exc:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Hàng đợi đang đầy. Vui lòng chờ các tác vụ hiện tại hoàn tất.",
        ) from exc
    except Exception:
        upload_path.unlink(missing_ok=True)
        raise


@secure_api.post("/jobs", status_code=status.HTTP_202_ACCEPTED)
async def create_job(
    file: UploadFile = File(...),
    lang: str = Form(DEFAULT_OCR_LANG),
    table_mode: str = Form(DEFAULT_TABLE_MODE),
    record_history: bool = Form(True),
) -> dict[str, object]:
    job = await _create_conversion_job(file, lang, table_mode, record_history)
    return job.public_state()


def _get_job_or_404(job_id: uuid.UUID) -> ConversionJob:
    try:
        return job_manager.get(str(job_id))
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ.") from exc


@secure_api.get("/jobs/{job_id}")
async def get_job(job_id: uuid.UUID) -> dict[str, object]:
    return _get_job_or_404(job_id).public_state()


@secure_api.get("/jobs/{job_id}/result")
async def get_job_result(job_id: uuid.UUID) -> dict[str, object]:
    job = _get_job_or_404(job_id)
    try:
        markdown = job_manager.result(str(job_id))
    except ResultNotReadyError as exc:
        raise HTTPException(status_code=409, detail=f"Kết quả chưa sẵn sàng: {job.status}.") from exc
    return {
        "success": True,
        "job_id": job.job_id,
        "original_filename": job.original_filename,
        "markdown": markdown,
    }


@secure_api.delete("/jobs/{job_id}")
async def cancel_job(job_id: uuid.UUID) -> dict[str, object]:
    job = _get_job_or_404(job_id)
    return job_manager.cancel(job.job_id).public_state()


@secure_api.post("/convert")
async def convert_file(
    file: UploadFile = File(...),
    lang: str = Form(DEFAULT_OCR_LANG),
    table_mode: str = Form(DEFAULT_TABLE_MODE),
    record_history: bool = Form(True),
) -> JSONResponse:
    """Compatibility endpoint; new clients should use the observable job API."""
    job = await _create_conversion_job(file, lang, table_mode, record_history)
    await job.done.wait()
    if job.status == "cancelled":
        raise HTTPException(status_code=409, detail="Tác vụ đã bị hủy.")
    if job.status == "error":
        raise HTTPException(status_code=500, detail=job.error or "Chuyển đổi thất bại.")
    return JSONResponse(
        content={
            "success": True,
            "job_id": job.job_id,
            "original_filename": job.original_filename,
            "markdown": job.markdown or "",
        }
    )


@secure_api.get("/download/{job_id}")
async def download_file(job_id: uuid.UUID) -> FileResponse:
    job_id_text = str(job_id)
    file_path = settings.output_dir / f"{job_id_text}.md"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy file.")
    entry = await asyncio.to_thread(history_service.get_history_entry, settings.history_path, job_id_text)
    download_name = f"{job_id_text}.md"
    if entry:
        original = str(entry.get("original_filename", ""))
        download_name = f"{Path(original).stem or job_id_text}.md"
    return FileResponse(path=file_path, filename=download_name, media_type="text/markdown")


@secure_api.get("/history")
async def get_history() -> list[dict[str, object]]:
    return await asyncio.to_thread(history_service.list_history, settings.history_path)


@secure_api.get("/history/{job_id}")
async def get_history_item(job_id: uuid.UUID) -> JSONResponse:
    job_id_text = str(job_id)
    entry = await asyncio.to_thread(history_service.get_history_entry, settings.history_path, job_id_text)
    if entry is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục lịch sử.")
    md_path = settings.output_dir / f"{job_id_text}.md"
    if not md_path.is_file():
        raise HTTPException(status_code=410, detail="Kết quả của mục lịch sử không còn tồn tại.")
    markdown_content = await asyncio.to_thread(md_path.read_text, encoding="utf-8")
    return JSONResponse(content={**entry, "markdown": markdown_content})


@secure_api.delete("/history/{job_id}")
async def delete_history_item(job_id: uuid.UUID) -> dict[str, bool]:
    job_id_text = str(job_id)
    deleted = await asyncio.to_thread(
        history_service.delete_history_entry,
        settings.history_path,
        job_id_text,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục lịch sử.")
    try:
        (settings.output_dir / f"{job_id_text}.md").unlink(missing_ok=True)
    except OSError as exc:
        logger.warning("Failed to delete output for history item %s: %s", job_id_text, exc)
    return {"success": True}


class VerifyCitationRequest(BaseModel):
    text: str


@secure_api.post("/verify-citation")
async def verify_citation(payload: VerifyCitationRequest) -> dict[str, object]:
    """Check a selected passage against OpenAlex and, if configured, get an
    advisory-only local-LLM plausibility read. Requires internet access —
    the only endpoint in this API that does."""
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Không có nội dung để xác minh.")

    match = await citation_service.search_openalex(text)
    llm_assessment: str | None = None
    if settings.ollama_model:
        llm_assessment = await citation_service.assess_with_ollama(
            text,
            match,
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
        )
    result = citation_service.CitationVerificationResult(
        query_text=text,
        match=match,
        llm_assessment=llm_assessment,
        llm_available=llm_assessment is not None,
    )
    return result.public_state()


class TranslateRequest(BaseModel):
    text: str


@secure_api.post("/translate")
async def translate_text(payload: TranslateRequest) -> dict[str, object]:
    """Translates a selected passage from English to Vietnamese using a local
    NMT model. Unlike verify-citation, this never needs internet access once
    the model is loaded/bundled — consistent with the app's offline-first
    conversion flow."""
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Không có nội dung để dịch.")

    try:
        translated = await translation_service.translate_to_vietnamese(text)
    except Exception as exc:
        logger.exception("Translation failed")
        raise HTTPException(status_code=500, detail="Không thể dịch nội dung. Vui lòng thử lại.") from exc

    return {"original_text": text, "translated_text": translated}


app.include_router(secure_api)

if settings.frontend_dist_dir.is_dir():
    app.mount("/", StaticFiles(directory=settings.frontend_dist_dir, html=True), name="frontend")
