import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_history_lock = threading.RLock()


def _load_history_unlocked(history_path: Path) -> list[dict[str, Any]]:
    """Load history without locking. Caller must hold _history_lock."""
    if not history_path.exists():
        return []
    try:
        with open(history_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to read history file, starting fresh: {e}")
        return []


def _save_history_unlocked(history_path: Path, entries: list[dict[str, Any]]) -> None:
    """Persist history without locking. Caller must hold _history_lock."""
    history_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = history_path.with_suffix(f"{history_path.suffix}.tmp-{os.getpid()}-{threading.get_ident()}")
    try:
        with open(temp_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, history_path)
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


def append_history(
    history_path: Path,
    job_id: str,
    original_filename: str,
    lang: str,
    table_mode: str,
    max_entries: int,
) -> list[str]:
    entry = {
        "job_id": job_id,
        "original_filename": original_filename,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "lang": lang,
        "table_mode": table_mode,
    }
    with _history_lock:
        entries = _load_history_unlocked(history_path)
        entries.insert(0, entry)
        evicted = entries[max_entries:]
        del entries[max_entries:]
        _save_history_unlocked(history_path, entries)
    return [str(item.get("job_id")) for item in evicted if item.get("job_id")]


def list_history(history_path: Path) -> list[dict[str, Any]]:
    with _history_lock:
        return _load_history_unlocked(history_path)


def get_history_entry(history_path: Path, job_id: str) -> Optional[dict[str, Any]]:
    with _history_lock:
        entries = _load_history_unlocked(history_path)
    for entry in entries:
        if entry.get("job_id") == job_id:
            return entry
    return None


def delete_history_entry(history_path: Path, job_id: str) -> bool:
    with _history_lock:
        entries = _load_history_unlocked(history_path)
        remaining = [e for e in entries if e.get("job_id") != job_id]
        if len(remaining) == len(entries):
            return False
        _save_history_unlocked(history_path, remaining)
    return True
