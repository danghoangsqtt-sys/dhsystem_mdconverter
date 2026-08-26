"""Observable batch jobs for the Tini OCR product."""

from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .image_ocr_service import recognize_image


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class OcrInput:
    filename: str
    path: Path


@dataclass
class OcrJob:
    job_id: str
    inputs: list[OcrInput]
    preset: str
    engine: str
    language: str
    status: str = "queued"
    progress: int = 0
    message: str = "Đang chờ xử lý ảnh."
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)
    pages: list[dict[str, object]] = field(default_factory=list)
    error: str | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event, repr=False)

    def public_state(self) -> dict[str, object]:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "page_count": len(self.inputs),
            "completed_pages": len(self.pages),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "error": self.error,
        }


class OcrJobNotFoundError(KeyError):
    pass


class OcrResultNotReadyError(RuntimeError):
    pass


class OcrJobCapacityError(RuntimeError):
    pass


_TERMINAL_STATUSES = {"complete", "cancelled", "error"}


class OcrJobManager:
    def __init__(self, max_records: int = 100, *, max_active_jobs: int = 20) -> None:
        self._jobs: dict[str, OcrJob] = {}
        self._lock = threading.RLock()
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tini-ocr")
        self._max_records = max_records
        self._max_active_jobs = max_active_jobs

    def create(self, inputs: list[OcrInput], *, preset: str, engine: str, language: str) -> OcrJob:
        job = OcrJob(str(uuid.uuid4()), inputs, preset, engine, language)
        with self._lock:
            active = sum(1 for existing in self._jobs.values() if existing.status not in _TERMINAL_STATUSES)
            if active >= self._max_active_jobs:
                raise OcrJobCapacityError(
                    f"{active} Tini OCR jobs already in progress (limit {self._max_active_jobs})"
                )
            self._jobs[job.job_id] = job
            self._trim_completed_records()
        self._executor.submit(self._run, job)
        return job

    def get(self, job_id: str) -> OcrJob:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise OcrJobNotFoundError(job_id)
            return job

    def result(self, job_id: str) -> dict[str, object]:
        job = self.get(job_id)
        if job.status != "complete":
            raise OcrResultNotReadyError(job_id)
        return {
            "job_id": job.job_id,
            "engine": job.engine,
            "preset": job.preset,
            "language": job.language,
            "pages": list(job.pages),
        }

    def cancel(self, job_id: str) -> OcrJob:
        job = self.get(job_id)
        if job.status in _TERMINAL_STATUSES:
            return job
        job.cancel_event.set()
        self._update(job, status="cancelling", message="Đang dừng sau ảnh hiện tại.")
        return job

    def _run(self, job: OcrJob) -> None:
        self._update(job, status="recognizing", message="Đang nhận dạng ảnh 1.")
        try:
            total = len(job.inputs)
            for index, item in enumerate(job.inputs):
                if job.cancel_event.is_set():
                    self._update(job, status="cancelled", message="Đã hủy nhận dạng.")
                    return
                try:
                    page = recognize_image(
                        item.path,
                        filename=item.filename,
                        index=index,
                        preset=job.preset,
                        engine=job.engine,
                        lang=job.language,
                    )
                except Exception as exc:  # one bad page must not hide other results
                    page = {
                        "index": index,
                        "filename": item.filename,
                        "width": 0,
                        "height": 0,
                        "engine": job.engine,
                        "recipe": [],
                        "confidence": 0.0,
                        "lines": [],
                        "text": "",
                        "error": str(exc),
                    }
                with self._lock:
                    job.pages.append(page)
                progress = round(((index + 1) / total) * 100)
                self._update(
                    job,
                    progress=progress,
                    message=f"Đã xử lý {index + 1}/{total} ảnh.",
                )
            if job.cancel_event.is_set():
                self._update(job, status="cancelled", message="Đã hủy nhận dạng.")
                return
            failures = sum(1 for page in job.pages if page.get("error"))
            message = "Nhận dạng hoàn tất."
            if failures:
                message = f"Hoàn tất với {failures}/{total} ảnh bị lỗi."
            self._update(job, status="complete", progress=100, message=message)
        except Exception as exc:
            self._update(job, status="error", error=str(exc), message="Nhận dạng thất bại.")
        finally:
            for item in job.inputs:
                item.path.unlink(missing_ok=True)

    def _update(self, job: OcrJob, **changes: object) -> None:
        with self._lock:
            for name, value in changes.items():
                setattr(job, name, value)
            job.updated_at = _now()

    def _trim_completed_records(self) -> None:
        if len(self._jobs) <= self._max_records:
            return
        terminal = [
            job for job in self._jobs.values() if job.status in _TERMINAL_STATUSES
        ]
        terminal.sort(key=lambda item: item.updated_at)
        for job in terminal[: max(0, len(self._jobs) - self._max_records)]:
            self._jobs.pop(job.job_id, None)
