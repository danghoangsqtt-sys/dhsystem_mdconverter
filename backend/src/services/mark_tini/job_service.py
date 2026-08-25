"""Single-worker conversion queue and observable job lifecycle."""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Literal

from . import history_service


logger = logging.getLogger(__name__)

JobStatus = Literal[
    "queued",
    "converting",
    "finalizing",
    "complete",
    "cancelling",
    "cancelled",
    "error",
]

STATUS_PROGRESS: dict[JobStatus, int] = {
    "queued": 10,
    "converting": 35,
    "finalizing": 90,
    "complete": 100,
    "cancelling": 95,
    "cancelled": 100,
    "error": 100,
}

STATUS_MESSAGES: dict[JobStatus, str] = {
    "queued": "Đang chờ lượt xử lý...",
    "converting": "Docling đang phân tích tài liệu...",
    "finalizing": "Đang kiểm tra và lưu Markdown...",
    "complete": "Chuyển đổi hoàn tất.",
    "cancelling": "Đã yêu cầu hủy; đang chờ tác vụ hiện tại kết thúc an toàn...",
    "cancelled": "Đã hủy chuyển đổi.",
    "error": "Chuyển đổi thất bại.",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp-{os.getpid()}-{threading.get_ident()}")
    try:
        with open(temp_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


def _atomic_copy_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destination.with_suffix(
        f"{destination.suffix}.tmp-{os.getpid()}-{threading.get_ident()}"
    )
    try:
        with open(source, "rb") as input_handle, open(temp_path, "wb") as output_handle:
            shutil.copyfileobj(input_handle, output_handle, length=1024 * 1024)
            output_handle.flush()
            os.fsync(output_handle.fileno())
        os.replace(temp_path, destination)
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


@dataclass
class ConversionJob:
    job_id: str
    original_filename: str
    upload_path: Path
    lang: str
    table_mode: str
    record_history: bool
    status: JobStatus = "queued"
    progress: int = 10
    message: str = STATUS_MESSAGES["queued"]
    created_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)
    markdown: str | None = None
    error: str | None = None
    cancel_requested: bool = False
    done: asyncio.Event = field(default_factory=asyncio.Event, repr=False)

    def set_status(self, status: JobStatus, *, error: str | None = None) -> None:
        self.status = status
        self.progress = STATUS_PROGRESS[status]
        self.message = STATUS_MESSAGES[status]
        self.error = error
        self.updated_at = _utc_now()

    def public_state(self) -> dict[str, object]:
        return {
            "job_id": self.job_id,
            "original_filename": self.original_filename,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "error": self.error,
        }


class JobNotFoundError(KeyError):
    pass


class ResultNotReadyError(RuntimeError):
    pass


class JobCapacityError(RuntimeError):
    pass


class ConversionJobManager:
    def __init__(
        self,
        *,
        converter: Callable[[str, str, str, str | None], str],
        output_dir: Path,
        history_path: Path,
        original_dir: Path | None = None,
        max_history_entries: int = 200,
        max_job_records: int = 250,
    ) -> None:
        self._converter = converter
        self._output_dir = output_dir
        self._original_dir = original_dir
        self._history_path = history_path
        self._max_history_entries = max_history_entries
        self._max_job_records = max_job_records
        self._jobs: dict[str, ConversionJob] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker(), name="documark-conversion-worker")

    async def stop(self) -> None:
        if self._worker_task is None:
            return
        self._worker_task.cancel()
        try:
            await self._worker_task
        except asyncio.CancelledError:
            pass
        self._worker_task = None

    async def submit(
        self,
        *,
        job_id: str,
        original_filename: str,
        upload_path: Path,
        lang: str,
        table_mode: str,
        record_history: bool,
    ) -> ConversionJob:
        await self.start()
        self._prune_job_records(target_count=self._max_job_records - 1)
        if len(self._jobs) >= self._max_job_records:
            raise JobCapacityError("conversion job capacity reached")
        job = ConversionJob(
            job_id=job_id,
            original_filename=original_filename,
            upload_path=upload_path,
            lang=lang,
            table_mode=table_mode,
            record_history=record_history,
        )
        self._jobs[job_id] = job
        await self._queue.put(job_id)
        return job

    def get(self, job_id: str) -> ConversionJob:
        try:
            return self._jobs[job_id]
        except KeyError as exc:
            raise JobNotFoundError(job_id) from exc

    def result(self, job_id: str) -> str:
        job = self.get(job_id)
        if job.status != "complete" or job.markdown is None:
            raise ResultNotReadyError(job.status)
        return job.markdown

    async def wait(self, job_id: str) -> ConversionJob:
        job = self.get(job_id)
        await job.done.wait()
        return job

    def cancel(self, job_id: str) -> ConversionJob:
        job = self.get(job_id)
        if job.status == "queued":
            job.cancel_requested = True
            job.set_status("cancelled")
            self._remove_upload(job)
            job.done.set()
        elif job.status in {"converting", "finalizing"}:
            job.cancel_requested = True
            job.set_status("cancelling")
        return job

    async def _worker(self) -> None:
        while True:
            job_id = await self._queue.get()
            try:
                job = self._jobs.get(job_id)
                if job is None or job.status == "cancelled":
                    continue
                await self._run_job(job)
            finally:
                self._queue.task_done()

    async def _run_job(self, job: ConversionJob) -> None:
        job.set_status("converting")
        output_path: Path | None = None
        original_path: Path | None = None
        history_written = False
        try:
            markdown = await asyncio.to_thread(
                self._converter,
                str(job.upload_path),
                job.lang,
                job.table_mode,
                job.original_filename,
            )

            if job.cancel_requested:
                job.markdown = None
                job.set_status("cancelled")
                return

            job.set_status("finalizing")
            job.markdown = markdown
            if job.cancel_requested:
                job.markdown = None
                job.set_status("cancelled")
                return
            if job.record_history:
                output_path = self._output_dir / f"{job.job_id}.md"
                if self._original_dir is not None:
                    original_path = self._original_dir / f"{job.job_id}{job.upload_path.suffix.lower()}"
                    await asyncio.to_thread(_atomic_copy_file, job.upload_path, original_path)
                await asyncio.to_thread(_atomic_write_text, output_path, markdown)
                if job.cancel_requested:
                    output_path.unlink(missing_ok=True)
                    if original_path is not None:
                        original_path.unlink(missing_ok=True)
                    job.markdown = None
                    job.set_status("cancelled")
                    return
                evicted = await asyncio.to_thread(
                    history_service.append_history,
                    self._history_path,
                    job.job_id,
                    job.original_filename,
                    job.lang,
                    job.table_mode,
                    self._max_history_entries,
                )
                history_written = True
                if job.cancel_requested:
                    await asyncio.to_thread(
                        history_service.delete_history_entry,
                        self._history_path,
                        job.job_id,
                    )
                    output_path.unlink(missing_ok=True)
                    if original_path is not None:
                        original_path.unlink(missing_ok=True)
                    job.markdown = None
                    job.set_status("cancelled")
                    return
                for evicted_job_id in evicted:
                    try:
                        (self._output_dir / f"{evicted_job_id}.md").unlink(missing_ok=True)
                    except OSError as exc:
                        logger.warning("Failed to remove evicted output %s: %s", evicted_job_id, exc)
                    self._remove_original(evicted_job_id)
            job.set_status("complete")
        except Exception:
            logger.exception("Conversion job %s failed", job.job_id)
            if history_written:
                await asyncio.to_thread(
                    history_service.delete_history_entry,
                    self._history_path,
                    job.job_id,
                )
            if output_path is not None:
                try:
                    output_path.unlink(missing_ok=True)
                except OSError as exc:
                    logger.warning("Failed to clean incomplete output %s: %s", output_path, exc)
            if original_path is not None:
                try:
                    original_path.unlink(missing_ok=True)
                except OSError as exc:
                    logger.warning("Failed to clean incomplete original %s: %s", original_path, exc)
            job.markdown = None
            job.set_status("error", error="Không thể chuyển đổi tài liệu. Vui lòng kiểm tra định dạng và thử lại.")
        finally:
            self._remove_upload(job)
            job.done.set()

    def _remove_upload(self, job: ConversionJob) -> None:
        try:
            job.upload_path.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Failed to remove upload for job %s: %s", job.job_id, exc)

    def _remove_original(self, job_id: str) -> None:
        if self._original_dir is None or not self._original_dir.is_dir():
            return
        for candidate in self._original_dir.iterdir():
            if candidate.is_file() and not candidate.is_symlink() and candidate.stem == job_id:
                try:
                    candidate.unlink()
                except OSError as exc:
                    logger.warning("Failed to remove original for job %s: %s", job_id, exc)

    def _prune_job_records(self, *, target_count: int | None = None) -> None:
        target = self._max_job_records if target_count is None else max(0, target_count)
        if len(self._jobs) <= target:
            return
        completed = [
            job
            for job in self._jobs.values()
            if job.status in {"complete", "cancelled", "error"}
        ]
        completed.sort(key=lambda item: item.updated_at)
        for job in completed[: max(0, len(self._jobs) - target)]:
            self._jobs.pop(job.job_id, None)
