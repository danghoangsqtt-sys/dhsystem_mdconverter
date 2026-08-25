"""Shared direct EasyOCR reader used by Mark Tini's region crops and Tini OCR."""

from __future__ import annotations

import threading
from typing import Any

from ...config import settings

# OCR language presets exposed to the frontend. EasyOCR needs explicit
# language codes (no "auto-detect"), so we offer a small fixed menu rather
# than a free-text field. "vi_en" (the original hardcoded behavior) stays
# the default — it's the safest choice for mixed-language documents.
OCR_LANG_PRESETS: dict[str, list[str]] = {
    "vi_en": ["vi", "en"],
    "vi": ["vi"],
    "en": ["en"],
}
DEFAULT_OCR_LANG = "vi_en"

_region_reader_cache: dict[str, Any] = {}
_region_reader_lock = threading.Lock()


def get_region_reader(lang_key: str = DEFAULT_OCR_LANG) -> Any:
    """Return the shared direct EasyOCR reader used by crops and Tini OCR."""
    if lang_key not in OCR_LANG_PRESETS:
        lang_key = DEFAULT_OCR_LANG
    with _region_reader_lock:
        reader = _region_reader_cache.get(lang_key)
        if reader is not None:
            return reader

        import easyocr

        model_dir: str | None = None
        if settings.docling_artifacts_path is not None:
            candidate = settings.docling_artifacts_path / "EasyOcr"
            if candidate.is_dir():
                model_dir = str(candidate)
        reader = easyocr.Reader(
            OCR_LANG_PRESETS[lang_key],
            gpu=False,
            model_storage_directory=model_dir,
            download_enabled=not settings.offline_mode,
        )
        _region_reader_cache[lang_key] = reader
        return reader
