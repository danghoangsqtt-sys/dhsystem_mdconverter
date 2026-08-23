from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import secrets
import threading
import uuid
import zipfile
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
from starlette.background import BackgroundTask

from .config import settings
from .logging_utils import CorrelationIdMiddleware, configure_logging
from .services import citation_service, history_service, translation_service
from .services import pdf_to_word_service
from .services import markdown_to_word_service
from .services import ocr_export_service
from .services.image_ocr_service import DEFAULT_IMAGE_OCR_ENGINE, SUPPORTED_IMAGE_OCR_ENGINES
from .services.ocr_job_service import (
    OcrInput,
    OcrJobManager,
    OcrJobNotFoundError,
    OcrResultNotReadyError,
)
from .services.resource_scheduler import heavy_job_slot
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


configure_logging(settings.log_dir, level=settings.log_level)
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
CONTENT_SNIFF_BYTES = 512
# Signature bytes for formats detectable by file header alone.
_MAGIC_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    ".pdf": (b"%PDF-",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".tif": (b"II*\x00", b"MM\x00*"),
    ".tiff": (b"II*\x00", b"MM\x00*"),
    ".bmp": (b"BM",),
}
# docx/pptx share the OOXML zip container, so a header check alone can't tell
# them apart from each other (or from a plain zip) - the required member path
# below distinguishes the actual document type inside the archive.
_OOXML_REQUIRED_MEMBER: dict[str, str] = {
    ".docx": "word/document.xml",
    ".pptx": "ppt/presentation.xml",
}
_TEXT_EXTENSIONS = {".html", ".htm"}


class UploadTooLargeError(ValueError):
    pass


class UploadContentMismatchError(ValueError):
    pass


def _validate_uploaded_content(path: Path, extension: str) -> None:
    """Confirm the file's actual bytes match its claimed extension.

    `_safe_original_filename` only checks the filename string, which a
    mislabeled or malicious upload can trivially spoof; this inspects the
    bytes actually written to disk before they reach Docling.
    """
    signatures = _MAGIC_SIGNATURES.get(extension)
    if signatures is not None:
        with open(path, "rb") as handle:
            header = handle.read(CONTENT_SNIFF_BYTES)
        if not any(header.startswith(sig) for sig in signatures):
            raise UploadContentMismatchError(extension)
        return

    required_member = _OOXML_REQUIRED_MEMBER.get(extension)
    if required_member is not None:
        try:
            with zipfile.ZipFile(path) as archive:
                if required_member not in archive.namelist():
                    raise UploadContentMismatchError(extension)
        except zipfile.BadZipFile as exc:
            raise UploadContentMismatchError(extension) from exc
        return

    if extension in _TEXT_EXTENSIONS:
        with open(path, "rb") as handle:
            header = handle.read(CONTENT_SNIFF_BYTES)
        if b"\x00" in header:
            raise UploadContentMismatchError(extension)
        return


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
    original_dir=settings.original_dir,
    history_path=settings.history_path,
    max_history_entries=settings.max_history_entries,
    max_job_records=settings.max_job_records,
)
ocr_job_manager = OcrJobManager(max_records=100)
OCR_EXTENSIONS = {".png", ".jpg", ".jpeg"}
MAX_OCR_BATCH = 50
MAX_EDITABLE_DOCX_CHARACTERS = 10_000_000
def _convert_pdf_to_word_serialized(pdf_path: Path, output_path: Path) -> pdf_to_word_service.PdfToWordResult:
    """Avoid multiple large raster exports competing for memory at once."""
    with heavy_job_slot("pdf-to-word"):
        return pdf_to_word_service.convert_pdf_to_docx(pdf_path, output_path)


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


def _original_path(job_id: str, original_filename: str) -> Path:
    return settings.original_dir / f"{job_id}{Path(original_filename).suffix.lower()}"


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

secure_api = APIRouter(prefix="/api", dependencies=[Depends(_require_api_token)])


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
        await asyncio.to_thread(_validate_uploaded_content, upload_path, extension)
    except UploadContentMismatchError as exc:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Nội dung file không khớp với định dạng {extension}.",
        ) from exc

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


