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

from .image_preprocessor import preprocess_image
from ..shared.easyocr_reader import DEFAULT_OCR_LANG, get_region_reader
from ..shared.resource_scheduler import heavy_job_slot

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


def _line_bbox(box: list[list[float]]) -> tuple[float, float, float, float]:
    xs = [point[0] for point in box]
    ys = [point[1] for point in box]
    return min(xs), min(ys), max(xs), max(ys)


def _overlap_ratio(
    a: tuple[float, float, float, float], b: tuple[float, float, float, float]
) -> float:
    """Intersection area over the *smaller* box's area.

    EasyOCR's detector occasionally emits a coarse box and a finer box nested
    inside (or heavily overlapping) it for the same text, e.g. from internal
    multi-scale detection. Plain IoU stays low when one box is much smaller
    than the other, so it misses that case; dividing by the smaller area
    catches near-total containment too.
    """
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    intersection = (ix1 - ix0) * (iy1 - iy0)
    smaller_area = min((ax1 - ax0) * (ay1 - ay0), (bx1 - bx0) * (by1 - by0))
    return intersection / smaller_area if smaller_area > 0 else 0.0


_DUPLICATE_OVERLAP_THRESHOLD = 0.6
_ROW_GAP_FACTOR = 0.6


def _cluster_rows(kept: list[int], boxes: list[tuple[float, float, float, float]]) -> list[list[int]]:
    """Group boxes into visual rows by y-center proximity (single-linkage).

    A fixed-bucket `round(y / row_height)` scheme breaks as soon as a row's
    center sits near a bucket boundary — it was tried and produced a still-
    scrambled order on a real test page. Clustering against each row's
    running-mean y (not a global grid) is robust to that.
    """
    if not kept:
        return []
    heights = sorted(max(1.0, boxes[i][3] - boxes[i][1]) for i in kept)
    row_gap = heights[len(heights) // 2] * _ROW_GAP_FACTOR

    by_y = sorted(kept, key=lambda i: (boxes[i][1] + boxes[i][3]) / 2)
    rows: list[list[int]] = []
    row_y_sum = 0.0
    row_count = 0
    for i in by_y:
        y_center = (boxes[i][1] + boxes[i][3]) / 2
        if rows and (y_center - row_y_sum / row_count) > row_gap:
            rows.append([])
            row_y_sum = 0.0
            row_count = 0
        if not rows:
            rows.append([])
        rows[-1].append(i)
        row_y_sum += y_center
        row_count += 1
    return rows


def _dedupe_and_order(lines: list[dict[str, object]]) -> list[dict[str, object]]:
    """Drop near-duplicate detections and sort into top-to-bottom reading order.

    EasyOCR's raw `readtext()` output (with `paragraph=False`) is one
    word/phrase-level box per detection, in an arbitrary internal order that
    is neither deduplicated nor sorted by position. On a dense real
    government-document test this made heavily repeated legal boilerplate
    ("... khoa học và công nghệ", "... thăng hạng ...") look like duplicate
    re-detection at a glance — it wasn't: cross-checking box x/y coordinates
    showed each fragment sits at a distinct position, e.g. one fragment
    reading "Tự" landed exactly between existing fragments "Độc lập -" and
    "'do", filling in the missing middle word of "Độc lập - Tự do - Hạnh
    phúc" rather than repeating either. The real, measurable defect is the
    missing sort; `paragraph=True` was also tried as a fix and rejected — it
    collapses the entire page into a single block of run-on text with no
    line breaks and discards per-fragment confidence entirely.
    """
    if not lines:
        return lines
    boxes = [_line_bbox(line["box"]) for line in lines]  # type: ignore[arg-type]

    by_confidence = sorted(range(len(lines)), key=lambda i: lines[i]["confidence"], reverse=True)
    kept: list[int] = []
    for i in by_confidence:
        if any(_overlap_ratio(boxes[i], boxes[j]) > _DUPLICATE_OVERLAP_THRESHOLD for j in kept):
            continue
        kept.append(i)

    ordered: list[int] = []
    for row in _cluster_rows(kept, boxes):
        row.sort(key=lambda i: boxes[i][0])
        ordered.extend(row)

    return [lines[i] for i in ordered]


def _easy_lines(pixels: np.ndarray) -> list[dict[str, object]]:
    results = _get_easyocr().readtext(
        pixels,
        detail=1,
        paragraph=False,
        decoder="beamsearch",
        canvas_size=3200,
        mag_ratio=2.0,
        text_threshold=0.3,
        low_text=0.2,
        link_threshold=0.2,
    )
    lines = [
        {"text": str(text).strip(), "confidence": round(float(score), 5), "box": _box(box)}
        for box, text, score in results
        if str(text).strip()
    ]
    return _dedupe_and_order(lines)


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
