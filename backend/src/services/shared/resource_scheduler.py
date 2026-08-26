"""Process-wide scheduler for memory-heavy local ML work."""

from __future__ import annotations

import threading
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator


@dataclass(frozen=True)
class SchedulerSnapshot:
    active_job: str | None
    peak_concurrency: int


_heavy_job_lock = threading.RLock()
_active_job: str | None = None
_active_count = 0
_peak_concurrency = 0


@contextmanager
def heavy_job_slot(job_name: str) -> Iterator[None]:
    """Serialize Docling/OCR/export workloads that can exhaust local RAM.

    Holds the lock for the entire duration of the context manager to ensure
    strict serialization of heavy ML jobs. This prevents race conditions where
    two jobs could both see the counter at 0 and both proceed concurrently.
    """
    global _active_job, _active_count, _peak_concurrency
    with _heavy_job_lock:
        _active_job = job_name
        _active_count += 1
        _peak_concurrency = max(_peak_concurrency, _active_count)
        try:
            yield
        finally:
            _active_count -= 1
            if _active_count == 0:
                _active_job = None


def scheduler_snapshot() -> SchedulerSnapshot:
    with _heavy_job_lock:
        return SchedulerSnapshot(active_job=_active_job, peak_concurrency=_peak_concurrency)


def reset_scheduler_metrics_for_test() -> None:
    global _active_job, _active_count, _peak_concurrency
    with _heavy_job_lock:
        _active_job = None
        _active_count = 0
        _peak_concurrency = 0