@secure_api.post("/export/markdown-to-word")
async def export_markdown_to_word(
    markdown: str = Form(...),
    original_filename: str = Form("tai-lieu.pdf"),
) -> FileResponse:
    """Export reviewed Docling Markdown as native, editable Word content.

    PDF uploads already pass through Docling before reaching the editor.  This
    endpoint consumes that structured/reviewed Markdown, avoiding a duplicate
    ML conversion and making the resulting paragraphs and tables editable.
    """
    if not markdown.strip():
        raise HTTPException(status_code=400, detail="Nội dung tài liệu trống.")
    if len(markdown) > MAX_EDITABLE_DOCX_CHARACTERS:
        raise HTTPException(status_code=413, detail="Nội dung quá lớn để xuất DOCX.")
    safe_filename = Path(original_filename).name[:255] or "tai-lieu.pdf"
    output_path = settings.output_dir / f"editable-{uuid.uuid4()}.docx"
    try:
        await asyncio.to_thread(
            markdown_to_word_service.convert_markdown_to_docx,
            markdown,
            output_path,
            document_title=Path(safe_filename).stem,
        )
    except markdown_to_word_service.MarkdownToWordError as exc:
        output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        output_path.unlink(missing_ok=True)
        logger.exception("Editable Word export failed")
        raise HTTPException(status_code=500, detail="Không thể tạo DOCX chỉnh sửa được.") from exc

    download_name = f"{Path(safe_filename).stem or 'tai-lieu'}-chinh-sua.docx"
    return FileResponse(
        path=output_path,
        filename=download_name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        background=BackgroundTask(output_path.unlink, missing_ok=True),
    )


@secure_api.post("/export/pdf-to-word-faithful")
async def export_pdf_to_word_faithful(file: UploadFile = File(...)) -> FileResponse:
    """Create a visually faithful DOCX by placing every PDF page losslessly.

    This deliberately preserves appearance rather than editability: arbitrary
    PDF content cannot be reconstructed as native Word objects without layout
    changes, while a full-page raster retains text, formulae, diagrams, and
    images exactly as rendered by the PDF engine.
    """
    original_filename, extension = _safe_original_filename(file.filename)
    if extension != ".pdf":
        await file.close()
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Tính năng xuất Word giữ nguyên bố cục chỉ nhận file PDF.",
        )

    export_id = str(uuid.uuid4())
    upload_path = settings.upload_dir / f"{export_id}.pdf"
    output_path = settings.output_dir / f"{export_id}.docx"
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
        logger.exception("Failed to persist PDF for Word export")
        raise HTTPException(status_code=500, detail="Không thể lưu PDF để tạo file Word.") from exc
    finally:
        await file.close()

    try:
        await asyncio.to_thread(_validate_uploaded_content, upload_path, extension)
        result = await asyncio.to_thread(_convert_pdf_to_word_serialized, upload_path, output_path)
    except UploadContentMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Nội dung file không phải là PDF hợp lệ.",
        ) from exc
    except pdf_to_word_service.PdfToWordConversionError as exc:
        logger.exception("PDF-to-Word export failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        upload_path.unlink(missing_ok=True)

    download_name = f"{Path(original_filename).stem or 'tai-lieu'}-giong-pdf.docx"
    return FileResponse(
        path=result.output_path,
        filename=download_name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"X-DocuMark-Page-Count": str(result.page_count)},
        background=BackgroundTask(result.output_path.unlink, missing_ok=True),
    )


