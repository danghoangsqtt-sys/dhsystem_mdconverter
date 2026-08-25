"""Safe, non-destructive preprocessing for phone-captured document images."""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps


MAX_IMAGE_PIXELS = 50_000_000
MAX_IMAGE_DIMENSION = 12_000
SUPPORTED_PRESETS = {"original", "balanced", "high_contrast"}
MIN_OCR_WIDTH = 1600


class UnsafeImageError(ValueError):
    """Raised when an image is malformed or unsafe to decode."""


@dataclass(frozen=True)
class PreprocessedImage:
    pixels: np.ndarray
    width: int
    height: int
    recipe: tuple[str, ...]


def _decode_or_raise(path: Path) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as probe:
                width, height = probe.size
                if (
                    width <= 0
                    or height <= 0
                    or width > MAX_IMAGE_DIMENSION
                    or height > MAX_IMAGE_DIMENSION
                    or width * height > MAX_IMAGE_PIXELS
                ):
                    raise UnsafeImageError(
                        f"Ảnh vượt giới hạn {MAX_IMAGE_DIMENSION}px hoặc {MAX_IMAGE_PIXELS:,} pixels."
                    )
                probe.verify()
            with Image.open(path) as source:
                corrected = ImageOps.exif_transpose(source)
                corrected.load()
                return corrected.convert("RGB")
    except UnsafeImageError:
        raise
    except (OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise UnsafeImageError("Ảnh hỏng hoặc không thể giải mã an toàn.") from exc


def _order_quad(points: np.ndarray) -> np.ndarray:
    ordered = np.zeros((4, 2), dtype=np.float32)
    sums = points.sum(axis=1)
    differences = np.diff(points, axis=1).reshape(-1)
    ordered[0] = points[np.argmin(sums)]
    ordered[2] = points[np.argmax(sums)]
    ordered[1] = points[np.argmin(differences)]
    ordered[3] = points[np.argmax(differences)]
    return ordered


def _correct_perspective(image: np.ndarray) -> tuple[np.ndarray, bool]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 60, 180)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    area = image.shape[0] * image.shape[1]
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:10]:
        perimeter = cv2.arcLength(contour, True)
        polygon = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(polygon) != 4 or cv2.contourArea(polygon) < area * 0.35:
            continue
        quad = _order_quad(polygon.reshape(4, 2).astype(np.float32))
        top_width = np.linalg.norm(quad[1] - quad[0])
        bottom_width = np.linalg.norm(quad[2] - quad[3])
        left_height = np.linalg.norm(quad[3] - quad[0])
        right_height = np.linalg.norm(quad[2] - quad[1])
        target_width = max(1, int(max(top_width, bottom_width)))
        target_height = max(1, int(max(left_height, right_height)))
        if target_width * target_height < area * 0.3:
            continue
        destination = np.array(
            [[0, 0], [target_width - 1, 0], [target_width - 1, target_height - 1], [0, target_height - 1]],
            dtype=np.float32,
        )
        matrix = cv2.getPerspectiveTransform(quad, destination)
        return cv2.warpPerspective(image, matrix, (target_width, target_height)), True
    return image, False


def _ensure_min_resolution(image: np.ndarray, min_width: int = MIN_OCR_WIDTH) -> tuple[np.ndarray, float]:
    """Upscale a source image that's too small for reliable dense-text OCR.

    EasyOCR's detector magnifies its own working canvas internally
    (`mag_ratio`/`canvas_size`), but recognition crops are always cut from
    the *source* array passed to `readtext()`, not from that internal
    canvas — so a small source starves recognition of real detail no matter
    how the detector is tuned. A phone photo of a full page can still look
    "large" in absolute pixels while under 100 DPI once spread across the
    whole page; that's a distinct problem from Mark Tini's small
    PDF-viewer-crop upscaling in `docling_service.upscale_region_image`,
    which targets crops that are inherently zoomed in already. Never
    downscales, and caps the result at MAX_IMAGE_PIXELS so an extreme
    aspect ratio can't blow past the same safety ceiling enforced on input.
    """
    height, width = image.shape[:2]
    if width >= min_width:
        return image, 1.0
    scale = min_width / width
    if (width * scale) * (height * scale) > MAX_IMAGE_PIXELS:
        scale = (MAX_IMAGE_PIXELS / (width * height)) ** 0.5
    if scale <= 1.0:
        return image, 1.0
    new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    resized = cv2.resize(image, new_size, interpolation=cv2.INTER_LANCZOS4)
    return resized, scale


def _deskew(image: np.ndarray) -> tuple[np.ndarray, float]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    coordinates = np.column_stack(np.where(binary > 0))
    if len(coordinates) < 100:
        return image, 0.0
    angle = cv2.minAreaRect(coordinates[:, ::-1].astype(np.float32))[-1]
    angle = -(90 + angle) if angle < -45 else -angle
    if abs(angle) < 0.35 or abs(angle) > 8:
        return image, 0.0
    height, width = image.shape[:2]
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
    corrected = cv2.warpAffine(
        image,
        matrix,
        (width, height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return corrected, float(round(angle, 2))


def preprocess_image(path: Path, preset: str = "balanced") -> PreprocessedImage:
    if preset not in SUPPORTED_PRESETS:
        raise ValueError(f"Preset ảnh không hợp lệ: {preset}")

    decoded = _decode_or_raise(path)
    image = cv2.cvtColor(np.asarray(decoded), cv2.COLOR_RGB2BGR)
    recipe: list[str] = ["safe-decode", "exif-transpose"]
    if preset == "original":
        return PreprocessedImage(image, image.shape[1], image.shape[0], tuple(recipe))

    image, upscale_factor = _ensure_min_resolution(image)
    if upscale_factor > 1.0:
        recipe.append(f"upscale:{upscale_factor:.2f}x")

    image, perspective_applied = _correct_perspective(image)
    if perspective_applied:
        recipe.append("perspective-correction")
    image, angle = _deskew(image)
    if angle:
        recipe.append(f"deskew:{angle}")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    background = cv2.GaussianBlur(gray, (0, 0), sigmaX=21, sigmaY=21)
    normalized = cv2.divide(gray, background, scale=255)
    clip_limit = 3.0 if preset == "high_contrast" else 2.0
    enhanced = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8)).apply(normalized)
    if preset == "high_contrast":
        enhanced = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
        recipe.append("otsu-binarize")
    recipe.extend(("shadow-normalize", f"clahe:{clip_limit:g}"))
    result = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
    return PreprocessedImage(result, result.shape[1], result.shape[0], tuple(recipe))
