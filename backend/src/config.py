"""Runtime configuration for the local Mark Tini backend.

All values are resolved once at process start. Electron supplies production
paths and the API token through environment variables; command-line/dev runs
fall back to safe project-local defaults.
"""

from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_TRUSTED_ORIGINS = (
    "http://127.0.0.1:8088",
    "http://localhost:8088",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
)
DEFAULT_CORS_ORIGINS = (*DEFAULT_TRUSTED_ORIGINS, "null")
DEFAULT_MAX_UPLOAD_MIB = 100


def _read_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _read_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _read_origins(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.getenv(name)
    if not raw:
        return default
    values = tuple(part.strip().rstrip("/") for part in raw.split(",") if part.strip())
    return values or default


def _read_str(name: str, default: str | None) -> str | None:
    raw = os.getenv(name)
    if raw is None:
        return default
    stripped = raw.strip()
    return stripped or default


def _read_log_level(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    level = logging.getLevelName(raw.strip().upper())
    return level if isinstance(level, int) else default


@dataclass(frozen=True)
class Settings:
    project_root: Path
    data_dir: Path
    upload_dir: Path
    output_dir: Path
    history_path: Path
    frontend_dist_dir: Path
    log_dir: Path
    log_level: int
    api_token: str
    trusted_origins: tuple[str, ...]
    cors_origins: tuple[str, ...]
    max_upload_bytes: int
    max_history_entries: int
    max_job_records: int
    offline_mode: bool
    docling_artifacts_path: Path | None
    ollama_base_url: str
    ollama_model: str | None
    translation_model_id: str
    translation_model_path: Path | None


def load_settings() -> Settings:
    data_dir = Path(os.getenv("DOCUMARK_DATA_DIR", str(PROJECT_ROOT / "data"))).resolve()
    artifacts_raw = os.getenv("DOCLING_ARTIFACTS_PATH")
    artifacts_path = Path(artifacts_raw).resolve() if artifacts_raw else None
    translation_model_raw = os.getenv("DOCUMARK_TRANSLATION_MODEL_PATH")
    translation_model_path = Path(translation_model_raw).resolve() if translation_model_raw else None
    trusted_origins = _read_origins("DOCUMARK_TRUSTED_ORIGINS", DEFAULT_TRUSTED_ORIGINS)
    cors_origins = _read_origins("DOCUMARK_CORS_ORIGINS", (*trusted_origins, "null"))

    return Settings(
        project_root=PROJECT_ROOT,
        data_dir=data_dir,
        upload_dir=data_dir / "uploads",
        output_dir=data_dir / "outputs",
        history_path=data_dir / "history.json",
        frontend_dist_dir=PROJECT_ROOT / "frontend" / "dist",
        log_dir=data_dir / "logs",
        log_level=_read_log_level("DOCUMARK_LOG_LEVEL", logging.INFO),
        api_token=os.getenv("DOCUMARK_API_TOKEN") or secrets.token_urlsafe(32),
        trusted_origins=trusted_origins,
        cors_origins=cors_origins,
        max_upload_bytes=_read_positive_int("DOCUMARK_MAX_UPLOAD_MIB", DEFAULT_MAX_UPLOAD_MIB)
        * 1024
        * 1024,
        max_history_entries=_read_positive_int("DOCUMARK_MAX_HISTORY", 200),
        max_job_records=_read_positive_int("DOCUMARK_MAX_JOB_RECORDS", 250),
        offline_mode=_read_bool("DOCUMARK_OFFLINE_MODE"),
        docling_artifacts_path=artifacts_path,
        ollama_base_url=_read_str("DOCUMARK_OLLAMA_URL", "http://127.0.0.1:11434"),
        ollama_model=_read_str("DOCUMARK_OLLAMA_MODEL", "qwen2.5:3b"),
        translation_model_id=_read_str("DOCUMARK_TRANSLATION_MODEL", "VietAI/envit5-translation")
        or "VietAI/envit5-translation",
        translation_model_path=translation_model_path,
    )


settings = load_settings()

# Hugging Face/Transformers read these flags at import time, so they must be
# set before any transformers-consuming module (docling_service,
# translation_service) is imported — not inside either of those modules,
# since import order between them isn't guaranteed. This module is imported
# first by every service via `from ..config import settings`.
if settings.offline_mode:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