async def _persist_ocr_uploads(files: list[UploadFile]) -> list[OcrInput]:
    if not files:
        raise HTTPException(status_code=400, detail="Chưa chọn ảnh OCR.")
    if len(files) > MAX_OCR_BATCH:
        raise HTTPException(status_code=413, detail=f"Mỗi lượt chỉ nhận tối đa {MAX_OCR_BATCH} ảnh.")
    inputs: list[OcrInput] = []
    try:
        for upload in files:
            original_filename, extension = _safe_original_filename(upload.filename)
            if extension not in OCR_EXTENSIONS:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail="Tini OCR hiện nhận ảnh JPG và PNG.",
                )
            upload_path = settings.upload_dir / f"ocr-{uuid.uuid4()}{extension}"
            try:
                await asyncio.to_thread(
                    _copy_upload_with_limit,
                    upload.file,
                    upload_path,
                    settings.max_upload_bytes,
                )
                await asyncio.to_thread(_validate_uploaded_content, upload_path, extension)
            except UploadTooLargeError as exc:
                upload_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Ảnh vượt giới hạn {settings.max_upload_bytes // (1024 * 1024)} MiB.",
                ) from exc
            except UploadContentMismatchError as exc:
                upload_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail=f"Nội dung ảnh không khớp định dạng {extension}.",
                ) from exc
            inputs.append(OcrInput(filename=original_filename, path=upload_path))
        return inputs
    except Exception:
        for item in inputs:
            item.path.unlink(missing_ok=True)
        raise
    finally:
        await asyncio.gather(*(upload.close() for upload in files), return_exceptions=True)


@secure_api.post("/ocr/jobs", status_code=status.HTTP_202_ACCEPTED)
async def create_ocr_job(
    files: list[UploadFile] = File(...),
    preset: str = Form("balanced"),
    engine: str = Form(DEFAULT_IMAGE_OCR_ENGINE),
) -> dict[str, object]:
    if preset not in {"original", "balanced", "high_contrast"}:
        raise HTTPException(status_code=400, detail="Preset xử lý ảnh không hợp lệ.")
    if engine not in SUPPORTED_IMAGE_OCR_ENGINES:
        raise HTTPException(status_code=400, detail="Engine OCR không hợp lệ.")
    inputs = await _persist_ocr_uploads(files)
    return ocr_job_manager.create(inputs, preset=preset, engine=engine).public_state()


def _get_ocr_job_or_404(job_id: uuid.UUID):
    try:
        return ocr_job_manager.get(str(job_id))
    except OcrJobNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ OCR.") from exc


@secure_api.get("/ocr/jobs/{job_id}")
async def get_ocr_job(job_id: uuid.UUID) -> dict[str, object]:
    return _get_ocr_job_or_404(job_id).public_state()


@secure_api.get("/ocr/jobs/{job_id}/result")
async def get_ocr_job_result(job_id: uuid.UUID) -> dict[str, object]:
    _get_ocr_job_or_404(job_id)
    try:
        return ocr_job_manager.result(str(job_id))
    except OcrResultNotReadyError as exc:
        raise HTTPException(status_code=409, detail="Kết quả OCR chưa sẵn sàng.") from exc


@secure_api.delete("/ocr/jobs/{job_id}")
async def cancel_ocr_job(job_id: uuid.UUID) -> dict[str, object]:
    _get_ocr_job_or_404(job_id)
    return ocr_job_manager.cancel(str(job_id)).public_state()


def _parse_reviewed_pages(raw: str) -> list[dict[str, object]]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Nội dung review OCR không hợp lệ.") from exc
    if not isinstance(parsed, list) or not parsed or len(parsed) > MAX_OCR_BATCH:
        raise HTTPException(status_code=400, detail="Danh sách trang OCR không hợp lệ.")
    pages: list[dict[str, object]] = []
    total_characters = 0
    for index, item in enumerate(parsed):
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Trang OCR không hợp lệ.")
        text = item.get("text", "")
        filename = item.get("filename", f"Trang {index + 1}")
        if not isinstance(text, str) or not isinstance(filename, str):
            raise HTTPException(status_code=400, detail="Text OCR không hợp lệ.")
        total_characters += len(text)
        pages.append({"filename": Path(filename).name[:255], "text": text})
    if total_characters > 5_000_000:
        raise HTTPException(status_code=413, detail="Nội dung OCR quá lớn để xuất.")
    return pages


