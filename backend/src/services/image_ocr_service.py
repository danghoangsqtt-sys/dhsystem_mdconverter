"""Offline OCR adapter with one normalized result contract.

RapidOCR was evaluated and dropped: its bundled recognition models are
Chinese/Latin-vocabulary only (see PHASE-13 T13.3 completion notes) and
cannot produce Vietnamese diacritics at all, so EasyOCR is the sole engine
per the pre-agreed fallback rule in .viepilot/phases/phase-13-tini-suite-ecosystem/PLAN.md (Section 7).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np

from .docling_service import DEFAULT_OCR_LANG, get_region_reader
from .image_preprocessor import preprocess_image
from .resource_scheduler import heavy_job_slot

logger = logging.getLogger(__name__)


DEFAULT_IMAGE_OCR_ENGINE = "easyocr"
SUPPORTED_IMAGE_OCR_ENGINES = {"easyocr"}
class OcrEngineUnavailableError(RuntimeError):
    pass


def _get_easyocr() -> Any:
    try:
        return get_region_reader(DEFAULT_OCR_LANG)
    except Exception as exc:
        raise OcrEngineUnavailableError("Thiếu model EasyOCR offline.") from exc


def _box(box: Any) -> list[list[float]]:
    array = np.asarray(box, dtype=float).reshape(-1, 2)
    return [[round(float(x), 2), round(float(y), 2)] for x, y in array]


def _easy_lines(pixels: np.ndarray) -> list[dict[str, object]]:
    results = _get_easyocr().readtext(
        pixels,
        detail=1,
        paragraph=False,
        decoder="beamsearch",
        canvas_size=3200,
        mag_ratio=1.5,
    )
    return [
        {"text": str(text).strip(), "confidence": round(float(score), 5), "box": _box(box)}
        for box, text, score in results
        if str(text).strip()
    ]


def recognize_image(
    path: Path,
    *,
    filename: str,
    index: int,
    preset: str = "balanced",
    engine: str = DEFAULT_IMAGE_OCR_ENGINE,
) -> dict[str, object]:
    if engine not in SUPPORTED_IMAGE_OCR_ENGINES:
        raise ValueError(f"Engine OCR không hợp lệ: {engine}")
    processed = preprocess_image(path, preset)
    with heavy_job_slot(f"image-ocr:{engine}"):
        lines = _easy_lines(processed.pixels)
    text = "\n".join(str(line["text"]) for line in lines)
    confidence = (
        round(sum(float(line["confidence"]) for line in lines) / len(lines), 5)
        if lines
        else 0.0
    )
    return {
        "index": index,
        "filename": filename,
        "width": processed.width,
        "height": processed.height,
        "engine": engine,
        "recipe": list(processed.recipe),
        "confidence": confidence,
        "lines": lines,
        "text": text,
        "error": None,
    }


def warmup_image_ocr() -> None:
    """Pre-warm the EasyOCR engine at startup to avoid first-request latency."""
    try:
        _get_easyocr()
        logger.info("Image OCR engine warmed up.")
    except Exception as e:
        logger.warning(f"Image OCR warm-up failed (will retry on first use): {e}")
