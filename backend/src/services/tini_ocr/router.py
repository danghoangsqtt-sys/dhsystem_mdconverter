from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from ...config import settings
from ...uploads import (
    UploadContentMismatchError,
    UploadTooLargeError,
    _copy_upload_with_limit,
    _safe_original_filename,
    _validate_uploaded_content,
)
from . import ocr_export_service
from .image_ocr_service import DEFAULT_IMAGE_OCR_ENGINE, SUPPORTED_IMAGE_OCR_ENGINES, DEFAULT_OCR_LANG
from ..shared.easyocr_reader import OCR_LANG_PRESETS
from .ocr_job_service import (
    OcrInput,
    OcrJobCapacityError,
    OcrJobManager,
    OcrJobNotFoundError,
    OcrResultNotReadyError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

MAX_ACTIVE_OCR_JOBS = 20
ocr_job_manager = OcrJobManager(max_records=100, max_active_jobs=MAX_ACTIVE_OCR_JOBS)
OCR_EXTENSIONS = {".png", ".jpg", ".jpeg"}
MAX_OCR_BATCH = 50


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


@router.post("/ocr/jobs", status_code=status.HTTP_202_ACCEPTED)
async def create_ocr_job(
    files: list[UploadFile] = File(...),
    preset: str = Form("balanced"),
    engine: str = Form(DEFAULT_IMAGE_OCR_ENGINE),
    language: str = Form(DEFAULT_OCR_LANG),
) -> dict[str, object]:
    if preset not in {"original", "balanced", "high_contrast"}:
        raise HTTPException(status_code=400, detail="Preset xử lý ảnh không hợp lệ.")
    if engine not in SUPPORTED_IMAGE_OCR_ENGINES:
        raise HTTPException(status_code=400, detail="Engine OCR không hợp lệ.")
    if language not in OCR_LANG_PRESETS:
        raise HTTPException(status_code=400, detail="Ngôn ngữ OCR không hợp lệ.")
    inputs = await _persist_ocr_uploads(files)
    try:
        return ocr_job_manager.create(inputs, preset=preset, engine=engine, language=language).public_state()
    except OcrJobCapacityError as exc:
        for item in inputs:
            item.path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Hàng đợi OCR đang đầy. Vui lòng chờ các tác vụ hiện tại hoàn tất.",
        ) from exc


def _get_ocr_job_or_404(job_id: uuid.UUID):
    try:
        return ocr_job_manager.get(str(job_id))
    except OcrJobNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ OCR.") from exc


@router.get("/ocr/jobs/{job_id}")
async def get_ocr_job(job_id: uuid.UUID) -> dict[str, object]:
    return _get_ocr_job_or_404(job_id).public_state()


@router.get("/ocr/jobs/{job_id}/result")
async def get_ocr_job_result(job_id: uuid.UUID) -> dict[str, object]:
    _get_ocr_job_or_404(job_id)
    try:
        return ocr_job_manager.result(str(job_id))
    except OcrResultNotReadyError as exc:
        raise HTTPException(status_code=409, detail="Kết quả OCR chưa sẵn sàng.") from exc


@router.delete("/ocr/jobs/{job_id}")
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


@router.post("/ocr/export")
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