@secure_api.post("/ocr/export")
async def export_ocr_result(
    reviewed_pages: str = Form(...),
    export_format: str = Form(...),
    files: list[UploadFile] = File(...),
) -> FileResponse:
    pages = _parse_reviewed_pages(reviewed_pages)
    if export_format not in ocr_export_service.SUPPORTED_OCR_EXPORTS:
        raise HTTPException(status_code=400, detail="Định dạng xuất OCR không hợp lệ.")
    if len(files) != len(pages):
        raise HTTPException(status_code=400, detail="Số ảnh không khớp số trang OCR.")
    inputs = await _persist_ocr_uploads(files)
    suffix = ".docx" if export_format.startswith("docx") else ".md" if export_format == "markdown" else ".txt"
    output_path = settings.output_dir / f"ocr-export-{uuid.uuid4()}{suffix}"
    try:
        await asyncio.to_thread(
            ocr_export_service.build_ocr_export,
            export_format,
            pages,
            output_path,
            [item.path for item in inputs],
        )
    except ValueError as exc:
        output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        output_path.unlink(missing_ok=True)
        logger.exception("OCR export failed")
        raise HTTPException(status_code=500, detail="Không thể xuất kết quả OCR.") from exc
    finally:
        for item in inputs:
            item.path.unlink(missing_ok=True)
    media_type = (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if suffix == ".docx"
        else "text/markdown" if suffix == ".md" else "text/plain"
    )
    return FileResponse(
        output_path,
        filename=f"tini-ocr{suffix}",
        media_type=media_type,
        background=BackgroundTask(output_path.unlink, missing_ok=True),
    )


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


@secure_api.get("/history/{job_id}/original")
async def get_history_original(job_id: uuid.UUID) -> FileResponse:
    job_id_text = str(job_id)
    entry = await asyncio.to_thread(
        history_service.get_history_entry,
        settings.history_path,
        job_id_text,
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục lịch sử.")
    original_filename = str(entry.get("original_filename", ""))
    file_path = _original_path(job_id_text, original_filename)
    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Bản cũ chưa lưu tài liệu gốc; vui lòng chọn lại file từ máy.",
        )
    media_type = mimetypes.guess_type(original_filename)[0] or "application/octet-stream"
    return FileResponse(path=file_path, filename=original_filename, media_type=media_type)


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
    for candidate in settings.original_dir.iterdir():
        if candidate.is_file() and not candidate.is_symlink() and candidate.stem == job_id_text:
            try:
                candidate.unlink()
            except OSError as exc:
                logger.warning("Failed to delete original for history item %s: %s", job_id_text, exc)
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
    ollama_result = citation_service.OllamaAssessmentResult(text=None, status="not_configured")
    if settings.ollama_model:
        ollama_result = await citation_service.assess_with_ollama(
            text,
            match,
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
        )
    result = citation_service.CitationVerificationResult(
        query_text=text,
        match=match,
        llm_assessment=ollama_result.text,
        llm_available=ollama_result.status == "available",
        llm_status=ollama_result.status,
        llm_model=settings.ollama_model,
    )
    return result.public_state()


class TranslateRequest(BaseModel):
    text: str
    direction: str = translation_service.DIRECTION_EN_VI
    domain: str | None = None


@secure_api.post("/translate")
async def translate_text(payload: TranslateRequest) -> dict[str, object]:
    """Translates a selected passage between English and Vietnamese using a
    local NMT model. Unlike verify-citation, this never needs internet
    access once the model is loaded/bundled — consistent with the app's
    offline-first conversion flow.

    `domain`, if recognized, forces domain-specific terminology (see
    `translation_glossaries.py`) instead of leaving it to the model's
    generic rendering; an unrecognized/omitted domain just skips that step.
    """
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Không có nội dung để dịch.")

    try:
        translated = await translation_service.translate_text(
            text,
            direction=payload.direction,
            domain=payload.domain,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Chiều dịch không hợp lệ.") from exc
    except Exception as exc:
        logger.exception("Translation failed")
        raise HTTPException(status_code=500, detail="Không thể dịch nội dung. Vui lòng thử lại.") from exc

    return {
        "original_text": text,
        "translated_text": translated,
        "direction": payload.direction,
        "domain": payload.domain,
    }


app.include_router(secure_api)

if settings.frontend_dist_dir.is_dir():
    app.mount("/", StaticFiles(directory=settings.frontend_dist_dir, html=True), name="frontend")
