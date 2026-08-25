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
_state_lock = threading.Lock()
_active_job: str | None = None
_active_count = 0
_peak_concurrency = 0


@contextmanager
def heavy_job_slot(job_name: str) -> Iterator[None]:
    """Serialize Docling/OCR/export workloads that can exhaust local RAM."""
    global _active_job, _active_count, _peak_concurrency
    with _heavy_job_lock:
        with _state_lock:
            _active_job = job_name
            _active_count += 1
            _peak_concurrency = max(_peak_concurrency, _active_count)
        try:
            yield
        finally:
            with _state_lock:
                _active_count -= 1
                if _active_count == 0:
                    _active_job = None


def scheduler_snapshot() -> SchedulerSnapshot:
    with _state_lock:
        return SchedulerSnapshot(active_job=_active_job, peak_concurrency=_peak_concurrency)


def reset_scheduler_metrics_for_test() -> None:
    global _active_job, _active_count, _peak_concurrency
    with _state_lock:
        _active_job = None
        _active_count = 0
        _peak_concurrency = 0
