from __future__ import annotations

import asyncio
import logging
import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from ...config import settings
from ...uploads import (
    UploadContentMismatchError,
    UploadTooLargeError,
    _copy_upload_with_limit,
    _safe_original_filename,
    _validate_uploaded_content,
)
from . import citation_service, history_service, markdown_to_word_service, translation_service
from .docling_service import (
    DEFAULT_OCR_LANG,
    DEFAULT_TABLE_MODE,
    convert_document_to_markdown,
    startup_state,
)
from .job_service import (
    ConversionJob,
    ConversionJobManager,
    JobCapacityError,
    JobNotFoundError,
    ResultNotReadyError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

job_manager = ConversionJobManager(
    converter=convert_document_to_markdown,
    output_dir=settings.output_dir,
    original_dir=settings.original_dir,
    history_path=settings.history_path,
    max_history_entries=settings.max_history_entries,
    max_job_records=settings.max_job_records,
)
MAX_EDITABLE_DOCX_CHARACTERS = 10_000_000


def _original_path(job_id: str, original_filename: str) -> Path:
    return settings.original_dir / f"{job_id}{Path(original_filename).suffix.lower()}"


@router.get("/health")
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


@router.post("/jobs", status_code=status.HTTP_202_ACCEPTED)
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


@router.get("/jobs/{job_id}")
async def get_job(job_id: uuid.UUID) -> dict[str, object]:
    return _get_job_or_404(job_id).public_state()


@router.get("/jobs/{job_id}/result")
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


@router.delete("/jobs/{job_id}")
async def cancel_job(job_id: uuid.UUID) -> dict[str, object]:
    job = _get_job_or_404(job_id)
    return job_manager.cancel(job.job_id).public_state()


@router.post("/convert")
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


@router.get("/download/{job_id}")
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


@router.post("/export/markdown-to-word")
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


@router.get("/history")
async def get_history() -> list[dict[str, object]]:
    return await asyncio.to_thread(history_service.list_history, settings.history_path)


@router.get("/history/{job_id}")
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


@router.get("/history/{job_id}/original")
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


@router.delete("/history/{job_id}")
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


@router.post("/verify-citation")
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


@router.post("/translate")
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
